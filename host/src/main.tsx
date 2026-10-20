import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SeoPanel from '../../src/widget/SeoPanel';

type Workspace = { id: string; name: string; slug: string; role: string; sites: { id: string; domain: string; name: string }[] };
type Me = { user: { id: string; email: string }; workspaces: Workspace[] };

// Same origin: the VPS reverse proxy serves the app and /api/* from one
// domain, so no separate API URL or CORS handling is needed here.
const api = async <T,>(route: string, body?: any, method = 'GET'): Promise<T> => {
  const res = await fetch('/api/' + route, {
    method: body === undefined && method === 'GET' ? 'GET' : method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  return data;
};

function Auth({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Mein Workspace');
  const [domain, setDomain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const r = await api<{ token: string }>('auth/login', { email, password }, 'POST');
        onAuthed(r.token);
      } else {
        const r = await api<{ token: string }>('auth/signup', { email, password, workspaceName, siteDomain: domain }, 'POST');
        onAuthed(r.token);
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Aktion fehlgeschlagen.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <p className="auth-logo">SEO <span>Panel</span></p>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (mode === 'login' ? ' active' : '')} onClick={() => setMode('login')}>Anmelden</button>
          <button type="button" className={'auth-tab' + (mode === 'signup' ? ' active' : '')} onClick={() => setMode('signup')}>Registrieren</button>
        </div>
        <label className="auth-field">
          <label>E-Mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="auth-field">
          <label>Passwort</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
        </label>
        {mode === 'signup' && <>
          <label className="auth-field">
            <label>Workspace-Name</label>
            <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
          </label>
          <label className="auth-field">
            <label>Website-Domain <small style={{ color: 'var(--host-muted)' }}>(z. B. creativeportrait.art)</small></label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required />
          </label>
        </>}
        <button className="auth-btn" disabled={busy}>{busy ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}</button>
        {msg && <p className={'auth-msg ' + (msg.ok ? 'ok' : 'err')}>{msg.text}</p>}
      </form>
      <p className="auth-hint">Registrierung legt deinen Workspace und deine erste Website automatisch an. Danach richte im Panel unter „Verbindung" Supabase und die KI-Verbindung ein.</p>
    </div>
  );
}

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('seo_panel_token') || '');
  const [me, setMe] = useState<Me | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<Me>('me', undefined, 'GET').then((m) => {
      setMe(m);
      const saved = localStorage.getItem('seo_panel_workspace');
      const ws = m.workspaces.find((w) => w.id === saved) || m.workspaces[0];
      if (ws) { setWorkspaceId(ws.id); localStorage.setItem('seo_panel_workspace', ws.id); }
    }).catch(() => { localStorage.removeItem('seo_panel_token'); setToken(''); });
  }, [token]);

  const signout = () => { localStorage.removeItem('seo_panel_token'); localStorage.removeItem('seo_panel_workspace'); setToken(''); setMe(null); };
  const authed = !!token && !!me;

  if (!authed) return <Auth onAuthed={(t) => { localStorage.setItem('seo_panel_token', t); setToken(t); }} />;

  const ws = me?.workspaces.find((w) => w.id === workspaceId) || me?.workspaces[0];
  const site = ws?.sites[0];

  return (
    <div>
      <div className="app-banner">
        <div className="who">SEO Panel · <strong>{ws?.name || ''}</strong> · Rolle: {ws?.role || ''}</div>
        <button className="signout" onClick={signout}>Abmelden</button>
      </div>
      <main className="app-canvas">
        {me && me.workspaces.length > 1 && (
          <div className="app-ws">
            <label>Workspace:</label>
            <select value={ws?.id} onChange={(e) => { const id = e.target.value; setWorkspaceId(id); localStorage.setItem('seo_panel_workspace', id); }}>
              {me.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        {ws && <SeoPanel accessToken={token} workspaceId={ws.id} siteName={site?.name || ws.name} language="de" darkMode={false} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
