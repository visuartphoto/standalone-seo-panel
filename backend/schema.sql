-- Standalone SEO Panel — multi-tenant schema
-- Every tenant row carries workspace_id (and site_id where applicable).
-- Row-level security isolates tenants; the service role runs scheduled jobs.

create extension if not exists pgcrypto;

-- Tenants
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Membership and roles: owner, admin, analyst
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'analyst')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Websites inside a workspace. allowed_paths restricts which public routes
-- may be captured/analyzed; an empty array means all public routes are allowed.
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  name text not null default '',
  allowed_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, domain)
);

-- Tenant-scoped key/value store for all SEO data (pages, drafts, events,
-- credentials, monitoring state). Keys are namespaced per site.
create table if not exists public.seo_kv (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, site_id, key)
);

-- Per-workspace advisory lock for exclusive SEO actions.
create table if not exists public.seo_locks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner text not null,
  until_ts numeric not null
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.sites enable row level security;
alter table public.seo_kv enable row level security;
alter table public.seo_locks enable row level security;

-- Workspace ids the current user belongs to.
create or replace function public.my_workspace_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- Workspaces: members only.
create policy "members read their workspaces" on public.workspaces
  for select using (id in (select public.my_workspace_ids()));

-- Members: visible inside own workspaces.
create policy "members read members of their workspaces" on public.workspace_members
  for select using (workspace_id in (select public.my_workspace_ids()));

-- Sites: visible inside own workspaces.
create policy "members read sites of their workspaces" on public.sites
  for select using (workspace_id in (select public.my_workspace_ids()));

-- SEO data: full access inside own workspaces. The browser never receives
-- provider credentials; those rows are only readable by the service role.
create policy "members access seo data of their workspaces" on public.seo_kv
  for all using (workspace_id in (select public.my_workspace_ids()))
  with check (workspace_id in (select public.my_workspace_ids()));

-- Locks are managed by the service role only.
revoke all on public.seo_locks from anon, authenticated;
grant all on public.seo_locks to service_role;

-- Exclusive per-workspace lock, expires after 300 seconds.
create or replace function public.seo_lock(owner_id text, ws uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare acquired text;
begin
  insert into seo_locks(workspace_id, owner, until_ts)
  values (ws, owner_id, extract(epoch from now()) + 300)
  on conflict (workspace_id) do update set owner = excluded.owner, until_ts = excluded.until_ts
  where seo_locks.until_ts < extract(epoch from now())
  returning owner into acquired;
  return acquired is not null;
end;
$$;
revoke all on function public.seo_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.seo_lock(text, uuid) to service_role;
