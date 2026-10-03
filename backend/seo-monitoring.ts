import { providerCost, unknownCost } from './seo-costs.ts';

const clean = (v: any, max = 200) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, max) : '';
const finite = (v: any, max = 600000) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null;
const iso = () => new Date().toISOString();
export const locations = {
  zurich: { label: 'Zürich', coordinate: '47.3769,8.5417,200' },
  winterthur: { label: 'Winterthur', coordinate: '47.4999,8.7241,200' },
  basel: { label: 'Basel', coordinate: '47.5596,7.5886,200' },
  bern: { label: 'Bern', coordinate: '46.9480,7.4474,200' },
  luzern: { label: 'Luzern', coordinate: '47.0502,8.3093,200' },
};
export const monitorDefaults = { healthDaily: true, rankDaily: false, rankIntervalDays: 1, location: 'zurich', device: 'mobile', depth: 20, keywords: [] };
// The site's own domain decides which search result belongs to the customer.
function ownDomain(url: string, site: any) { try { return new URL(url).hostname.toLowerCase() === site.domain.toLowerCase(); } catch { return false; } }
function externalUrl(v: any) { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
export function rankSnapshot(data: any, keyword: any, config: any, site: any) {
  const task = data?.tasks?.[0];
  if (data?.status_code !== 20000 || task?.status_code !== 20000 || !task.result?.[0]) throw new Error('Ranking-Anbieter lieferte keine gültigen Suchergebnisse.');
  const result = task.result[0];
  const organic = (result.items || []).filter((x: any) => x.type === 'organic' && Number.isInteger(x.rank_group) && x.rank_group > 0 && externalUrl(x.url)).map((x: any) => ({ position: x.rank_group, url: externalUrl(x.url), title: clean(x.title, 240), description: clean(x.description, 700), domain: new URL(x.url).hostname, own: ownDomain(x.url, site) })).sort((a: any, b: any) => a.position - b.position);
  if (!organic.length) throw new Error('Keine organischen Ergebnisse geliefert; Messung nicht gespeichert.');
  const own = organic.find((x: any) => x.own);
  return { id: crypto.randomUUID(), at: iso(), provider: 'DataForSEO', keywordId: keyword.id, keyword: keyword.term, scope: `${config.location}|${config.device}|de|${config.depth}`, location: config.location, locationLabel: (locations as any)[config.location].label, device: config.device, depth: config.depth, organicCount: organic.length, inspectedThrough: Math.max(...organic.map((x: any) => x.position)), position: own?.position ?? null, ownUrl: own?.url ?? null, top10: organic.filter((x: any) => x.position <= 10), costUsd: providerCost(data.cost).amountUsd, cost: providerCost(data.cost), checkUrl: externalUrl(result.check_url), providerTimestamp: clean(result.datetime, 80) };
}
export function healthReport(rawPages: any[], site: any = {}) {
  const counts = new Map<string, number>();
  for (const p of rawPages) if (p.title) counts.set(p.title, (counts.get(p.title) || 0) + 1);
  const pages = rawPages.map((p) => {
    const checks = [
      { group: 'crawl', label: 'HTTP 200', ok: p.status === 200 },
      { group: 'crawl', label: 'Öffentlicher Inhalt geladen', ok: p.contentReady === true },
      { group: 'crawl', label: 'Keine noindex-Anweisung', ok: p.contentReady === true && !/\b(noindex|none)\b/i.test(p.robots || '') },
      { group: 'crawl', label: 'robots.txt erlaubt Googlebot', ok: p.robotsAllowed !== false },
      { group: 'crawl', label: 'Canonical entspricht der Seite', ok: p.canonicalCorrect === true },
      { group: 'content', label: 'Aussagekräftiger Titel (30–65 Zeichen)', ok: (p.title || '').length >= 30 && p.title.length <= 65 },
      { group: 'content', label: 'Titel nicht mehrfach verwendet', ok: !!p.title && counts.get(p.title) === 1 },
      { group: 'content', label: 'Meta-Beschreibung (70–165 Zeichen)', ok: (p.description || '').length >= 70 && p.description.length <= 165 },
      { group: 'content', label: 'Genau eine H1', ok: p.h1Count === 1 },
      { group: 'content', label: 'Alle Bilder mit alt-Attribut', ok: p.contentReady === true && p.missingAlt === 0 },
      { group: 'mobile', label: 'Mobiler Viewport vorhanden', ok: p.viewport === true },
      { group: 'mobile', label: 'Kein horizontaler Überlauf', ok: p.overflow === false },
    ];
    const score = Math.round(checks.filter((c) => c.ok).length / checks.length * 100);
    return { ...p, score, checks, issues: checks.filter((c) => !c.ok).map((c) => c.label) };
  });
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((n, v) => n + v, 0) / a.length) : null;
  const category = (name: string) => { const checks = pages.flatMap((p) => p.checks.filter((c: any) => c.group === name)); return checks.length ? Math.round(checks.filter((c) => c.ok).length / checks.length * 100) : null; };
  return { id: crypto.randomUUID(), at: iso(), version: 2, source: 'VPS Chromium · mobiler Labortest, ohne Drosselung', score: mean(pages.map((p) => p.score)), pages, categories: { crawl: category('crawl'), content: category('content'), mobile: category('mobile') }, issueCount: pages.reduce((n, p) => n + p.issues.length, 0), unavailable: pages.filter((p) => p.status !== 200 || !p.contentReady).length, medianLcp: median(pages.map((p) => p.lcpMs).filter((v) => v !== null && v !== undefined)), medianTtfb: median(pages.map((p) => p.ttfbMs).filter((v) => v !== null && v !== undefined)), site };
}
function median(values: number[]) { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }

