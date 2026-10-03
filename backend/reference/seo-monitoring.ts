import { providerCost, unknownCost } from './seo-costs.ts';
// Private monitoring endpoints inherit the parent SEO authentication middleware.
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
function ownDomain(url: string) { try { return ['visuart.studio', 'www.visuart.studio'].includes(new URL(url).hostname.toLowerCase()); } catch { return false; } }
function externalUrl(v: any) { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
export function rankSnapshot(data: any, keyword: any, config: any) {
  const task = data?.tasks?.[0];
  if (data?.status_code !== 20000 || task?.status_code !== 20000 || !task.result?.[0]) throw new Error('Ranking-Anbieter lieferte keine gültigen Suchergebnisse.');
  const result = task.result[0];
  const organic = (result.items || []).filter((x: any) => x.type === 'organic' && Number.isInteger(x.rank_group) && x.rank_group > 0 && externalUrl(x.url)).map((x: any) => ({ position: x.rank_group, url: externalUrl(x.url), title: clean(x.title, 240), description: clean(x.description, 700), domain: new URL(x.url).hostname, own: ownDomain(x.url) })).sort((a: any, b: any) => a.position - b.position);
  // A parser/API failure is never turned into a fabricated "not ranked" result.
  if (!organic.length) throw new Error('Keine organischen Ergebnisse geliefert; Messung nicht gespeichert.');
  const own = organic.find((x: any) => x.own);
  return { id: crypto.randomUUID(), at: iso(), provider: 'DataForSEO', keywordId: keyword.id, keyword: keyword.term, scope: `${config.location}|${config.device}|de|${config.depth}`, location: config.location, locationLabel: (locations as any)[config.location].label, device: config.device, depth: config.depth, organicCount: organic.length, inspectedThrough: Math.max(...organic.map((x: any) => x.position)), position: own?.position ?? null, ownUrl: own?.url ?? null, top10: organic.filter((x: any) => x.position <= 10), costUsd: providerCost(data.cost).amountUsd, cost:providerCost(data.cost), checkUrl: externalUrl(result.check_url), providerTimestamp: clean(result.datetime, 80) };
}
export function healthReport(rawPages: any[], site: any = {}) {
  const counts = new Map<string, number>();
  for (const p of rawPages) if (p.title) counts.set(p.title, (counts.get(p.title) || 0) + 1);
  const pages = rawPages.map(p => {
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
    const score = Math.round(checks.filter(c => c.ok).length / checks.length * 100);
    return { ...p, score, checks, issues: checks.filter(c => !c.ok).map(c => c.label) };
  });
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((n,v) => n+v,0)/a.length) : null;
  const category = (name: string) => { const checks=pages.flatMap(p=>p.checks.filter((c:any)=>c.group===name)); return checks.length ? Math.round(checks.filter(c=>c.ok).length/checks.length*100) : null; };
  return { id: crypto.randomUUID(), at: iso(), version: 2, source: 'VPS Chromium · mobiler Labortest, ohne Drosselung', score: mean(pages.map(p=>p.score)), pages, categories: { crawl: category('crawl'), content: category('content'), mobile: category('mobile') }, issueCount: pages.reduce((n,p)=>n+p.issues.length,0), unavailable: pages.filter(p=>p.status !== 200 || !p.contentReady).length, medianLcp: median(pages.map(p=>p.lcpMs).filter(v=>v !== null && v !== undefined)), medianTtfb: median(pages.map(p=>p.ttfbMs).filter(v=>v !== null && v !== undefined)), site };
}
function median(values: number[]) { if (!values.length) return null; const s=[...values].sort((a,b)=>a-b); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; }

