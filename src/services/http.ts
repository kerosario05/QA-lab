/**
 * Central HTTP layer for authenticated calls.
 *
 * Every request carries the bearer token, and the three answers the API can give
 * about identity are turned into typed errors so screens can react instead of
 * showing a raw status code: the session died (log back in), the password change
 * is still pending (go to that screen), or this user simply may not do this.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'qa-lab.token';

export class ApiError extends Error {
  // Written out longhand rather than as constructor parameter properties: this
  // project builds with `erasableSyntaxOnly`, which forbids that shorthand.
  readonly status: number;
  readonly code: string;
  readonly payload: any;

  constructor(status: number, code: string, message: string, payload: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }

  /** The session is gone: the caller must log in again. */
  get isUnauthenticated(): boolean {
    return (
      this.status === 401 ||
      ['session_expired', 'session_revoked', 'invalid_token', 'missing_token'].includes(this.code)
    );
  }

  /** A password change is pending; nothing else will work until it is done. */
  get needsPasswordChange(): boolean {
    return this.code === 'password_change_required';
  }

  get isForbidden(): boolean {
    return this.status === 403 && !this.needsPasswordChange;
  }
}

// --- token storage --------------------------------------------------------

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private windows and blocked site data: the session just won't survive a reload.
  }
}

// --- session-lost notification -------------------------------------------

type SessionListener = (reason: 'expired' | 'revoked') => void;
const sessionListeners = new Set<SessionListener>();

/**
 * Lets the auth provider react to a session that died mid-request, wherever in
 * the app that request was made.
 */
export function onSessionLost(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function announceSessionLost(code: string): void {
  const reason = code === 'session_revoked' ? 'revoked' : 'expired';
  for (const listener of sessionListeners) listener(reason);
}

// --- request --------------------------------------------------------------

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip the global session-lost notification (used by the login screen). */
  silent?: boolean;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, silent, headers, ...rest } = options;
  const token = getToken();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((headers as Record<string, string>) ?? {}),
  };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The dev setup has two processes: `npm run dev` starts only Vite, so this
    // is almost always the BFF (server/index.ts) not being up.
    throw new ApiError(
      0,
      'network_error',
      `No se pudo conectar con el servidor de QA Lab en ${BASE_URL || 'el origen actual'}. ` +
        'Verifica que esté corriendo (npm run dev:all).',
    );
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const code = payload?.error ?? `http_${response.status}`;
    const message = payload?.message ?? `${response.status} ${response.statusText}`;
    const error = new ApiError(response.status, code, message, payload);
    if (error.isUnauthenticated && !silent) announceSessionLost(code);
    throw error;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
