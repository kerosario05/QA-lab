import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDiscoveryBatch } from './runs-provider';

const runtimeEntriesByCase = {
  '100': [{ key: 'auth.username', value: 'fixture-redacted', source: 'test', sensitive: true }],
};

describe('requestDiscoveryBatch context-only forwarding', () => {
  let capturedPayload: Record<string, unknown> | undefined;

  beforeEach(() => {
    process.env.RUN_PROVIDER_BASE_URL = 'http://mock-provider';
    capturedPayload = undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      capturedPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ jobId: 'mock-job', status: 'queued' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RUN_PROVIDER_BASE_URL;
  });

  it('forwards contextOnly and preserves runtime entries without a server harness', async () => {
    await requestDiscoveryBatch( [100], 'Section', 'Project', {
      appSlug: 'app-a',
      contextOnly: true,
      runtimeEntriesByCase,
    });

    const payload = capturedPayload as Record<string, unknown>;
    expect(payload.contextOnly).toBe(true);
    expect(payload.appSlug).toBe('app-a');
    expect(payload.caseIds).toEqual([100]);
    expect(payload.runtimeEntriesByCase).toEqual(runtimeEntriesByCase);
  });

  it('keeps context-only opt-in for normal launches', async () => {
    await requestDiscoveryBatch( [100], 'Section', 'Project', {
      appSlug: 'app-a',
      contextOnly: false,
      runtimeEntriesByCase,
    });

    const payload = capturedPayload as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'contextOnly')).toBe(false);
    expect(payload.runtimeEntriesByCase).toEqual(runtimeEntriesByCase);
  });
});
