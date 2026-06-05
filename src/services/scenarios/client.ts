const PROXY = import.meta.env.VITE_API_URL ?? '';

export async function scenariosRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    (err as any).endpoint = path;
    throw err;
  }

  const rawBody = await res.text();
  if (!res.ok) {
    let payload: any = null;
    if (rawBody.trim()) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        const err = new Error(`PREVIEW_INVALID_RESPONSE|Invalid JSON response (HTTP ${res.status})`) as Error & { status?: number; errorCode?: string; rawBody?: string; endpoint?: string };
        err.status = res.status;
        err.errorCode = 'PREVIEW_INVALID_RESPONSE';
        err.rawBody = rawBody;
        err.endpoint = path;
        throw err;
      }
    } else {
      const err = new Error(`PREVIEW_EMPTY_RESPONSE|Empty response body (HTTP ${res.status})`) as Error & { status?: number; errorCode?: string; rawBody?: string; endpoint?: string };
      err.status = res.status;
      err.errorCode = 'PREVIEW_EMPTY_RESPONSE';
      err.rawBody = rawBody;
      err.endpoint = path;
      throw err;
    }

    const err = new Error(
      `${payload?.errorCode ?? payload?.error ?? 'HTTP_ERROR'}|${payload?.message ?? res.statusText}`,
    ) as Error & { status?: number; errorCode?: string; details?: string; rawBody?: string; endpoint?: string };
    err.status = res.status;
    err.errorCode = payload?.errorCode ?? payload?.error ?? `HTTP_${res.status}`;
    err.details = payload?.details;
    err.rawBody = rawBody;
    err.endpoint = path;
    throw err;
  }

  if (!rawBody.trim()) {
    const err = new Error(`PREVIEW_EMPTY_RESPONSE|Empty success body`) as Error & { status?: number; errorCode?: string; rawBody?: string; endpoint?: string };
    err.status = res.status;
    err.errorCode = 'PREVIEW_EMPTY_RESPONSE';
    err.rawBody = rawBody;
    err.endpoint = path;
    throw err;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    const err = new Error(`PREVIEW_INVALID_RESPONSE|Invalid JSON response`) as Error & { status?: number; errorCode?: string; rawBody?: string; endpoint?: string };
    err.status = res.status;
    err.errorCode = 'PREVIEW_INVALID_RESPONSE';
    err.rawBody = rawBody;
    err.endpoint = path;
    throw err;
  }
}
