import { Hono } from 'npm:hono';

// One-click Supabase setup: the operator enters the project URL and the
// service role key, and this endpoint creates the whole SEO Panel schema
// (tables, row-level security, functions) through Supabase's pg-meta API.
// The endpoint is public on purpose: the database is empty before the first
// setup, so no login can exist yet. The service role key itself is the
// credential that authorizes the operation.
const schemaStatements: string[] = [
  `create extension if not exists pgcrypto;`,
  `create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    created_at timestamptz not null default now()
  );`,
  `create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'analyst')),
    created_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
  );`,
  `create table if not exists public.sites (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    domain text not null,
    name text not null default '',
    allowed_paths text[] not null default '{}',
    created_at timestamptz not null default now(),
    unique (workspace_id, domain)
  );`,
  `create table if not exists public.seo_kv (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    site_id uuid not null references public.sites(id) on delete cascade,
    key text not null,
    value jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (workspace_id, site_id, key)
  );`,
  `create table if not exists public.seo_locks (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    owner text not null,
    until_ts numeric not null
  );`,
  `alter table public.workspaces enable row level security;`,
  `alter table public.workspace_members enable row level security;`,
  `alter table public.sites enable row level security;`,
  `alter table public.seo_kv enable row level security;`,
  `alter table public.seo_locks enable row level security;`,
  `create or replace function public.my_workspace_ids()
    returns setof uuid language sql stable security definer set search_path = public as $$
    select workspace_id from public.workspace_members where user_id = auth.uid();
  $$;`,
  `create policy "members read their workspaces" on public.workspaces
    for select using (id in (select public.my_workspace_ids()));`,
  `create policy "members read members of their workspaces" on public.workspace_members
    for select using (workspace_id in (select public.my_workspace_ids()));`,
  `create policy "members read sites of their workspaces" on public.sites
    for select using (workspace_id in (select public.my_workspace_ids()));`,
  `create policy "members access seo data of their workspaces" on public.seo_kv
    for all using (workspace_id in (select public.my_workspace_ids()))
    with check (workspace_id in (select public.my_workspace_ids()));`,
  `revoke all on public.seo_locks from anon, authenticated;`,
  `grant all on public.seo_locks to service_role;`,
  `create or replace function public.seo_lock(owner_id text, ws uuid)
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
  $$;`,
  `revoke all on function public.seo_lock(text, uuid) from public, anon, authenticated;`,
  `grant execute on function public.seo_lock(text, uuid) to service_role;`,
];

const requiredTables = ['workspaces', 'workspace_members', 'sites', 'seo_kv', 'seo_locks'];

export function registerSetupRoute(app: Hono) {
  app.post('/api/setup/supabase', async (c) => {
    const b = await c.req.json();
    const url = typeof b.url === 'string' ? b.url.trim().replace(/\/$/, '') : '';
    const key = typeof b.serviceRoleKey === 'string' ? b.serviceRoleKey.trim() : '';
    let host: string;
    try { host = new URL(url).hostname; } catch { return c.json({ error: 'Bitte eine gültige Supabase-Projekt-URL angeben (z. B. https://abcd1234.supabase.co).' }, 400); }
    if (!host.endsWith('.supabase.co')) return c.json({ error: 'Die URL muss auf eine Supabase-Instanz zeigen (…supabase.co).' }, 400);
    if (!/^sb_(secret_)?[A-Za-z0-9_\-]+$/.test(key) && !/^eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(key)) return c.json({ error: 'Bitte den Service-Role-Key (geheimer Schlüssel) aus den Supabase-Projekteinstellungen einfügen.' }, 400);

    const pg = async (query: string) => {
      const res = await fetch(`${url}/pg/query`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.message || ''; } catch { /* keep generic */ }
        if (res.status === 401 || res.status === 403) throw new Error('Der Service-Role-Key wurde abgelehnt. Bitte den geheimen Schlüssel aus Supabase → Project Settings → API prüfen.');
        throw new Error(`Supabase hat die Anfrage abgelehnt (HTTP ${res.status})${detail ? ': ' + detail : ''}.`);
      }
      return res.json();
    };

    let database = '';
    try {
      const rows = await pg('select current_database() as db');
      database = rows?.[0]?.db || '';
    } catch (e: any) { return c.json({ error: e.message }, 400); }

    const errors: string[] = [];
    for (const statement of schemaStatements) {
      try { await pg(statement); } catch (e: any) { errors.push(e.message); }
    }

    let tables: string[] = [];
    try {
      const rows = await pg(`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('${requiredTables.join("','")}')`);
      tables = (rows || []).map((r: any) => r.table_name).sort();
    } catch { /* verification failed, reported below */ }

    const missing = requiredTables.filter((t) => !tables.includes(t));
    if (errors.length || missing.length) {
      return c.json({ ok: false, database, errors, missing, message: 'Die Einrichtung ist unvollständig. Bitte die Fehlermeldungen prüfen und erneut versuchen.' }, 500);
    }
    return c.json({ ok: true, database, tables, message: 'SEO-Panel-Datenbank erfolgreich eingerichtet. Du kannst dich jetzt registrieren und anmelden.' });
  });

  app.get('/api/setup/status', async (c) => {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !key) return c.json({ ok: false, message: 'Backend ist nicht mit Supabase konfiguriert.' });
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/pg/query`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('${requiredTables.join("','")}')` }), signal: AbortSignal.timeout(15000) });
      if (!res.ok) return c.json({ ok: false, message: 'Verbindung zur konfigurierten Datenbank fehlgeschlagen.' });
      const rows = await res.json();
      const tables = (rows || []).map((r: any) => r.table_name).sort();
      const missing = requiredTables.filter((t) => !tables.includes(t));
      return c.json({ ok: missing.length === 0, tables, missing, message: missing.length ? 'Datenbank ist noch nicht eingerichtet.' : 'Datenbank ist vollständig eingerichtet.' });
    } catch { return c.json({ ok: false, message: 'Verbindung zur konfigurierten Datenbank fehlgeschlagen.' }); }
  });
}
