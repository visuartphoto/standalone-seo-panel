import { SeoCost } from './SeoCost';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Activity, ArrowUpRight, Check, ChevronRight, Globe2, KeyRound, Loader2, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { apiAuth } from './api-client';
import './seo.css';
import { SeoHealthDashboard, SeoRankings, SeoMonitoringSettings } from './SeoMonitoring';

type Props = { accessToken: string; workspaceId?: string; darkMode?: boolean; language?: string; siteName?: string };
const date = (s?: string) => s ? new Date(s).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : 'Noch nicht';
export function captureSeoPage() {
  const main = document.querySelector('main');
  if (!main) throw new Error('Diese Seite kann noch nicht erfasst werden.');
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,form,input,textarea,button,[data-seo-exclude],[role="dialog"]').forEach(e => e.remove());
  return { title: document.title, description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '', text: clone.textContent?.replace(/\s+/g, ' ').trim() || '', h1: [...clone.querySelectorAll('h1')].map(e => e.textContent || ''), imageCount: clone.querySelectorAll('img').length, missingAlt: clone.querySelectorAll('img:not([alt])').length };
}
export default function SeoPanel({ accessToken, workspaceId, darkMode = false, language = document.documentElement.lang || 'en', siteName = window.location.hostname }: Props) {
  const pathname = window.location.pathname;
  const currentLanguage = language;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<any>(null);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [key, setKey] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [setupResult, setSetupResult] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(pathname);
  async function request(route: string, body?: any, method = 'POST') {
    const res = await apiAuth(`seo/${route}`, accessToken, { method: body === undefined && method === 'POST' ? 'GET' : method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), retries: 1, timeoutMs: 115000 }, workspaceId);
    const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Anfrage fehlgeschlagen.'); return result;
  }
  async function runSetup() {
    setBusy('Supabase einrichten'); setError(''); setMessage('');
    try {
      const res = await apiAuth('setup/supabase', '', { method: 'POST', body: JSON.stringify({ url: supabaseUrl, serviceRoleKey: supabaseKey }), timeoutMs: 120000 });
      const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Einrichtung fehlgeschlagen.');
      setSetupResult(result); setMessage(result.message || 'Datenbank eingerichtet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Einrichtung fehlgeschlagen.'); }
    finally { setBusy(''); }
  }
  async function checkSetup() {
    setBusy('Status prüfen'); setError(''); setMessage('');
    try {
      const res = await apiAuth('setup/status', '', { method: 'GET' });
      const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Statusabfrage fehlgeschlagen.');
      setSetupResult(result); setMessage(result.message || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Statusabfrage fehlgeschlagen.'); }
    finally { setBusy(''); }
  }
  async function load() { const [result, monitor] = await Promise.all([request('status'), request('monitor/status')]); setData(result); setConfig(result.config); setMonitoring(monitor); }
  async function act(label: string, fn: () => Promise<any>, success: string, preserveConfig = false) {
    setBusy(label); setError(''); setMessage('');
    try { await fn(); await load(); if (preserveConfig) setConfig(config); setMessage(success); window.dispatchEvent(new Event('seo-published')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); try { await load(); } catch { /* Keep the original action error visible. */ } }
    finally { setBusy(''); }
  }
  useEffect(() => { if (open) { setSelected(pathname); void act('Laden', load, ''); } else { setKey(''); } }, [open]);
  useEffect(() => { setSelected(pathname); }, [pathname]);
  useEffect(() => { if (!open || !['queued', 'running'].includes(monitoring?.job?.state)) return; const timer = window.setInterval(() => { request('monitor/status').then(setMonitoring).catch(() => {}); }, 10000); return () => window.clearInterval(timer); }, [open, monitoring?.job?.state]);
  const page = data?.pages?.find((p: any) => p.path === selected);
  const eligible = !/^\/(admin|login|sign-in|account|checkout|api)(?:\/|$)/i.test(pathname);
  const draft = page?.draft;
  const nav = [{ id: 'overview', label: 'Übersicht', icon: Activity }, { id: 'pages', label: 'Seiten', icon: Globe2 }, { id: 'rankings', label: 'Rankings', icon: Search }, { id: 'history', label: 'Protokoll', icon: RefreshCw }, { id: 'settings', label: 'Verbindung', icon: Settings2 }];
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="seo-launcher" aria-label="SEO-Panel öffnen" title="SEO · Super-Admin"><Search size={19}/><span>SEO</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="seo-overlay"/>
      <Dialog.Content className={`seo-panel ${darkMode ? 'seo-dark' : ''}`} data-seo-exclude>
        <header className="seo-header"><div className="seo-brand"><div className="seo-mark"><Activity size={24}/></div><div><span className="seo-eyebrow">SEO WORKSPACE / ADMIN</span><Dialog.Title>SEO Studio<span className="seo-dot"/></Dialog.Title></div></div><Dialog.Close className="seo-icon" aria-label="SEO-Panel schließen"><X size={21}/></Dialog.Close></header>
        <Dialog.Description className="seo-description">Deine Sichtbarkeit. Alles an einem Ort.</Dialog.Description>
        <nav className="seo-tabs" aria-label="SEO-Bereiche">{nav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={16}/>{label}</button>)}</nav>
        <div className="seo-scroll">
          {error && <div className="seo-notice seo-error" role="alert">{error}</div>}
          {message && <div className="seo-notice" role="status"><Check size={16}/>{message}</div>}
          {busy && <div className="seo-progress" role="status"><Loader2 size={16} className="seo-spin"/>{busy} … {busy === 'KI-Analyse' && 'Die Webrecherche kann etwa eine Minute dauern.'}</div>}
          {!data && !busy && <button className="seo-primary" onClick={() => act('Laden', load, '')}>Erneut laden</button>}
          {data && <>
            {tab === 'overview' && <>
              <SeoHealthDashboard data={monitoring} busy={busy} request={request} act={act}/>
              <section className="seo-card seo-highlight"><div className="seo-card-title"><Globe2 size={19}/><h3>Aktuelle Seite</h3></div><p className="seo-path">{siteName}{pathname}</p><p>Erfasst den geladenen Seiteninhalt und prüft Titel, Beschreibung, Überschriften und Bildattribute.</p><button disabled={!!busy || !eligible} className="seo-primary" onClick={() => act('Seitenprüfung', async () => { await request('capture', { path: pathname, snapshot: captureSeoPage() }); setSelected(pathname); setTab('pages'); }, 'Seite erfasst. Du kannst jetzt eine KI-Analyse starten.')}><Search size={16}/>Diese Seite prüfen<ArrowUpRight size={16}/></button>{!eligible && <small>Bitte eine öffentliche Inhaltsseite auf Deutsch öffnen. Admin-, Kunden- und Formularseiten sind ausgeschlossen.</small>}</section>
              <section className="seo-card"><div className="seo-card-title"><ShieldCheck size={19}/><h3>KI-Verbindung</h3><span className="seo-chip">{data.lastTest?.ok && data.lastTest?.model === data.config.model ? 'Getestet' : data.credential ? 'Test ausstehend' : 'Nicht verbunden'}</span></div><p>{data.credential ? `Schlüssel ••••${data.credential.suffix} · ${data.config.model}` : 'Hinterlege deinen separaten SEO-Schlüssel sicher direkt in diesem Panel.'}</p><button className="seo-link" onClick={() => setTab('settings')}>Verbindung verwalten<ChevronRight size={15}/></button></section>
              <div className="seo-footnote">Tägliche Prüfungen laufen auf dem VPS, auch bei geschlossenem Browser. Letztes Scheduler-Signal: {date(data.scheduler?.at)}.</div>
            </>}
            {tab === 'rankings' && <SeoRankings data={monitoring} busy={busy} request={request} act={act} pages={data.pages} onSettings={() => setTab('settings')} onAnalyze={(path) => { setSelected(path); setTab('pages'); }}/>}
            {tab === 'pages' && <>
              <div className="seo-section-heading"><div><span className="seo-eyebrow">ANALYSIEREN & VERBESSERN</span><h2>Deine Seiten</h2></div><button className="seo-icon" disabled={!!busy} aria-label="Daten aktualisieren" onClick={() => act('Aktualisieren', load, '')}><RefreshCw size={18}/></button></div>
              {!data.pages.length ? <section className="seo-card"><h3>Noch keine Seite erfasst</h3><p>Öffne eine öffentliche Seite und wähle in der Übersicht „Diese Seite prüfen“.</p><button className="seo-primary" onClick={() => setTab('overview')}>Zur Übersicht</button></section> : <>
                <label className="seo-field">Seite auswählen<select value={page ? selected : ''} onChange={e => setSelected(e.target.value)}><option value="" disabled>Seite auswählen</option>{data.pages.map((p: any) => <option key={p.path} value={p.path}>{p.path}</option>)}</select></label>
                {page && <>
                  <section className="seo-card"><div className="seo-card-title"><h3>Technischer Check</h3><strong className="seo-score">{page.audit?.score}/100</strong></div><small>Inhalt erfasst: {date(page.capturedAt)} · {page.audit?.words} Wörter</small><ul className="seo-checks">{page.audit?.checks.map((c: any) => <li key={c.label}><span className={c.ok ? 'seo-pass' : 'seo-fail'}>{c.ok ? '✓' : '!'}</span>{c.label}</li>)}</ul><label className="seo-toggle"><input type="checkbox" disabled={!!busy} checked={page.monitored} onChange={e => act('Speichern', () => request('page', { path: page.path, monitored: e.target.checked }, 'PUT'), 'Überwachung aktualisiert.')}/>In tägliche Analyse aufnehmen</label></section>
                  <button disabled={!!busy || !data.credential} className="seo-primary seo-wide" onClick={() => act('KI-Analyse', () => request('analyze', { path: page.path }), 'Vorschlag mit Webrecherche erstellt.')}><Sparkles size={17}/>KI-Analyse mit Webrecherche</button><p className="seo-footnote">Kostenpflichtige API-Anfrage. Maximal {data.config.maxDaily} Analysen pro Tag, einschließlich fehlgeschlagener Versuche. Erfasster Inhalt darf höchstens 24 Stunden alt sein.</p>
                  {draft && <section className="seo-card"><div className="seo-card-title"><Sparkles size={18}/><h3>KI-Vorschlag</h3><span className="seo-chip">{date(draft.at)}</span></div><div className="seo-search-preview"><small>{siteName}{page.path}</small><h4>{draft.title}</h4><p>{draft.description}</p></div><div className="seo-keywords">{draft.keywords.map((k: string) => <span key={k}>{k}</span>)}</div><p>{draft.rationale}</p><SeoCost cost={draft.cost}/><details><summary>Textvorschlag ansehen</summary><p className="seo-prewrap">{draft.suggestedText}</p><small>Zur manuellen Übernahme im vorhandenen Seiteneditor. Wird nicht automatisch in den Seitentext eingefügt.</small></details>{draft.sources.length > 0 && <details><summary>Recherchequellen ({draft.sources.length})</summary>{draft.sources.map((s: any, i: number) => <a className="seo-source" key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}<ArrowUpRight size={12}/></a>)}</details>}<button disabled={!!busy} className="seo-primary seo-wide" onClick={() => act('Veröffentlichen', () => request('publish', { path: page.path, draftId: draft.id }), 'Metadaten veröffentlicht. Die HTML-Ausgabe wird innerhalb einer Minute aktualisiert.')}><Check size={16}/>Titel & Beschreibung veröffentlichen</button></section>}
                  {page.published && <section className="seo-card"><div className="seo-card-title"><h3>Aktuell veröffentlicht</h3><span className="seo-chip">Live</span></div><strong>{page.published.title}</strong><p>{page.published.description}</p><small>{date(page.published.updatedAt)}</small>{page.history?.length > 0 && <button className="seo-link" disabled={!!busy} onClick={() => act('Zurücknehmen', () => request('rollback', { path: page.path, historyId: page.history[0].id }), 'Letzte Veröffentlichung zurückgenommen.')}><RefreshCw size={14}/>Letzte Änderung zurücknehmen</button>}</section>}
                </>}
              </>}
            </>}
            {tab === 'history' && <><span className="seo-eyebrow">TRANSPARENT & NACHVOLLZIEHBAR</span><h2>Änderungsprotokoll</h2><p className="seo-muted">Analysen, Veröffentlichungen und Verbindungsprüfungen mit Kosten pro Aufruf. OpenAI-Beträge sind Schätzungen, DataForSEO-Beträge stammen aus der Anbieterantwort. Ältere Einträge können ohne Kostenangabe sein.</p><div className="seo-timeline">{data.events.length ? data.events.map((e: any) => <article key={e.id}><span className={`seo-event-dot ${e.type === 'error' ? 'seo-event-error' : ''}`}/><small>{date(e.at)}{e.path && ` · ${e.path}`}</small><p>{e.detail}</p>{(e.cost||e.usage||e.type==='ranking')&&<SeoCost cost={e.cost} legacyAmount={e.costUsd}/>}
{e.usage && <small>{e.usage.input} Eingabe- / {e.usage.output} Ausgabe-Tokens · {e.usage.searches} Websuchen</small>}</article>) : <section className="seo-card">Noch keine Aktionen aufgezeichnet.</section>}</div></>}
            {tab === 'settings' && config && <><span className="seo-eyebrow">NUR FÜR SUPER-ADMINS</span><h2>KI & Automatik</h2><section className="seo-card"><div className="seo-card-title"><ShieldCheck size={19}/><h3>Supabase-Einrichtung</h3><span className={`seo-chip ${setupResult?.ok ? '' : 'seo-chip-warn'}`}>{setupResult ? (setupResult.ok ? 'Eingerichtet' : 'Unvollständig') : 'Nicht geprüft'}</span></div><p>Gib die Projekt-URL und den Service-Role-Key deiner Supabase-Datenbank ein. Das Panel legt dann automatisch alle Tabellen, Sicherheitsregeln und Funktionen an — kein SQL nötig.</p>{setupResult && <div className={`seo-notice ${setupResult.ok ? '' : 'seo-error'}`}>{setupResult.message}{setupResult.tables?.length ? ` Tabellen: ${setupResult.tables.join(', ')}.` : ''}{setupResult.missing?.length ? ` Fehlend: ${setupResult.missing.join(', ')}.` : ''}</div>}<label className="seo-field">Supabase-Projekt-URL<input value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" autoComplete="off" spellCheck={false}/></label><label className="seo-field">Service-Role-Key (geheimer Schlüssel)<input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} placeholder="sb_secret_..." autoComplete="off" spellCheck={false}/></label><div className="seo-actions"><button className="seo-primary" disabled={!!busy || !supabaseUrl.trim() || !supabaseKey.trim()} onClick={runSetup}><ShieldCheck size={15}/>Supabase einrichten</button><button className="seo-secondary" disabled={!!busy} onClick={checkSetup}><RefreshCw size={15}/>Status prüfen</button></div><small>Der Service-Role-Key wird nur für die Einrichtung an den Server übertragen und nicht gespeichert. Die Einrichtung ist idempotent und kann jederzeit erneut ausgeführt werden.</small></section><SeoMonitoringSettings data={monitoring} busy={busy} request={request} act={act} pages={data.pages}/><section className="seo-card"><div className="seo-card-title"><KeyRound size={19}/><h3>OpenAI-Verbindung</h3></div><p>Der Schlüssel wird verschlüsselt auf dem Server gespeichert und danach nicht mehr angezeigt.</p>{data.credential && <div className="seo-notice">Gespeichert: ••••{data.credential.suffix} · {date(data.credential.savedAt)}</div>}<label className="seo-field">{data.credential ? 'Schlüssel ersetzen' : 'SEO-API-Schlüssel'}<input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" spellCheck={false}/></label><div className="seo-actions"><button className="seo-primary" disabled={!!busy || !key.trim()} onClick={() => act('Schlüssel speichern', async () => { await request('credential', { key }, 'PUT'); setKey(''); }, 'Schlüssel sicher gespeichert. Bitte Verbindung testen.')}><ShieldCheck size={15}/>Sicher speichern</button>{data.credential && <button className="seo-secondary" disabled={!!busy} onClick={() => act('Schlüssel entfernen', () => request('credential', undefined, 'DELETE'), 'Schlüssel entfernt und Automatik pausiert.')}>Entfernen</button>}</div><label className="seo-field">Modell<select value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}>{data.models.map((m: string) => <option key={m} value={m}>{m}{m === 'gpt-5.6-terra' ? ' · Empfohlen' : ''}</option>)}</select></label><button className="seo-secondary seo-wide" disabled={!!busy || !data.credential} onClick={() => act('Verbindungstest', () => request('test', { model: config.model }), 'API-Schlüssel und ausgewähltes Modell funktionieren.', true)}><Activity size={16}/>Gespeicherten Schlüssel testen</button><small>Eine kleine echte Anfrage. Geringe API-Kosten möglich. Modelländerung anschließend unten speichern.</small>{data.lastTest && <p className={data.lastTest.ok ? 'seo-success-text' : 'seo-danger-text'}>Letzter Test: {data.lastTest.ok ? 'Erfolgreich' : 'Fehlgeschlagen'} · {data.lastTest.model} · {date(data.lastTest.at)}</p>}{data.lastTest&&<SeoCost cost={data.lastTest.cost}/>}</section>
              <section className="seo-card"><div className="seo-card-title"><Settings2 size={19}/><h3>Analyse-Einstellungen</h3></div><label className="seo-field">Thematischer Fokus<textarea rows={3} value={config.focus} maxLength={400} onChange={e => setConfig({ ...config, focus: e.target.value })}/></label><label className="seo-field">Zielregion<input value={config.region} maxLength={120} onChange={e => setConfig({ ...config, region: e.target.value })}/></label><label className="seo-field">Maximale KI-Analysen pro Tag<input type="number" min="1" max="10" value={config.maxDaily} onChange={e => setConfig({ ...config, maxDaily: Number(e.target.value) })}/></label><label className="seo-toggle"><input type="checkbox" checked={config.daily} onChange={e => setConfig({ ...config, daily: e.target.checked })}/><span>Täglich recherchieren<small>Um 06:00 Uhr Schweizer Zeit. Öffentliche Seiten werden frisch geladen; benötigt einen erfolgreichen API-Test.</small></span></label><label className="seo-toggle"><input type="checkbox" checked={config.autoPublish} onChange={e => setConfig({ ...config, autoPublish: e.target.checked })}/><span>Metadaten automatisch veröffentlichen<small>Gilt auch für manuelle KI-Analysen. Titel und Beschreibung, höchstens einmal pro Woche je Seite. Änderungen können zurückgenommen werden.</small></span></label><button className="seo-primary seo-wide" disabled={!!busy} onClick={() => act('Einstellungen speichern', () => request('settings', config, 'PUT'), 'Einstellungen gespeichert.')}><Check size={16}/>Einstellungen speichern</button></section><p className="seo-footnote">Das Tageslimit begrenzt Analysen, kein garantiertes Dollarbudget. Zusätzliche Kostenlimits kannst du im OpenAI-Projekt setzen. Google-Positionen werden über die separate Ranking-Verbindung gemessen. Suchvolumen wird nicht erfasst.</p>
            </>}
          </>}
        </div><footer className="seo-footer"><ShieldCheck size={13}/>Protected workspace · SEO Panel<span>Standalone Preview</span></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
