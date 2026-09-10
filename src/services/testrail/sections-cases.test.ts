import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resetTestRailSectionCachesForTests, trSectionsProxy } from './sections';

describe('sections cases client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetTestRailSectionCachesForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns cases list when backend sends cases', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sectionId: 4903,
      count: 2,
      cases: [{ id: 1, title: 'Caso 1' }, { id: 2, title: 'Caso 2' }],
    }), { status: 200 })) as any;

    const result = await trSectionsProxy.getCases(4903, 56, 1731, undefined, 'local-project-1');

    expect(result.ok).toBe(true);
    expect(result.cases).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.sectionId).toBe(4903);
    expect(globalThis.fetch).toHaveBeenCalled();
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('projectId=56');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('localProjectId=local-project-1');
  });

  it('returns empty cases list when backend sends no cases', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sectionId: 4903,
      count: 0,
      cases: [],
    }), { status: 200 })) as any;

    const result = await trSectionsProxy.getCases(4903, 56, 1731);

    expect(result.ok).toBe(true);
    expect(result.cases).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('throws a readable error on real 404', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'section_not_found',
      message: 'No se encontró la sección en TestRail',
    }), { status: 404, statusText: 'Not Found' })) as any;

    await expect(trSectionsProxy.getCases(4903, 56, 1731)).rejects.toMatchObject({
      status: 404,
      error: 'section_not_found',
    });
  });

  it('returns stale cached count when rate limited and cache exists', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sectionId: 4903,
      projectId: 56,
      suiteId: 1731,
      includeSubsections: true,
      count: 1,
      cases: [{ id: 1, title: 'Caso 1' }],
    }), { status: 200 })) as any;

    await trSectionsProxy.getCases(4903, 56, 1731, true);

    now += 301_000;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'testrail_rate_limited',
      message: 'Rate limited',
      retryAfterSeconds: 45,
    }), { status: 429, statusText: 'Too Many Requests' })) as any;

    const result = await trSectionsProxy.getCases(4903, 56, 1731, true);

    expect(result.ok).toBe(true);
    expect(result.rateLimited).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.count).toBe(1);
    expect(result.source).toBe('cache');
    expect(result.warning).toBe('testrail_rate_limited');
  });
});
