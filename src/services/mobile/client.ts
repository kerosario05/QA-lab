const PROXY = import.meta.env.VITE_API_URL ?? '';

export async function mobileRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}
