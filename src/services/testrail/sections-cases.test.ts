import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resetTestRailSectionCachesForTests, trSectionsProxy, invalidateTestRailCases } from './sections';
import { testDesignApi } from '../test-design';
import { TestRailCacheService } from '../../../server/testrail-cache';

describe('sections cases client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetTestRailSectionCachesForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('publishing an edited case refreshes browser and proxy caches only for its section', async () => {
    const proxy = new TestRailCacheService();
    let action = 'Solicitar el código por SMS';
    let upstreamCalls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/publish/testrail')) {
        action = 'Presionar "SMS"';
        return Response.json({ draft: { testRail: { projectId: 56, suiteId: 17, sectionId: 9 } }, results: [] });
      }
      const refresh = String(url).includes('refresh=true');
      const section = String(url).includes('/sections/10/') ? 10 : 9;
      const response = await proxy.getOrFetch('section-cases', [56, 17, section], async () => {
        upstreamCalls++;
        return { cases: [{ id: 77, custom_steps_separated: [{ content: action }] }] };
      }, { refresh });
      return Response.json(response.data);
    }) as typeof fetch;
    await trSectionsProxy.getCases(9, 56, 17);
    await trSectionsProxy.getCases(10, 56, 17);
    await testDesignApi.publishTestRail('draft', undefined, ['edited-case']);
    const updated = await trSectionsProxy.getCases(9, 56, 17);
    expect(updated.cases[0].custom_steps_separated?.[0].content).toBe('Presionar "SMS"');
    await trSectionsProxy.getCases(10, 56, 17);
    expect(upstreamCalls).toBe(3);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toContain('refresh=true');
  });

  it('an old in-flight response cannot repopulate the invalidated browser cache', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
      .mockResolvedValueOnce(Response.json({ cases: [{ id: 77, title: 'updated' }] }));
    globalThis.fetch = fetcher;
    const old = trSectionsProxy.getCases(9, 56, 17);
    invalidateTestRailCases(56, 17, 9);
    await trSectionsProxy.getCases(9, 56, 17);
    resolve(Response.json({ cases: [{ id: 77, title: 'old' }] }));
    await old;
    expect((await trSectionsProxy.getCases(9, 56, 17)).cases[0].title).toBe('updated');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not present a stale proxy fallback as the edited case after invalidation', async () => {
    invalidateTestRailCases(56, 17, 9);
    globalThis.fetch = vi.fn(async () => Response.json({ cases: [{ id: 77, title: 'old' }], stale: true, rateLimited: true })) as typeof fetch;
    await expect(trSectionsProxy.getCases(9, 56, 17)).rejects.toMatchObject({ status: 429 });
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