export function registerMonitoring(routes: any, d: any) {
  const { get, put, list, remove, lock, event, encrypt, decrypt, validPath, SeoError } = d;
  const cfg = async () => ({ ...monitorDefaults, ...(await get('monitor:config') || {}) });
  const recent = async (prefix: string, limit=60) => (await list(prefix)).sort((a:any,b:any)=>b.at.localeCompare(a.at)).slice(0,limit);
  const retain = async (prefix:string, max:number) => { const rows=await recent(prefix,100000); for (const r of rows.slice(max)) await remove(`${prefix}${r.id}`); };
  const rankScope = (c:any) => `${c.location}|${c.device}|de|${c.depth}`;
  async function lastRankingAttempt(config:any,id:string,ranks?:any[]) {
    const stored=await get(`monitor:lastAttempt:${rankScope(config)}:${id}`);
    const last=stored?.at || (ranks || await recent('rank:',600)).find((r:any)=>r.keywordId===id&&r.scope===rankScope(config))?.at;
    return last&&Number.isFinite(Date.parse(last))?last:null;
  }
  async function rankingDue(config:any,id:string) {
    const last=await lastRankingAttempt(config,id);
    return !last || Date.now()-Date.parse(last)>=config.rankIntervalDays*86400000;
  }

  async function providerRequest(path: string, payload?: any) {
    const stored = await get('monitor:credential');
    if (!stored) throw new SeoError('Bitte zuerst DataForSEO unter Ranking-Verbindung einrichten.');
    const credentials = JSON.parse(await decrypt(stored));
    const response = await fetch('https://api.dataforseo.com/v3/'+path, { method:payload===undefined?'GET':'POST', headers:{ Authorization:`Basic ${btoa(credentials.login+':'+credentials.password)}`, 'Content-Type':'application/json', 'Accept':'application/json', 'User-Agent':'VISUART-SEO/1.2' }, ...(payload===undefined?{}:{body:JSON.stringify([payload])}), signal:AbortSignal.timeout(65000) });
    let result:any; try { result=await response.json(); } catch { /* Never return raw provider bodies. */ }
    const code=result?.status_code!==20000?result?.status_code:result?.tasks?.[0]?.status_code;
    const messages:Record<number,string>={
      40100:'DataForSEO-API-Login oder API-Passwort ungültig. Bitte die API-Zugangsdaten aus „API Access“ verwenden.',
      40104:'Dein DataForSEO-Konto ist noch nicht verifiziert. Bitte im DataForSEO-Dashboard die E-Mail- und gegebenenfalls Telefonbestätigung abschließen. Die API-Zugangsdaten können trotzdem bereits gültig sein.',
      40200:'DataForSEO meldet ein Zahlungsproblem. Bitte das Guthaben im Anbieter-Dashboard prüfen.',
      40201:'DataForSEO hat den Kontozugang pausiert. Bitte den Anbieter-Support kontaktieren.',
      40202:'Das Anfragelimit bei DataForSEO ist erreicht. Bitte später erneut testen.',
      40203:'Das Kostenlimit bei DataForSEO ist erreicht. Bitte die API-Kostenlimits dort prüfen.',
      40207:'Die Server-IP ist bei DataForSEO nicht freigegeben. Bitte unter API Access → IP Access die VPS-IP freigeben.',
      40210:'Das DataForSEO-Guthaben reicht für diese Abfrage nicht aus. Bitte dort Guthaben aufladen.',
    };
    if (!response.ok || code!==20000) {
      const message=messages[code] || (response.status===401?messages[40100]:response.status===402?messages[40200]:response.status===403?'DataForSEO verweigert die Anfrage vom Server (HTTP 403). Bitte Verbindung testen; dieser Fehler allein bedeutet nicht, dass das Passwort falsch ist.':`DataForSEO-Anfrage fehlgeschlagen (HTTP ${response.status}${Number.isInteger(code)?', API '+code:''}). Bitte Zugang, Freigaben und Limits beim Anbieter prüfen.`);
      throw Object.assign(new SeoError(message,502),{providerHttp:response.status,providerCode:Number.isInteger(code)?code:null,cost:providerCost(result?.cost)});
    }
    return result;
  }
  const providerCall = (payload:any) => providerRequest('serp/google/organic/live/advanced',payload);
  async function connectionTest() {
    return lock(async()=>{
      if(!await get('monitor:credential'))throw new SeoError('Bitte zuerst den DataForSEO-Zugang speichern.');
      const last=await get('monitor:connectionAttempt');
      if(last&&Date.now()-Date.parse(last.at)<30000)throw new SeoError('Bitte 30 Sekunden zwischen Verbindungstests warten.',429);
      await put('monitor:connectionAttempt',{at:iso()});
      let test:any;
      try {
        const raw=await providerRequest('appendix/user_data');
        const account=raw.tasks?.[0]?.result?.[0];
        if(!account||typeof account!=='object')throw new SeoError('DataForSEO lieferte keine gültige Kontobestätigung.',502);
        const balance=account.money?.balance;
        test={ok:true,at:iso(),cost:providerCost(raw.cost),balanceUsd:typeof balance==='number'&&Number.isFinite(balance)?balance:null,message:'API-Zugang bestätigt. Die Abfrage hat keine Google-Ranking-Messung ausgelöst.'};
      } catch(e:any) {
        test={ok:false,at:iso(),cost:e.cost||unknownCost('DataForSEO'),balanceUsd:null,message:e instanceof SeoError?e.message:'Verbindung zu DataForSEO konnte nicht bestätigt werden. Bitte später erneut testen.',providerHttp:e.providerHttp||null,providerCode:e.providerCode||null};
      }
      await put('monitor:connectionTest',test);
      await event('connection',test.ok?'DataForSEO-Verbindung erfolgreich geprüft.':test.message,'',{cost:test.cost});
      return {ok:test.ok,test};
    });
  }
  routes.post('/monitor/test',async(c:any)=>c.json(await connectionTest()));
  async function measure(id: string, automatic = false) {
    return lock(async()=>{
      const config=await cfg(); const keyword=config.keywords.find((k:any)=>k.id===id); if (!keyword) throw new SeoError('Suchbegriff nicht gefunden.');
      if (automatic && (!config.rankDaily || !await rankingDue(config,id))) return { skipped:true };
      const day=iso().slice(0,10), reservation=`monitor:attempt:${day}:${rankScope(config)}:${id}`;
      const attempt=await get(reservation);
      if (attempt && !(attempt.retryable===true&&!automatic&&Date.now()-Date.parse(attempt.at)>=30000)) throw new SeoError('Dieser Suchbegriff wurde heute für diesen Standort und dieses Gerät bereits abgefragt. Erneute Messung morgen; nach einer bestätigten kostenfreien Ablehnung ist ein manueller Versuch nach 30 Sekunden möglich.',429);
      // Validate credentials before consuming the per-day reservation.
      if (!await get('monitor:credential')) throw new SeoError('Ranking-Verbindung fehlt.');
      const budgetKey=`monitor:budget:${day}`; const budget=await get(budgetKey)||{calls:0};
      if(budget.calls>=20)throw new SeoError('Tageslimit von 20 Ranking-Abfragen erreicht.',429);
      await put(budgetKey,{calls:budget.calls+1});
      await put(reservation,{at:iso()});
      await put(`monitor:lastAttempt:${rankScope(config)}:${id}`,{at:iso()});
      let incurredCost:any=unknownCost('DataForSEO');
      try {
        const raw=await providerCall({ keyword:keyword.term, location_coordinate:(locations as any)[config.location].coordinate, language_code:'de', se_domain:'google.ch', device:config.device, os:config.device==='mobile'?'android':'windows', depth:config.depth });
        incurredCost=providerCost(raw.cost);
        let measurement;
        try { measurement=rankSnapshot(raw,keyword,config); } catch { throw new SeoError('Keine verwertbaren organischen Suchergebnisse erhalten. Keine Position gespeichert.',502); }
        await put(`rank:${measurement.id}`,measurement); await put('monitor:rankAccess',{ok:true,at:iso()}); await put('monitor:lastTest',{ok:true,at:iso()});
        await event('ranking', `Google-Messung „${keyword.term}“ (${measurement.locationLabel}, ${config.device}): ${measurement.position ? 'Position '+measurement.position : 'nicht im erfassten Ergebnisbereich gefunden'}.`,keyword.path,{costUsd:measurement.costUsd,cost:measurement.cost});
        await retain('rank:',600);
        return {ok:true,measurement};
      } catch(e:any) {
        const cost=e.cost||incurredCost;
        if(e.providerCode){await put('monitor:rankAccess',{ok:false,at:iso(),providerCode:e.providerCode,message:e.message});}
        if([40100,40104,40200,40203,40207,40210].includes(e.providerCode)&&cost.amountUsd===0)await put(reservation,{at:iso(),retryable:true,providerCode:e.providerCode});
        await event('error',e instanceof SeoError?e.message:'Google-Ranking konnte nicht gemessen werden. Bestehende Messwerte bleiben erhalten.',keyword.path,{cost}); throw e;
      }
    });
  }
  routes.get('/monitor/status',async(c:any)=>{
    const [config,credential,health,rankings,job,test,connection,rankAccess]=await Promise.all([cfg(),get('monitor:credential'),recent('health:',30),recent('rank:',600),get('monitor:job'),get('monitor:lastTest'),get('monitor:connectionTest'),get('monitor:rankAccess')]);
    const schedule=await Promise.all(config.keywords.map(async(k:any)=>{const last=await lastRankingAttempt(config,k.id,rankings);return {keywordId:k.id,lastAttemptAt:last,nextAt:config.rankDaily&&last?new Date(Date.parse(last)+config.rankIntervalDays*86400000).toISOString():null};}));
    return c.json({config,schedule,locations,connected:!!credential,credentialSavedAt:credential?.savedAt || null,test,connection,rankAccess,health,rankings,job});
  });
  routes.put('/monitor/config',async(c:any)=>{ const b=await c.req.json();return c.json(await lock(async()=>{
    if (!Object.hasOwn(locations,b.location) || !['mobile','desktop'].includes(b.device) || ![10,20,100].includes(b.depth)) throw new SeoError('Bitte gültigen Standort, Gerät und Messtiefe auswählen.');
    if (!Array.isArray(b.keywords)||b.keywords.length>10) throw new SeoError('Maximal zehn Suchbegriffe.');
    const rankIntervalDays=b.rankIntervalDays===undefined?(await cfg()).rankIntervalDays:b.rankIntervalDays;
    if(!Number.isInteger(rankIntervalDays)||rankIntervalDays<1||rankIntervalDays>365)throw new SeoError('Bitte ein Ranking-Intervall als ganze Tageszahl zwischen 1 und 365 eingeben.');
    const keywords=[]; const seen=new Set();
    for (const k of b.keywords) {
      const term=clean(k.term,80); if (term.length<2 || /[:\r\n]/.test(term)) throw new SeoError('Suchbegriff muss mindestens zwei Zeichen haben und darf keine Suchoperatoren enthalten.');
      if(seen.has(term.toLowerCase()))throw new SeoError('Suchbegriffe bitte nur einmal aufnehmen.');seen.add(term.toLowerCase());
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(term.toLowerCase()));
      const id=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
      keywords.push({id,term,path:validPath(k.path)});
    }
    if(b.rankDaily && (!await get('monitor:credential') || !(await get('monitor:lastTest'))?.ok))throw new SeoError('Bitte zunächst eine erfolgreiche Google-Messung starten.');
    const config={healthDaily:b.healthDaily===true,rankDaily:b.rankDaily===true,rankIntervalDays,location:b.location,device:b.device,depth:b.depth,keywords};
    await put('monitor:config',config);await event('monitoring',`Monitoring gespeichert. Rankings: ${config.rankDaily?'alle '+rankIntervalDays+' Tage':'pausiert'}.`);return {ok:true,config};
  })); });
  routes.put('/monitor/credential',async(c:any)=>{const b=await c.req.json();if(typeof b.login!=='string'||typeof b.password!=='string'||!b.login.trim()||b.login.length>200||b.password.length<8||b.password.length>500||/[^\x20-\x7e]/.test(b.login+b.password)||b.login.includes(':'))throw new SeoError('Bitte DataForSEO-API-Login und API-Passwort eingeben.');return c.json(await lock(async()=>{
    await put('monitor:credential',{...(await encrypt(JSON.stringify({login:b.login.trim(),password:b.password}))),savedAt:iso()});await remove('monitor:lastTest');await remove('monitor:connectionTest');await remove('monitor:connectionAttempt');await remove('monitor:rankAccess');await put('monitor:config',{...(await cfg()),rankDaily:false});await event('credential','DataForSEO-Zugang verschlüsselt gespeichert; automatische Ranking-Abfragen pausiert.');return {ok:true};
  }));});
  routes.delete('/monitor/credential',async(c:any)=>c.json(await lock(async()=>{await remove('monitor:credential');await remove('monitor:lastTest');await remove('monitor:connectionTest');await remove('monitor:connectionAttempt');await remove('monitor:rankAccess');await put('monitor:config',{...(await cfg()),rankDaily:false});return {ok:true};})));
  routes.post('/monitor/rank',async(c:any)=>{const b=await c.req.json();return c.json(await measure(clean(b.id,40)));});
  routes.post('/monitor/scan',async(c:any)=>c.json(await lock(async()=>{
    const old=await get('monitor:job');if(old?.state==='queued'||(old?.state==='running'&&Date.now()-Date.parse(old.startedAt)<30*60000))return {ok:true,job:old};
    const last=await recent('health:',1);if(last[0]&&Date.now()-Date.parse(last[0].at)<5*60000)throw new SeoError('Der letzte Scan ist weniger als fünf Minuten alt.',429);
    const job={id:crypto.randomUUID(),state:'queued',requestedAt:iso()};await put('monitor:job',job);return {ok:true,job};
  })));
  async function cron(b:any) {
    if(b.action==='monitor-test')return connectionTest();
    if(b.action==='monitor-rank-check')return measure(clean(b.id,40));
    if(b.action==='monitor-claim')return lock(async()=>{
      const config=await cfg(),job=await get('monitor:job'),last=(await recent('health:',1))[0];
      if(job?.state==='running'&&Date.now()-Date.parse(job.startedAt)<30*60000)return {job:null};
      if(job?.state==='failed'&&Date.now()-Date.parse(job.finishedAt)<3600000)return {job:null};
      const overdue=config.healthDaily&&(!last || Date.now()-Date.parse(last.at)>=23*3600000);
      if(job?.state!=='queued'&&!overdue)return {job:null};
      const next={id:job?.state==='queued'?job.id:crypto.randomUUID(),state:'running',startedAt:iso()};await put('monitor:job',next);
      return {job:next,paths:(await list('page:')).map((p:any)=>p.path)};
    });
    if(b.action==='monitor-complete')return lock(async()=>{
      const job=await get('monitor:job');if(job?.id!==b.id||job.state!=='running')throw new SeoError('Scan ist nicht mehr aktuell.',409);
      if(!Array.isArray(b.pages)||!b.pages.length||b.pages.length>40)throw new SeoError('Ungültiger Scan.');
      const paths=new Set();
      const pages=b.pages.map((p:any)=>{const path=validPath(p.path);if(paths.has(path))throw new SeoError('Doppelte Scan-Seite.');paths.add(path);return {path,status:finite(p.status,599),title:clean(p.title,200),description:clean(p.description,500),h1Count:finite(p.h1Count,100),missingAlt:finite(p.missingAlt,10000),imageCount:finite(p.imageCount,10000),wordCount:finite(p.wordCount,100000),robots:clean(p.robots),robotsAllowed:p.robotsAllowed!==false,canonicalCorrect:p.canonicalCorrect===true,contentReady:p.contentReady===true,viewport:p.viewport===true,overflow:p.overflow!==false,lcpMs:finite(p.lcpMs),ttfbMs:finite(p.ttfbMs),cls:finite(p.cls,100),error:clean(p.error,180)};});
      const report=healthReport(pages,{robotsTxt:b.site?.robotsTxt===true,sitemap:b.site?.sitemap===true,truncated:b.site?.truncated===true,discovered:finite(b.site?.discovered,10000)});
      await put(`health:${report.id}`,report);await put('monitor:job',{...job,state:'completed',finishedAt:iso(),reportId:report.id});await retain('health:',30);await event('health',`Website-Scan abgeschlossen: ${pages.length} Seiten, ${report.issueCount} Hinweise.`);return {ok:true};
    });
    if(b.action==='monitor-failed')return lock(async()=>{const job=await get('monitor:job');if(job?.id===b.id)await put('monitor:job',{...job,state:'failed',finishedAt:iso(),error:'Scan fehlgeschlagen. Bitte erneut starten.'});return {ok:true};});
    if(b.action==='monitor-rank-plan') {const c=await cfg();const ids=[]; if(c.rankDaily&&await get('monitor:credential')){for(const k of c.keywords){if(!await get(`monitor:attempt:${iso().slice(0,10)}:${rankScope(c)}:${k.id}`)&&await rankingDue(c,k.id))ids.push(k.id);}}return {ids};}
    if(b.action==='monitor-rank')return measure(clean(b.id,40),true);
    return undefined;
  }
  async function context(path:string) {
    const c=await cfg();const keywords=c.keywords.filter((k:any)=>k.path===path);
    const ranks=await recent('rank:',600);
    return keywords.map((k:any)=>{const r=ranks.find((r:any)=>r.keywordId===k.id&&r.scope===rankScope(c)&&Date.now()-Date.parse(r.at)<7*86400000);return r?{keyword:k.term,at:r.at,location:r.locationLabel,device:r.device,position:r.position,top10:r.top10}:null;}).filter(Boolean);
  }
  async function siteFiles() {
    const report=(await recent('health:',1))[0];
    const paths:string[]=[];
    for(const page of report?.pages||[]){
      if(page.status!==200||page.contentReady!==true||page.robotsAllowed===false||/\b(noindex|none)\b/i.test(page.robots||''))continue;
      try{const path=validPath(page.path);if(!paths.includes(path))paths.push(path);}catch{ /* Only explicitly public routes. */ }
    }
    return {ready:!!report&&!report.site?.truncated&&paths.length>0,paths:paths.sort(),checkedAt:report?.at||null,partial:report?.site?.truncated===true};
  }
  return {cron,context,siteFiles};
}
