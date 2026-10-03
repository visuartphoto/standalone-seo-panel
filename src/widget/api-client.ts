/** Browser-side API adapter. API credentials for OpenAI/DataForSEO must never be placed here. */
export async function apiAuth(route: string, accessToken: string, options: Record<string, any> = {}, workspaceId?: string) {
  const base = (import.meta as any).env?.VITE_SEO_API_URL;
  if (!base) throw new Error('SEO API URL is not configured. Set VITE_SEO_API_URL.');
  const { retries: _retries, timeoutMs = 30000, ...init } = options;
  const response = await fetch(`${String(base).replace(/\/$/, '')}/${route}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}) },
  });
  return response;
}