export function registerMonitoring(app: any, d: any) {
  const { get, put, list, remove, lock, event, encrypt, decrypt, validPath, SeoError, resolveSite } = d;
  const cfg = async (ws: string, site: string) => ({ ...monitorDefaults, ...(await get(ws, site, 'monitor:config') || {}) });
  const recent = async (ws: string, site: string, prefix: string, limit = 60) => (await list(ws, site, prefix)).sort((a: any, b: any) => b.at.localeCompare(a.at)).slice(0, limit);
  const retain = async (ws: string, site: string, prefix: string, max: number) => { const rows = await recent(ws, site, prefix, 100000); for (const r of rows.slice(max)) await remove(ws, site, `${prefix}${r.id}`); };
  const rankScope = (c: any) => `${c.location}|${c.device}|de|${c.depth}`;
  async function lastRankingAttempt(ws: string, site: string, config: any, id: string, ranks?: any[]) {
    const stored = await get(ws, site, `monitor:lastAttempt:${rankScope(config)}:${id}`);
    const last = stored?.at || (ranks || await recent(ws, site, 'rank:', 600)).find((r: any) => r.keywordId === id && r.scope === rankScope(config))?.at;
    return last && Number.isFinite(Date.parse(last)) ? last : null;
  }
  async function rankingDue(ws: string, site: string, config: any, id: string) {
    const last = await lastRankingAttempt(ws, site, config, id);
    return !last || Date.now() - Date.parse(last) >= config.rankIntervalDays * 86400000;
  }

  async function providerRequest(ws: string, site: string, path: string, payload?: any) {
    const stored = await get(ws, site, 'monitor:credential');
    if (!stored) throw new SeoError('Bitte zuerst DataForSEO unter Ranking-Verbindung einrichten.');
    const credentials = JSON.parse(await decrypt(stored));
    const response = await fetch('https://api.dataforseo.com/v3/' + path, { method: payload === undefined ? 'GET' : 'POST', headers: { Authorization: `Basic ${btoa(credentials.login + ':' + credentials.password)}`, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Standalone-SEO-Panel/2.0' }, ...(payload === undefined ? {} : { body: JSON.stringify([payload]) }), signal: AbortSignal.timeout(65000) });
    let result: any; try { result = await response.json(); } catch { /* Never return raw provider bodies. */ }
    const code = result?.status_code !== 20000 ? result?.status_code : result?.tasks?.[0]?.status_code;
    const messages: Record<number, string> = {
      40100: 'DataForSEO-API-Login oder API-Passwort ungültig. Bitte die API-Zugangsdaten aus „API Access" verwenden.',
      40104: 'Dein DataForSEO-Konto ist noch nicht verifiziert. Bitte im DataForSEO-Dashboard die E-Mail- und gegebenenfalls Telefonbestätigung abschließen. Die API-Zugangsdaten können trotzdem bereits gültig sein.',
      40200: 'DataForSEO meldet ein Zahlungsproblem. Bitte das Guthaben im Anbieter-Dashboard prüfen.',
      40201: 'DataForSEO hat den Kontozugang pausiert. Bitte den Anbieter-Support kontaktieren.',
      40202: 'Das Anfragelimit bei DataForSEO ist erreicht. Bitte später erneut testen.',
      40203: 'Das Kostenlimit bei DataForSEO ist erreicht. Bitte die API-Kostenlimits dort prüfen.',
      40207: 'Die Server-IP ist bei DataForSEO nicht freigegeben. Bitte unter API Access → IP Access die Server-IP freigeben.',
      40210: 'Das DataForSEO-Guthaben reicht für diese Abfrage nicht aus. Bitte dort Guthaben aufladen.',
    };
    if (!response.ok || code !== 20000) {
      const message = messages[code] || (response.status === 401 ? messages[40100] : response.status === 402 ? messages[40200] : response.status === 403 ? 'DataForSEO verweigert die Anfrage vom Server (HTTP 403). Bitte Verbindung testen; dieser Fehler allein bedeutet nicht, dass das Passwort falsch ist.' : `DataForSEO-Anfrage fehlgeschlagen (HTTP ${response.status}${Number.isInteger(code) ? ', API ' + code : ''}). Bitte Zugang, Freigaben und Limits beim Anbieter prüfen.`);
      throw Object.assign(new SeoError(message, 502), { providerHttp: response.status, providerCode: Number.isInteger(code) ? code : null, cost: providerCost(result?.cost) });
    }
    return result;
  }
  const providerCall = (ws: string, site: string, payload: any) => providerRequest(ws, site, 'serp/google/organic/live/advanced', payload);
  async function connectionTest(ws: string, site: string) {
    return lock(ws, async () => {
      if (!await get(ws, site, 'monitor:credential')) throw new SeoError('Bitte zuerst den DataForSEO-Zugang speichern.');
      const last = await get(ws, site, 'monitor:connectionAttempt');
      if (last && Date.now() - Date.parse(last.at) < 30000) throw new SeoError('Bitte 30 Sekunden zwischen Verbindungstests warten.', 429);
      await put(ws, site, 'monitor:connectionAttempt', { at: iso() });
      let test: any;
      try {
        const raw = await providerRequest(ws, site, 'appendix/user_data');
        const account = raw.tasks?.[0]?.result?.[0];
        if (!account || typeof account !== 'object') throw new SeoError('DataForSEO lieferte keine gültige Kontobestätigung.', 502);
        const balance = account.money?.balance;
        test = { ok: true, at: iso(), cost: providerCost(raw.cost), balanceUsd: typeof balance === 'number' && Number.isFinite(balance) ? balance : null, message: 'API-Zugang bestätigt. Die Abfrage hat keine Google-Ranking-Messung ausgelöst.' };
      } catch (e: any) {
        test = { ok: false, at: iso(), cost: e.cost || unknownCost('DataForSEO'), balanceUsd: null, message: e instanceof SeoError ? e.message : 'Verbindung zu DataForSEO konnte nicht bestätigt werden. Bitte später erneut testen.', providerHttp: e.providerHttp || null, providerCode: e.providerCode || null };
      }
      await put(ws, site, 'monitor:connectionTest', test);
      await event(ws, site, 'connection', test.ok ? 'DataForSEO-Verbindung erfolgreich geprüft.' : test.message, '', { cost: test.cost });
      return { ok: test.ok, test };
    });
  }
  app.post('/api/seo/monitor/test', async (c: any) => { const ws = c.get('workspace'); const site = resolveSite(c); return c.json(await connectionTest(ws.id, site.id)); });
  async function measure(ws: string, site: any, id: string, automatic = false) {
    return lock(ws, async () => {
      const config = await cfg(ws, site.id); const keyword = config.keywords.find((k: any) => k.id === id); if (!keyword) throw new SeoError('Suchbegriff nicht gefunden.');
      if (automatic && (!config.rankDaily || !await rankingDue(ws, site.id, config, id))) return { skipped: true };
      const day = iso().slice(0, 10), reservation = `monitor:attempt:${day}:${rankScope(config)}:${id}`;
      const attempt = await get(ws, site.id, reservation);
      if (attempt && !(attempt.retryable === true && !automatic && Date.now() - Date.parse(attempt.at) >= 30000)) throw new SeoError('Dieser Suchbegriff wurde heute für diesen Standort und dieses Gerät bereits abgefragt. Erneute Messung morgen; nach einer bestätigten kostenfreien Ablehnung ist ein manueller Versuch nach 30 Sekunden möglich.', 429);
      if (!await get(ws, site.id, 'monitor:credential')) throw new SeoError('Ranking-Verbindung fehlt.');
      const budgetKey = `monitor:budget:${day}`; const budget = await get(ws, site.id, budgetKey) || { calls: 0 };
      if (budget.calls >= 20) throw new SeoError('Tageslimit von 20 Ranking-Abfragen erreicht.', 429);
      await put(ws, site.id, budgetKey, { calls: budget.calls + 1 });
      await put(ws, site.id, reservation, { at: iso() });
      await put(ws, site.id, `monitor:lastAttempt:${rankScope(config)}:${id}`, { at: iso() });
      let incurredCost: any = unknownCost('DataForSEO');
      try {
        const raw = await providerCall(ws, site.id, { keyword: keyword.term, location_coordinate: (locations as any)[config.location].coordinate, language_code: 'de', se_domain: 'google.ch', device: config.device, os: config.device === 'mobile' ? 'android' : 'windows', depth: config.depth });
        incurredCost = providerCost(raw.cost);
        let measurement;
        try { measurement = rankSnapshot(raw, keyword, config, site); } catch { throw new SeoError('Keine verwertbaren organischen Suchergebnisse erhalten. Keine Position gespeichert.', 502); }
        await put(ws, site.id, `rank:${measurement.id}`, measurement); await put(ws, site.id, 'monitor:rankAccess', { ok: true, at: iso() }); await put(ws, site.id, 'monitor:lastTest', { ok: true, at: iso() });
        await event(ws, site.id, 'ranking', `Google-Messung „${keyword.term}" (${measurement.locationLabel}, ${config.device}): ${measurement.position ? 'Position ' + measurement.position : 'nicht im erfassten Ergebnisbereich gefunden'}.`, keyword.path, { costUsd: measurement.costUsd, cost: measurement.cost });
        await retain(ws, site.id, 'rank:', 600);
        return { ok: true, measurement };
      } catch (e: any) {
        const cost = e.cost || incurredCost;
        if (e.providerCode) { await put(ws, site.id, 'monitor:rankAccess', { ok: false, at: iso(), providerCode: e.providerCode, message: e.message }); }
        if ([40100, 40104, 40200, 40203, 40207, 40210].includes(e.providerCode) && cost.amountUsd === 0) await put(ws, site.id, reservation, { at: iso(), retryable: true, providerCode: e.providerCode });
        await event(ws, site.id, 'error', e instanceof SeoError ? e.message : 'Google-Ranking konnte nicht gemessen werden. Bestehende Messwerte bleiben erhalten.', keyword.path, { cost }); throw e;
      }
    });
  }
  app.get('/api/seo/monitor/status', async (c: any) => {
    const ws = c.get('workspace'); const site = resolveSite(c);
    const [config, credential, health, rankings, job, test, connection, rankAccess] = await Promise.all([cfg(ws.id, site.id), get(ws.id, site.id, 'monitor:credential'), recent(ws.id, site.id, 'health:', 30), recent(ws.id, site.id, 'rank:', 600), get(ws.id, site.id, 'monitor:job'), get(ws.id, site.id, 'monitor:lastTest'), get(ws.id, site.id, 'monitor:connectionTest'), get(ws.id, site.id, 'monitor:rankAccess')]);
    const schedule = await Promise.all(config.keywords.map(async (k: any) => { const last = await lastRankingAttempt(ws.id, site.id, config, k.id, rankings); return { keywordId: k.id, lastAttemptAt: last, nextAt: config.rankDaily && last ? new Date(Date.parse(last) + config.rankIntervalDays * 86400000).toISOString() : null }; }));
    return c.json({ config, schedule, locations, connected: !!credential, credentialSavedAt: credential?.savedAt || null, test, connection, rankAccess, health, rankings, job });
  });
  app.put('/api/seo/monitor/config', async (c: any) => {
    const ws = c.get('workspace'); const site = resolveSite(c); const b = await c.req.json();
    return c.json(await lock(ws.id, async () => {
      if (!Object.hasOwn(locations, b.location) || !['mobile', 'desktop'].includes(b.device) || ![10, 20, 100].includes(b.depth)) throw new SeoError('Bitte gültigen Standort, Gerät und Messtiefe auswählen.');
      if (!Array.isArray(b.keywords) || b.keywords.length > 10) throw new SeoError('Maximal zehn Suchbegriffe.');
      const rankIntervalDays = b.rankIntervalDays === undefined ? (await cfg(ws.id, site.id)).rankIntervalDays : b.rankIntervalDays;
      if (!Number.isInteger(rankIntervalDays) || rankIntervalDays < 1 || rankIntervalDays > 365) throw new SeoError('Bitte ein Ranking-Intervall als ganze Tageszahl zwischen 1 und 365 eingeben.');
      const keywords = []; const seen = new Set();
      for (const k of b.keywords) {
        const term = clean(k.term, 80); if (term.length < 2 || /[:\r\n]/.test(term)) throw new SeoError('Suchbegriff muss mindestens zwei Zeichen haben und darf keine Suchoperatoren enthalten.');
        if (seen.has(term.toLowerCase())) throw new SeoError('Suchbegriffe bitte nur einmal aufnehmen.'); seen.add(term.toLowerCase());
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(term.toLowerCase()));
        const id = Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, '0')).join('').slice(0, 24);
        keywords.push({ id, term, path: validPath(k.path, site) });
      }
      if (b.rankDaily && (!await get(ws.id, site.id, 'monitor:credential') || !(await get(ws.id, site.id, 'monitor:lastTest'))?.ok)) throw new SeoError('Bitte zunächst eine erfolgreiche Google-Messung starten.');
      const config = { healthDaily: b.healthDaily === true, rankDaily: b.rankDaily === true, rankIntervalDays, location: b.location, device: b.device, depth: b.depth, keywords };
      await put(ws.id, site.id, 'monitor:config', config); await event(ws.id, site.id, 'monitoring', `Monitoring gespeichert. Rankings: ${config.rankDaily ? 'alle ' + rankIntervalDays + ' Tage' : 'pausiert'}.`); return { ok: true, config };
    }));
  });
  app.put('/api/seo/monitor/credential', async (c: any) => {
    const ws = c.get('workspace'); const site = resolveSite(c); const b = await c.req.json();
    if (typeof b.login !== 'string' || typeof b.password !== 'string' || !b.login.trim() || b.login.length > 200 || b.password.length < 8 || b.password.length > 500 || /[^\x20-\x7e]/.test(b.login + b.password) || b.login.includes(':')) throw new SeoError('Bitte DataForSEO-API-Login und API-Passwort eingeben.');
    return c.json(await lock(ws.id, async () => {
      await put(ws.id, site.id, 'monitor:credential', { ...(await encrypt(JSON.stringify({ login: b.login.trim(), password: b.password }))), savedAt: iso() }); await remove(ws.id, site.id, 'monitor:lastTest'); await remove(ws.id, site.id, 'monitor:connectionTest'); await remove(ws.id, site.id, 'monitor:connectionAttempt'); await remove(ws.id, site.id, 'monitor:rankAccess'); await put(ws.id, site.id, 'monitor:config', { ...(await cfg(ws.id, site.id)), rankDaily: false }); await event(ws.id, site.id, 'credential', 'DataForSEO-Zugang verschlüsselt gespeichert; automatische Ranking-Abfragen pausiert.'); return { ok: true };
    }));
  });
  app.delete('/api/seo/monitor/credential', async (c: any) => {
    const ws = c.get('workspace'); const site = resolveSite(c);
    return c.json(await lock(ws.id, async () => { await remove(ws.id, site.id, 'monitor:credential'); await remove(ws.id, site.id, 'monitor:lastTest'); await remove(ws.id, site.id, 'monitor:connectionTest'); await remove(ws.id, site.id, 'monitor:connectionAttempt'); await remove(ws.id, site.id, 'monitor:rankAccess'); await put(ws.id, site.id, 'monitor:config', { ...(await cfg(ws.id, site.id)), rankDaily: false }); return { ok: true }; }));
  });
  app.post('/api/seo/monitor/rank', async (c: any) => { const ws = c.get('workspace'); const site = resolveSite(c); const b = await c.req.json(); return c.json(await measure(ws.id, site, clean(b.id, 40))); });
  app.post('/api/seo/monitor/scan', async (c: any) => {
    const ws = c.get('workspace'); const site = resolveSite(c);
    return c.json(await lock(ws.id, async () => {
      const old = await get(ws.id, site.id, 'monitor:job'); if (old?.state === 'queued' || (old?.state === 'running' && Date.now() - Date.parse(old.startedAt) < 30 * 60000)) return { ok: true, job: old };
      const last = await recent(ws.id, site.id, 'health:', 1); if (last[0] && Date.now() - Date.parse(last[0].at) < 5 * 60000) throw new SeoError('Der letzte Scan ist weniger als fünf Minuten alt.', 429);
      const job = { id: crypto.randomUUID(), state: 'queued', requestedAt: iso() }; await put(ws.id, site.id, 'monitor:job', job); return { ok: true, job };
    }));
  });

  async function cron(ws: string, site: any, b: any) {
    if (b.action === 'monitor-test') return connectionTest(ws, site.id);
    if (b.action === 'monitor-rank-check') return measure(ws, site, clean(b.id, 40));
    if (b.action === 'monitor-claim') return lock(ws, async () => {
      const config = await cfg(ws, site.id), job = await get(ws, site.id, 'monitor:job'), last = (await recent(ws, site.id, 'health:', 1))[0];
      if (job?.state === 'running' && Date.now() - Date.parse(job.startedAt) < 30 * 60000) return { job: null };
      if (job?.state === 'failed' && Date.now() - Date.parse(job.finishedAt) < 3600000) return { job: null };
      const overdue = config.healthDaily && (!last || Date.now() - Date.parse(last.at) >= 23 * 3600000);
      if (job?.state !== 'queued' && !overdue) return { job: null };
      const next = { id: job?.state === 'queued' ? job.id : crypto.randomUUID(), state: 'running', startedAt: iso() }; await put(ws, site.id, 'monitor:job', next);
      return { job: next, paths: (await list(ws, site.id, 'page:')).map((p: any) => p.path) };
    });
    if (b.action === 'monitor-complete') return lock(ws, async () => {
      const job = await get(ws, site.id, 'monitor:job'); if (job?.id !== b.id || job.state !== 'running') throw new SeoError('Scan ist nicht mehr aktuell.', 409);
      if (!Array.isArray(b.pages) || !b.pages.length || b.pages.length > 40) throw new SeoError('Ungültiger Scan.');
      const paths = new Set();
      const pages = b.pages.map((p: any) => { const path = validPath(p.path, site); if (paths.has(path)) throw new SeoError('Doppelte Scan-Seite.'); paths.add(path); return { path, status: finite(p.status, 599), title: clean(p.title, 200), description: clean(p.description, 500), h1Count: finite(p.h1Count, 100), missingAlt: finite(p.missingAlt, 10000), imageCount: finite(p.imageCount, 10000), wordCount: finite(p.wordCount, 100000), robots: clean(p.robots), robotsAllowed: p.robotsAllowed !== false, canonicalCorrect: p.canonicalCorrect === true, contentReady: p.contentReady === true, viewport: p.viewport === true, overflow: p.overflow !== false, lcpMs: finite(p.lcpMs), ttfbMs: finite(p.ttfbMs), cls: finite(p.cls, 100), error: clean(p.error, 180) }; });
      const report = healthReport(pages, { robotsTxt: b.site?.robotsTxt === true, sitemap: b.site?.sitemap === true, truncated: b.site?.truncated === true, discovered: finite(b.site?.discovered, 10000) });
      await put(ws, site.id, `health:${report.id}`, report); await put(ws, site.id, 'monitor:job', { ...job, state: 'completed', finishedAt: iso(), reportId: report.id }); await retain(ws, site.id, 'health:', 30); await event(ws, site.id, 'health', `Website-Scan abgeschlossen: ${pages.length} Seiten, ${report.issueCount} Hinweise.`); return { ok: true };
    });
    if (b.action === 'monitor-failed') return lock(ws, async () => { const job = await get(ws, site.id, 'monitor:job'); if (job?.id === b.id) await put(ws, site.id, 'monitor:job', { ...job, state: 'failed', finishedAt: iso(), error: 'Scan fehlgeschlagen. Bitte erneut starten.' }); return { ok: true }; });
    if (b.action === 'monitor-rank-plan') { const c = await cfg(ws, site.id); const ids = []; if (c.rankDaily && await get(ws, site.id, 'monitor:credential')) { for (const k of c.keywords) { if (!await get(ws, site.id, `monitor:attempt:${iso().slice(0, 10)}:${rankScope(c)}:${k.id}`) && await rankingDue(ws, site.id, c, k.id)) ids.push(k.id); } } return { ids }; }
    if (b.action === 'monitor-rank') return measure(ws, site, clean(b.id, 40), true);
    return undefined;
  }
  async function context(ws: string, site: string, path: string) {
    const c = await cfg(ws, site); const keywords = c.keywords.filter((k: any) => k.path === path);
    const ranks = await recent(ws, site, 'rank:', 600);
    return keywords.map((k: any) => { const r = ranks.find((r: any) => r.keywordId === k.id && r.scope === rankScope(c) && Date.now() - Date.parse(r.at) < 7 * 86400000); return r ? { keyword: k.term, at: r.at, location: r.locationLabel, device: r.device, position: r.position, top10: r.top10 } : null; }).filter(Boolean);
  }
  async function siteFiles(ws: string, site: string) {
    const report = (await recent(ws, site, 'health:', 1))[0];
    const paths: string[] = [];
    for (const page of report?.pages || []) {
      if (page.status !== 200 || page.contentReady !== true || page.robotsAllowed === false || /\b(noindex|none)\b/i.test(page.robots || '')) continue;
      try { const path = validPath(page.path, { allowed_paths: [] }); if (!paths.includes(path)) paths.push(path); } catch { /* Only explicitly public routes. */ }
    }
    return { ready: !!report && !report.site?.truncated && paths.length > 0, paths: paths.sort(), checkedAt: report?.at || null, partial: report?.site?.truncated === true };
  }
  return { cron, context, siteFiles };
}
