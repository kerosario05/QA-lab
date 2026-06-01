const BASE_URL = import.meta.env.VITE_TESTRAIL_URL ?? '';
const USER = import.meta.env.VITE_TESTRAIL_USER ?? '';
const API_KEY = import.meta.env.VITE_TESTRAIL_API_KEY ?? '';

const auth = btoa(`${USER}:${API_KEY}`);

export async function testrailRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}/index.php?/api/v2${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `TestRail ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
