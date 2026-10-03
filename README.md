# Standalone SEO Panel

**Short description (for the project description field):**

> A reusable, embeddable SEO dashboard for any website. Bring your own OpenAI and DataForSEO credentials to audit pages, monitor rankings and competitors, track costs, and manage SEO from one secure admin widget.

This folder contains the reusable widget source, a safe interactive demo login, a tenant-isolated multi-tenant backend, and the project brief for a multi-website product. The demo is intentionally disconnected from all providers.

## Try the demo

Open `index.html` in a browser, or run a local static server from this folder:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`. Demo credentials:

- Email: `demo@seopanel.dev`
- Password: `DemoSEO2026!`

The demo uses sample values only. The ranking button makes no request and spends no credits. Never enter real provider keys in the demo.

## Embed the widget

The React widget source is in `src/widget/`. It is designed for an authenticated website admin area. Install React, Radix Dialog, and Lucide React in the host project, configure the API adapter, and mount it in the authenticated admin shell:

```tsx
import SeoPanel from './widget/SeoPanel';
import './widget/seo.css';

<SeoPanel
  accessToken={session.access_token}
  workspaceId={workspace.id}
  siteName={window.location.hostname}
  language="en"
  darkMode={false}
/>
```

Set `VITE_SEO_API_URL` to your own SEO backend URL ending in `/api/seo` (for example `https://api.example.com/api/seo`). The backend validates the user's session and workspace membership on every private route. See [PROJECT.md](PROJECT.md) before connecting provider accounts.

## Repository contents

- `src/widget/` — floating launcher, dashboard panels, costs, and API adapter.
- `src/demo.js`, `src/demo.css`, `index.html` — interactive, offline demo login.
- `backend/` — tenant-isolated multi-tenant backend: schema with row-level security, auth, SEO routes, monitoring, costs, and scheduled jobs. See `backend/README.md`.
- `PROJECT.md` — product brief, security boundaries, multi-tenant architecture, and competition description.
- `.github/` — issue templates and contribution guidance for the GitHub project page.

GitHub should contain source code, documentation, and non-sensitive example configuration only. It must never contain provider keys, user data, ranking history, database exports, or production `.env` files.
