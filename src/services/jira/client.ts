const PROXY = import.meta.env.VITE_API_URL ?? '';

export async function jiraRequest<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const method = opts?.method ?? 'GET';
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET' && opts?.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${PROXY}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
