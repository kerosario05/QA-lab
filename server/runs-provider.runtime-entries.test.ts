import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestDiscoveryBatch } from './runs-provider';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.RUN_PROVIDER_BASE_URL = 'http://localhost:3001';
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('requestDiscoveryBatch runtimeEntriesByCase transport', () => {
  it('forwards runtimeEntriesByCase intact in the discovery-batch body', async () => {
    let capturedBody: any = null;
    const runtimeEntriesByCase = {
      '4171': [
        { key: 'auth.username', value: 'runtime-user', source: 'manual_runtime', sensitive: false },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-1', status: 'queued' }), { status: 202 });
    });

    await requestDiscoveryBatch([4171], undefined, undefined, { runtimeEntriesByCase } as any);

    expect(capturedBody.runtimeEntriesByCase).toEqual(runtimeEntriesByCase);
    expect(capturedBody.caseIds).toEqual([4171]);
  });

  it('omits runtimeEntriesByCase from the body when not provided', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-2', status: 'queued' }), { status: 202 });
    });

    await requestDiscoveryBatch([4171]);

    expect(capturedBody.runtimeEntriesByCase).toBeUndefined();
    expect(capturedBody.caseIds).toEqual([4171]);
  });

  it('preserves separate values for distinct caseIds', async () => {
    let capturedBody: any = null;
    const runtimeEntriesByCase = {
      '4171': [{ key: 'customerId', value: '12345', source: 'manual_runtime', sensitive: false }],
      '4172': [{ key: 'customerId', value: '67890', source: 'manual_runtime', sensitive: false }],
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-3', status: 'queued' }), { status: 202 });
    });

    await requestDiscoveryBatch([4171, 4172], undefined, undefined, { runtimeEntriesByCase } as any);

    expect(capturedBody.runtimeEntriesByCase).toEqual(runtimeEntriesByCase);
  });

  it('omits runtimeEntriesByCase when all case values are empty', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-4', status: 'queued' }), { status: 202 });
    });

    await requestDiscoveryBatch([4171], undefined, undefined, {
      runtimeEntriesByCase: { '4171': [] },
    } as any);

    expect(capturedBody.runtimeEntriesByCase).toBeUndefined();
  });

  it('forwards explicit full rediscovery flags without inferring them from legacy flags', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-5', status: 'queued' }), { status: 202 });
    });

    await requestDiscoveryBatch([4171], undefined, undefined, { forceRediscovery: true });

    expect(capturedBody.forceRediscovery).toBe(true);
    expect(capturedBody.overwrite).toBe(true);
    expect(capturedBody.rerunActive).toBe(true);
    expect(capturedBody.autoPromote).toBe(true);
    expect(capturedBody.autoPom).toBe(true);
    expect(capturedBody.contextOnly).toBe(false);
  });
});
