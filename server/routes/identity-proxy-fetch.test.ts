import { describe, expect, it, vi } from 'vitest';
import { fetchEngineRequest } from './identity-proxy-fetch';

function networkError(code: string) {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

describe('identity proxy retry policy', () => {
  it('retries one transient GET failure and returns the next response', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const response = await fetchEngineRequest(fetcher, 'http://engine/api/test-design/drafts', { method: 'GET' }, { retryRead: true, timeoutMs: 1000 });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not replay a generation or publish POST after a network failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(networkError('ECONNRESET'));
    await expect(fetchEngineRequest(fetcher, 'http://engine/api/test-design/generate', { method: 'POST', body: '{}' }, { retryRead: false, timeoutMs: 1000 })).rejects.toThrow('fetch failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-transient read errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(networkError('CERT_HAS_EXPIRED'));
    await expect(fetchEngineRequest(fetcher, 'http://engine/api/test-design/drafts', { method: 'GET' }, { retryRead: true, timeoutMs: 1000 })).rejects.toThrow('fetch failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
