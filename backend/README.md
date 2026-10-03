# Multi-tenant backend

A tenant-isolated backend for the Standalone SEO Panel. Every workspace owns
its sites, users, provider credentials, pages, scans, rankings and events.
Row-level security and server-side membership checks keep tenants apart; the
service role only runs scheduled jobs, never browser requests.

## Stack

- Deno + Hono
- Supabase (PostgreSQL + Auth)
- OpenAI (Responses API, web search) and DataForSEO (organic SERP) as providers

## Files

| File | Purpose |
| --- | --- |
| `schema.sql` | Workspaces, sites, members, tenant-scoped KV store, RLS, per-workspace lock |
| `server.ts` | App entry, CORS, auth + workspace middleware, route registration |
| `auth.ts` | Self-service signup, login, invitations, member and site management |
| `seo-routes.ts` | Page capture, audits, AI analysis, publish/rollback, settings, credentials |
| `seo-monitoring.ts` | Health scans, Google ranking measurements, competitor context |
| `seo-costs.ts` | OpenAI/DataForSEO cost estimation from reported usage |
| `jobs.ts` | Scheduled-job entry point that iterates tenants without crossing boundaries |

## Setup

1. Create a Supabase project and run `schema.sql` in the SQL editor.
2. Deploy with Deno Deploy (or any Deno host) and set the environment
   variables from `.env.example`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SEO_ENCRYPTION_KEY` — 32 random bytes, base64 (AES-GCM for provider keys)
   - `SEO_JOB_KEY` — shared secret for the `/api/cron` endpoint
3. Point the widget at the API with `VITE_SEO_API_URL` and pass the
   `workspaceId` prop together with the host session token.

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

Public: `POST /api/auth/signup`, `POST /api/auth/login`.

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
