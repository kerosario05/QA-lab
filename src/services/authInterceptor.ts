import { getToken } from './http';

/**
 * Attaches the session token to every API call the app makes.
 *
 * The pages and service modules predate authentication and call `fetch`
 * directly in ~29 places with several different shapes. Editing each one would
 * be both invasive and unsafe: a single missed call site is a request that
 * silently runs unauthenticated, which is exactly the bug this fixes. One
 * interceptor covers all of them and is the only place to audit.
 *
 * It is deliberately narrow:
 *  - only requests aimed at our own API get the header;
 *  - an Authorization the caller set explicitly is never overwritten;
 *  - anything else (fonts, third-party endpoints) passes through untouched.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function isOwnApiRequest(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    // Same-origin calls to /api/... (the dev server proxies these).
    if (resolved.origin === window.location.origin) return resolved.pathname.startsWith('/api/');
    if (!API_BASE) return false;
    const base = new URL(API_BASE, window.location.origin);
    return resolved.origin === base.origin;
  } catch {
    return false;
  }
}

let installed = false;

export function installAuthInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getToken();
    if (!token) return originalFetch(input, init);

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!isOwnApiRequest(url)) return originalFetch(input, init);

    // A Request object carries its own headers; rebuild it so ours are merged.
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      return originalFetch(new Request(input, { headers }), init);
    }

    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return originalFetch(input, { ...init, headers });
  };
}
