# Multi-tenant backend

A tenant-isolated backend for the Standalone SEO Panel. Every workspace owns
its sites, users, provider credentials, pages, scans, rankings and events.
Row-level security and server-side membership checks keep tenants apart; the
service role only runs scheduled jobs, never browser requests.

## Stack

- Deno + Hono
- Supabase (PostgreSQL + Auth)
- Abacus.ai RouteLLM (OpenAI-kompatible API, intelligentes Modell-Routing, Websuche) and DataForSEO (organic SERP) as providers

## Files

| File | Purpose |
| --- | --- |
| `schema.sql` | Workspaces, sites, members, tenant-scoped KV store, RLS, per-workspace lock |
| `server.ts` | App entry, CORS, auth + workspace middleware, route registration |
| `auth.ts` | Self-service signup, login, invitations, member and site management |
| `seo-routes.ts` | Page capture, audits, AI analysis, publish/rollback, settings, credentials |
| `seo-monitoring.ts` | Health scans, Google ranking measurements, competitor context |
| `seo-costs.ts` | Abacus.ai/DataForSEO cost estimation from reported usage |
| `jobs.ts` | Scheduled-job entry point that iterates tenants without crossing boundaries |
| `setup.ts` | One-click Supabase setup: creates the whole schema via the pg-meta API |

## Setup

### Option A — one-click from the panel (recommended)

1. Create a Supabase project (free tier is enough).
2. Deploy the backend with Deno Deploy (or any Deno host) and set the
   environment variables from `.env.example`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SEO_ENCRYPTION_KEY` — 32 random bytes, base64 (AES-GCM for provider keys)
   - `SEO_JOB_KEY` — shared secret for the `/api/cron` endpoint
3. Open the panel → **Verbindung** → **Supabase-Einrichtung**, paste the
   Supabase project URL and the service role key, and click
   **Supabase einrichten**. The backend creates all tables, row-level
   security policies and functions automatically — no SQL editor needed.
4. Register your account in the panel. Signup creates your workspace and the
   first site automatically.

### Option B — manual

1. Create a Supabase project and run `schema.sql` in the SQL editor.
2. Deploy and set the environment variables as above.

## Integrating the panel into your own websites

The panel is a central multi-tenant service. Your websites do **not** need
any changes to their own Supabase databases — they only embed the widget.

1. In the panel, add each website as a site (owner/admin): the site's domain
   and, optionally, an allow-list of public paths.
2. Embed the widget in the authenticated admin area of each website:

```tsx
import SeoPanel from './widget/SeoPanel';
import './widget/seo.css';

<SeoPanel
  accessToken={session.access_token}
  workspaceId={workspace.id}
  siteName={window.location.hostname}
  language="de"
  darkMode={false}
/>
```

3. Set `VITE_SEO_API_URL` to the central backend URL ending in `/api/seo`.

The widget talks to the central backend only; the website's own Supabase
database and its users stay untouched. If you prefer full data isolation per
website, run a separate backend instance per website — each with its own
Supabase project — and embed the widget with that instance's URL.

## Tenant isolation

- Every row in `seo_kv` carries `workspace_id` and `site_id`; the primary key
  is `(workspace_id, site_id, key)`.
- RLS policies expose data only to members of the same workspace.
- The middleware resolves the user from the JWT and verifies membership for
  the requested workspace on every private request. Changing an id in a
  request never grants access to another tenant.
- Provider credentials are encrypted at rest per site and never leave the
  backend.
- Scheduled jobs run with the service role but iterate per workspace/site and
  reuse the same tenant-scoped handlers.

## API overview

Public: `POST /api/setup/supabase`, `GET /api/setup/status`,
`POST /api/auth/signup`, `POST /api/auth/login`.

Private (Bearer token + `X-Workspace-Id` header):

- `GET /api/me` — workspaces, roles, sites
- `POST /api/workspaces/:id/invite`, `GET|DELETE /api/workspaces/:id/members`
- `POST /api/workspaces/:id/sites`
- `GET /api/seo/status`, `PUT /api/seo/settings`
- `PUT|DELETE /api/seo/credential`, `POST /api/seo/test`
- `POST /api/seo/capture`, `PUT /api/seo/page`
- `POST /api/seo/analyze`, `POST /api/seo/publish`, `POST /api/seo/rollback`
- `GET /api/seo/published`, `GET /api/seo/site-files`
- `GET /api/seo/monitor/status`, `PUT /api/seo/monitor/config`
- `PUT|DELETE /api/seo/monitor/credential`, `POST /api/seo/monitor/test`
- `POST /api/seo/monitor/rank`, `POST /api/seo/monitor/scan`

Scheduled: `POST /api/cron` (header `X-SEO-Job-Key`).
