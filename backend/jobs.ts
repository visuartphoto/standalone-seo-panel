import { Hono } from 'npm:hono';

// Scheduled jobs run with the service role but stay tenant-scoped: every
// action is executed per workspace and per site, so one tenant can never
// read or modify another tenant's data through the scheduler.
export function registerJobRoutes(app: Hono, service: any) {
  app.post('/api/cron', async (c) => {
    const b = await c.req.json();
    const { data: sites } = await service.from('sites').select('id, workspace_id, domain, name, allowed_paths');
    const results: any[] = [];
    for (const site of sites || []) {
      const { data: kv } = await service.from('seo_kv').select('key, value').eq('workspace_id', site.workspace_id).eq('site_id', site.id).in('key', ['monitor:config', 'settings']);
      const kvMap = new Map((kv || []).map((x: any) => [x.key, x.value]));
      const monitorConfig: any = kvMap.get('monitor:config') || {};
      const seoConfig: any = kvMap.get('settings') || {};
      const needsWork = monitorConfig.healthDaily === true || monitorConfig.rankDaily === true || seoConfig.daily === true;
      if (!needsWork) continue;
      const { data: job } = await service.from('seo_kv').select('value').eq('workspace_id', site.workspace_id).eq('site_id', site.id).eq('key', 'monitor:job').maybeSingle();
      const jobState = job?.value?.state;
      if (jobState === 'running' && Date.now() - Date.parse(job.value.startedAt) < 30 * 60000) continue;
      results.push({ workspaceId: site.workspace_id, siteId: site.id, domain: site.domain, monitorConfig, seoConfig });
    }
    return c.json({ checked: (sites || []).length, due: results });
  });
}
