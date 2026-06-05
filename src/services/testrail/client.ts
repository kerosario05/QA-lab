const BASE_URL = import.meta.env.VITE_TESTRAIL_URL ?? '';
const USER = import.meta.env.VITE_TESTRAIL_USER ?? '';
const API_KEY = import.meta.env.VITE_TESTRAIL_API_KEY ?? '';

const auth = btoa(`${USER}:${API_KEY}`);

const RETRY_DELAYS = [0, 500, 1000, 2000];

export async function testrailRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }

    try {
      const res = await fetch(`${BASE_URL}/index.php?/api/v2${path}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        ...options,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

        if (attempt < RETRY_DELAYS.length - 1) {
          continue;
        }

        const body = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error(body?.error ?? `TestRail rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`),
          { status: 429, rateLimited: true, retryAfterSeconds },
        );
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `TestRail ${res.status}: ${res.statusText}`);
      }

      return res.json();
    } catch (err: any) {
      lastError = err;

      if (err?.rateLimited && attempt < RETRY_DELAYS.length - 1) {
        continue;
      }

      if (err?.rateLimited) throw err;

      const isNetworkError = err instanceof TypeError;
      if (attempt >= RETRY_DELAYS.length - 1 || !isNetworkError) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('TestRail request failed');
}
