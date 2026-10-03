import { Hono } from 'npm:hono';

// Self-service signup, login, invitations and workspace management.
// All routes run with the service role; membership is enforced in the
// workspace middleware for every private route.
export function registerAuthRoutes(app: Hono, service: any) {
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  app.post('/api/auth/signup', async (c) => {
    const b = await c.req.json();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const workspaceName = typeof b.workspaceName === 'string' ? b.workspaceName.trim().slice(0, 80) : 'Mein Workspace';
    const domain = typeof b.siteDomain === 'string' ? b.siteDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, 400);
    if (password.length < 8) return c.json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return c.json({ error: 'Bitte eine gültige Website-Domain angeben (z. B. example.com).' }, 4002);
    const { data: authData, error: authError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError) return c.json({ error: authError.message.includes('already') ? 'Diese E-Mail-Adresse ist bereits registriert.' : 'Registrierung fehlgeschlagen.' }, 400);
    const userId = authData.user.id;
    const slug = slugify(workspaceName) || 'workspace';
    const { data: ws, error: wsError } = await service.from('workspaces').insert({ name: workspaceName, slug }).select().single();
    if (wsError) { await service.auth.admin.deleteUser(userId); return c.json({ error: 'Workspace konnte nicht erstellt werden.' }, 500); }
    await service.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
    const { data: site, error: siteError } = await service.from('sites').insert({ workspace_id: ws.id, domain, name: domain }).select().single();
    if (siteError) return c.json({ error: 'Website konnte nicht angelegt werden.' }, 500);
    const { data: session, error: sessionError } = await service.auth.signInWithPassword({ email, password });
    if (sessionError) return c.json({ error: 'Anmeldung fehlgeschlagen.' }, 500);
    return c.json({ token: session.session.access_token, workspace: { id: ws.id, name: ws.name, slug: ws.slug, role: 'owner' }, site: { id: site.id, domain: site.domain } });
  });

  app.post('/api/auth/login', async (c) => {
    const b = await c.req.json();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const { data, error } = await service.auth.signInWithPassword({ email, password });
    if (error) return c.json({ error: 'E-Mail oder Passwort ist falsch.' }, 401);
    return c.json({ token: data.session.access_token });
  });

  app.get('/api/me', async (c) => {
    const user = c.get('user');
    const { data: members } = await service.from('workspace_members').select('workspace_id, role').eq('user_id', user.id);
    const ids = (members || []).map((m: any) => m.workspace_id);
    const { data: workspaces } = ids.length ? await service.from('workspaces').select('id, name, slug').in('id', ids) : { data: [] };
    const { data: sites } = ids.length ? await service.from('sites').select('id, workspace_id, domain, name').in('workspace_id', ids) : { data: [] };
    return c.json({ user: { id: user.id, email: user.email }, workspaces: (workspaces || []).map((w: any) => ({ ...w, role: members?.find((m: any) => m.workspace_id === w.id)?.role, sites: (sites || []).filter((s: any) => s.workspace_id === w.id) })) });
  });

  app.post('/api/workspaces/:workspaceId/invite', async (c) => {
    const ws = c.get('workspace');
    if (!['owner', 'admin'].includes(ws.role)) return c.json({ error: 'Nur Owner und Admins können einladen.' }, 403);
    const b = await c.req.json();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const role = ['admin', 'analyst'].includes(b.role) ? b.role : 'analyst';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, 400);
    const { data: existing } = await service.from('workspace_members').select('user_id').eq('workspace_id', ws.id).eq('user_id', email).maybeSingle();
    if (existing) return c.json({ error: 'Diese Person ist bereits Mitglied.' }, 409);
    const { data: user } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (user?.users || []).find((u: any) => u.email?.toLowerCase() === email);
    if (!match) return c.json({ error: 'Kein Konto mit dieser E-Mail gefunden. Die Person muss sich zuerst registrieren.' }, 404);
    await service.from('workspace_members').insert({ workspace_id: ws.id, user_id: match.id, role });
    return c.json({ ok: true, role });
  });

  app.get('/api/workspaces/:workspaceId/members', async (c) => {
    const ws = c.get('workspace');
    const { data: members } = await service.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', ws.id);
    const ids = (members || []).map((m: any) => m.user_id);
    const { data: users } = ids.length ? await service.auth.admin.listUsers({ page: 1, perPage: 1000 }) : { data: { users: [] } };
    const byId = new Map((users?.users || []).map((u: any) => [u.id, u.email]));
    return c.json({ members: (members || []).map((m: any) => ({ email: byId.get(m.user_id) || null, role: m.role, createdAt: m.created_at })) });
  });

  app.delete('/api/workspaces/:workspaceId/members', async (c) => {
    const ws = c.get('workspace');
    if (ws.role !== 'owner') return c.json({ error: 'Nur der Owner kann Mitglieder entfernen.' }, 403);
    const b = await c.req.json();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (users?.users || []).find((u: any) => u.email?.toLowerCase() === email);
    if (!match) return c.json({ error: 'Kein Konto mit dieser E-Mail gefunden.' }, 404);
    const { data: member } = await service.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', match.id).maybeSingle();
    if (!member) return c.json({ error: 'Kein Mitglied mit dieser E-Mail.' }, 404);
    if (member.role === 'owner') return c.json({ error: 'Der Owner kann nicht entfernt werden.' }, 400);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id).eq('user_id', match.id);
    return c.json({ ok: true });
  });

  app.post('/api/workspaces/:workspaceId/sites', async (c) => {
    const ws = c.get('workspace');
    if (!['owner', 'admin'].includes(ws.role)) return c.json({ error: 'Nur Owner und Admins können Websites hinzufügen.' }, 403);
    const b = await c.req.json();
    const domain = typeof b.domain === 'string' ? b.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return c.json({ error: 'Bitte eine gültige Domain angeben.' }, 400);
    const { data: site, error } = await service.from('sites').insert({ workspace_id: ws.id, domain, name: b.name || domain }).select().single();
    if (error) return c.json({ error: 'Diese Website existiert bereits im Workspace.' }, 409);
    return c.json({ site });
  });
}
