import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { registerAuthRoutes } from './auth.ts';
import { registerSeoRoutes } from './seo-routes.ts';
import { registerJobRoutes } from './jobs.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(supabaseUrl, serviceKey);

const app = new Hono();
app.use('/api/*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-SEO-Job-Key'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Resolve the authenticated user and verify workspace membership on every
// private route. A user can never reach another tenant's data by changing
// an id in the request: membership is checked server-side per request.
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const routePath = c.req.path;
  if (routePath === '/api/auth/signup' || routePath === '/api/auth/login') { await next(); return; }
  if (routePath === '/api/cron') {
    const supplied = c.req.header('x-seo-job-key') || '';
    const expected = Deno.env.get('SEO_JOB_KEY') || '';
    const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
    if (!supplied || a.reduce((n, v, i) => n | (v ^ b[i]), 0) !== 0) return c.json({ error: 'Nicht autorisiert.' }, 401);
    await next(); return;
  }
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  if (!token) return c.json({ error: 'Anmeldung erforderlich.' }, 401);
  const { data: { user }, error } = await service.auth.getUser(token);
  if (error || !user) return c.json({ error: 'Sitzung abgelaufen. Bitte neu anmelden.' }, 401);
  const workspaceId = c.req.header('x-workspace-id') || c.req.query('workspaceId') || c.req.param('workspaceId');
  if (!workspaceId) return c.json({ error: 'Workspace fehlt. Bitte das Widget mit workspaceId konfigurieren.' }, 400);
  const { data: member } = await service.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!member) return c.json({ error: 'Kein Zugriff auf diesen Workspace.' }, 403);
  const { data: sites } = await service.from('sites').select('id, domain, name, allowed_paths').eq('workspace_id', workspaceId);
  if (!sites?.length) return c.json({ error: 'Diesem Workspace ist keine Website zugeordnet.' }, 400);
  c.set('user', user);
  c.set('workspace', { id: workspaceId, role: member.role });
  c.set('sites', sites);
  await next();
});

app.onError((e, c) => c.json({ error: e instanceof Error ? e.message : 'Aktion fehlgeschlagen. Bitte erneut versuchen.' }, 500));

registerAuthRoutes(app, service);
registerSeoRoutes(app, service);
registerJobRoutes(app, service);

Deno.serve(app.fetch);
