import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchProjectSuites } from './projects';

describe('fetchProjectSuites', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts suites from { ok, suites } response', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      projectId: 56,
      suites: [{ id: 1731, name: 'Suite 1731', is_master: true }],
      count: 1,
    }), { status: 200 })) as any;

    const suites = await fetchProjectSuites(56);
    expect(suites).toHaveLength(1);
    expect(suites[0].id).toBe(1731);
    expect(suites[0].name).toBe('Suite 1731');
    expect(suites[0].is_master).toBe(true);
  });

  it('extracts suites from direct array response (legacy)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([
      { id: 1, name: 'Legacy Suite', is_master: true },
    ]), { status: 200 })) as any;

    const suites = await fetchProjectSuites(56);
    expect(suites).toHaveLength(1);
    expect(suites[0].id).toBe(1);
  });

  it('extracts suites from { suites } without ok wrapper', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      suites: [{ id: 99, name: 'Direct Suite', is_master: false }],
    }), { status: 200 })) as any;

    const suites = await fetchProjectSuites(56);
    expect(suites).toHaveLength(1);
    expect(suites[0].id).toBe(99);
  });

  it('returns empty array when response has no suites and is not array', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      projectId: 56,
    }), { status: 200 })) as any;

    const suites = await fetchProjectSuites(56);
    expect(suites).toEqual([]);
  });

  it('throws on non-ok status with error message', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'TestRail API error',
    }), { status: 502 })) as any;

    await expect(fetchProjectSuites(56)).rejects.toThrow('TestRail API error');
  });
});
