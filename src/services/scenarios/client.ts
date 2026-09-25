const PROXY = import.meta.env.VITE_API_URL ?? '';

/**
 * Error estructurado de la API de escenarios.
 * Se exporta como clase (no como type) porque los consumidores la usan con
 * `instanceof` — ver `formatScenarioPreviewError`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly detail: string;

  constructor(status: number, errorCode: string, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.detail = detail;
  }
}

export async function scenariosRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await res.text();
  if (!body.trim()) {
    throw new ApiError(res.status, 'PREVIEW_EMPTY_RESPONSE', 'Empty response body');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiError(res.status, 'PREVIEW_INVALID_RESPONSE', 'Invalid JSON response');
  }

  if (!res.ok) {
    const payload = (parsed ?? {}) as { errorCode?: string; error?: string; message?: string; details?: string };
    throw new ApiError(
      res.status,
      payload.errorCode ?? payload.error ?? res.statusText ?? 'PREVIEW_REQUEST_FAILED',
      payload.message ?? payload.details ?? res.statusText ?? 'Request failed',
    );
  }

  return parsed as T;
}
