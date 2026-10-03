# Standalone SEO Panel — Project Brief

## English project description

A reusable, embeddable SEO dashboard for any website. Bring your own OpenAI and DataForSEO credentials to audit pages, monitor rankings and competitors, track costs, and manage SEO from one secure admin widget.

## Project goal

Turn the SEO dashboard into an independent product that website owners and developers can install on multiple websites. A small floating button opens a secure side panel inside the site's existing admin area. Each installation connects its own domain, users, provider accounts, tracked keywords, and preferences.

The panel should work as a reusable widget rather than requiring each site to build another admin dashboard. The host website supplies the authenticated admin session and a small integration adapter. A separately hosted backend stores workspace settings and runs scheduled jobs.

## What the product does

- Technical and content checks for public pages, with clear measurements and an issue history.
- OpenAI-assisted SEO suggestions, with provider usage and estimated cost shown per request.
- DataForSEO organic Google ranking measurements, local search profiles, competitor results, and exact reported cost per request.
- Editable keywords mapped to the most relevant page, with a configurable interval and daily spend limits.
- robots.txt and sitemap generation from successfully verified public URLs, with safeguards for existing files.
- Per-site provider credentials, usage history, users, roles, and scheduled-job settings.
- A small embeddable React widget and a documented API for other frontend stacks.
- A demo sign-in and sample dashboard for reviewers; demo data is not connected to paid APIs.

## Demo access

The local demo in `index.html` demonstrates the login and dashboard flow. Use `demo@seopanel.dev` / `DemoSEO2026!`. It stores no account, uses illustrative sample data, and sends no OpenAI or DataForSEO requests. Do not deploy these demo credentials as a production account.

## Multi-tenant architecture required for a public release

1. **Widget:** React component mounted in an existing authenticated admin area. It receives a short-lived host-session token, site label, theme, and language. An adapter supports other frameworks or an iframe installation.
2. **Identity and permissions:** A standalone installation can use managed authentication, or delegate identity to the host website. Every private API request resolves a user and workspace on the server. Roles include workspace owner, administrator, and read-only analyst.
3. **Workspace boundary:** Store every site, setting, API credential, keyword, scan, event, and cost record with an immutable `workspace_id` and `site_id`. Enforce row-level policies and verify membership in backend handlers. A user must never access another workspace by changing an ID in a request.
4. **Provider gateway:** OpenAI and DataForSEO requests run only on the backend. Encrypt credentials at rest with a server-side key-management service, redact secrets from logs, allow owners to rotate/delete keys, and never send a provider secret to the browser.
5. **Jobs and limits:** A queue performs scheduled health scans and ranking measurements. Enforce per-site intervals, per-workspace daily budgets, retries, and provider request limits server-side. Show reported charges separately from estimates.
6. **Website files:** Generate robots.txt and sitemap.xml using verified public routes. Provide an API, a small installation script, or host-specific adapter so the website can publish those files. Never claim a successful publication until the host confirms it.
7. **GitHub:** Use the repository for source, issue tracking, releases, and sanitized example configuration. Production website content, API keys, customer data, scans, ranking history, and database snapshots stay in private storage, never in Git.

## Security and readiness boundary

The `backend/` folder is a tenant-isolated multi-tenant backend: workspaces,
sites, members, row-level security, self-service signup, invitations, and
per-workspace provider credentials. Before connecting independent customers,
review the workspace model, tenant-scoped database policies, signup/invitation
flows, billing/quotas, key rotation, audit logs, and cross-tenant access
checks, and add automated integration tests that prove isolation.

The component in `src/widget/` is host-agnostic and its API URL is
configurable. The host app is still responsible for authenticating the user
and only mounting the widget for authorized administrators. Public demo
endpoints must never accept real provider keys.

## GitHub repository page

Suggested repository name: `standalone-seo-panel`.

Suggested About description: use the English description at the beginning of this file (also copied into `README.md`). Suggested topics: `seo`, `dashboard`, `react-widget`, `openai`, `dataforseo`, `technical-seo`, `multi-tenant`.

Keep the repository public only if the intended competition rules allow publishing the implementation. Use GitHub Issues for feature requests and bug reports and Releases for versioned source. Keep secrets and customer-specific widget configuration out of commits. Add a license only after the owner chooses the terms under which others may reuse the code.

## Competition pitch

**Standalone SEO Panel** puts measurable SEO work in the admin panel people already use. Website owners connect their own AI and ranking accounts, monitor technical health and local search visibility, compare organic competitors, and see the cost of each request. Developers install one small widget and connect it to a secure backend. A guided demo lets judges explore the experience without provider credentials or paid API calls.

## Current deliverable and next product milestone

This project folder includes the widget source, configurable API adapter, a
tenant-isolated multi-tenant backend, project description, and a working
offline demo login/dashboard. The next implementation milestones are host
adapters, consentful provider-key setup, account-level usage controls,
billing/quotas, and automated integration testing that proves tenant
isolation.
