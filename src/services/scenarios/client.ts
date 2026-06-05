const PROXY = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  name = 'ApiError';
  status: number;
  errorCode: string;
  detail?: string;
  body?: unknown;

  constructor(status: number, errorCode: string, detail?: string, body?: unknown) {
    super(errorCode);
    this.status = status;
    this.errorCode = errorCode;
    this.detail = detail;
    this.body = body;
  }
}

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

  if (!rawBody.trim()) {
    throw new ApiError(res.status, 'PREVIEW_EMPTY_RESPONSE', 'Empty response body');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiError(res.status, 'PREVIEW_INVALID_RESPONSE', 'Invalid JSON response');
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.errorCode ?? payload?.error ?? `HTTP_${res.status}`,
      payload?.message ?? payload?.detail ?? res.statusText,
      payload,
    );
  }

  return payload as T;
}
