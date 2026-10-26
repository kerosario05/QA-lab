const TRANSIENT_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN']);

/** Bounded retry for safe reads; write requests must never be replayed blindly. */
export async function fetchEngineRequest(
  fetcher: typeof fetch,
  target: string,
  init: RequestInit,
  options: { retryRead: boolean; timeoutMs: number },
): Promise<globalThis.Response> {
  const attempts = options.retryRead ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetcher(target, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
    } catch (error) {
      lastError = error;
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (!TRANSIENT_NETWORK_CODES.has(String(code)) || attempt + 1 >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastError ?? new Error('No se recibió respuesta del motor');
}
