import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, scenariosRequest } from './client';

describe('scenariosRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('throws PREVIEW_EMPTY_RESPONSE when response body is empty', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' }));

    await expect(scenariosRequest('/api/scenarios/preview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      errorCode: 'PREVIEW_EMPTY_RESPONSE',
      detail: 'Empty response body',
    });
  });

  it('throws PREVIEW_INVALID_RESPONSE when response body is not valid JSON', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200, statusText: 'OK' }));

    await expect(scenariosRequest('/api/scenarios/preview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      errorCode: 'PREVIEW_INVALID_RESPONSE',
      detail: 'Invalid JSON response',
    });
  });

  it('preserves backend structured error codes', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      errorCode: 'PREVIEW_GENERATOR_FAILED',
      message: 'Generator exploded',
      details: 'boom',
    }), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(scenariosRequest('/api/scenarios/preview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      errorCode: 'PREVIEW_GENERATOR_FAILED',
      detail: 'Generator exploded',
    });
  });

  it('returns parsed JSON on success', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, scenarios: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(scenariosRequest('/api/scenarios/preview')).resolves.toEqual({ ok: true, scenarios: [] });
  });

  it('throws ApiError instance for empty response body', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response('', { status: 200, statusText: 'OK' }));

    try {
      await scenariosRequest('/api/scenarios/preview');
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).errorCode).toBe('PREVIEW_EMPTY_RESPONSE');
    }
  });
});
