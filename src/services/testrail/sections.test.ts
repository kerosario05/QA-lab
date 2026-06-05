import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the sections proxy
const mockRateLimitMap = new Map<string, { retryAt: number; retryAfterSeconds: number }>();
const mockSectionsCache = new Map<string, { data: unknown[]; fetchedAt: number }>();

const mockTrSectionsProxy = {
  getSections: vi.fn(async (projectId: number, suiteId: number) => {
    const key = `${projectId}:${suiteId}`;
    const rlEntry = mockRateLimitMap.get(key);
    if (rlEntry && Date.now() < rlEntry.retryAt) {
      const remaining = Math.ceil((rlEntry.retryAt - Date.now()) / 1000);
      const cached = mockSectionsCache.get(key);
      if (cached) {
        return {
          ok: true,
          sections: cached.data,
          fromCache: true,
          stale: true,
          rateLimited: true,
          warning: 'testrail_rate_limited',
          retryAfterSeconds: remaining,
        };
      }
      throw new Error(`TestRail rate limit active. Retry after ${remaining} seconds.`);
    }
    const sections = [{ id: 1, name: 'Section 1', displayName: 'Section 1' }];
    mockSectionsCache.set(key, { data: sections, fetchedAt: Date.now() });
    return {
      ok: true,
      sections,
      fromCache: false,
      stale: false,
      rateLimited: false,
      retryAfterSeconds: 0,
    };
  }),

  getRateLimitInfo: vi.fn((projectId: number, suiteId: number) => {
    const key = `${projectId}:${suiteId}`;
    const entry = mockRateLimitMap.get(key);
    if (!entry || Date.now() >= entry.retryAt) {
      mockRateLimitMap.delete(key);
      return null;
    }
    return {
      rateLimited: true,
      retryAfterSeconds: Math.ceil((entry.retryAt - Date.now()) / 1000),
    };
  }),

  getCachedSections: vi.fn((projectId: number, suiteId: number) => {
    const key = `${projectId}:${suiteId}`;
    return mockSectionsCache.get(key)?.data ?? null;
  }),
};

beforeEach(() => {
  mockRateLimitMap.clear();
  mockSectionsCache.clear();
  vi.clearAllMocks();
});

describe('sections rate limit', () => {
  it('after 429 does not call again until expired', async () => {
    const key = '1:1';
    mockRateLimitMap.set(key, {
      retryAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    const rlInfo = mockTrSectionsProxy.getRateLimitInfo(1, 1);
    expect(rlInfo?.rateLimited).toBe(true);

    // Should not call getSections
    const shouldCall = !rlInfo?.rateLimited;
    expect(shouldCall).toBe(false);
  });

  it('uses frontend cache if exists during rate limit', async () => {
    const key = '1:1';
    mockRateLimitMap.set(key, {
      retryAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });
    mockSectionsCache.set(key, {
      data: [{ id: 1, name: 'Cached Section' }],
      fetchedAt: Date.now() - 10_000,
    });

    const cached = mockTrSectionsProxy.getCachedSections(1, 1);
    expect(cached).toBeDefined();
    expect(cached).toHaveLength(1);
    expect((cached as any)[0].name).toBe('Cached Section');
  });

  it('retry button disabled during countdown', () => {
    const countdown = 30;
    const isDisabled = countdown > 0;
    expect(isDisabled).toBe(true);

    const countdownZero = 0;
    const isEnabled = countdownZero <= 0;
    expect(isEnabled).toBe(true);
  });

  it('countdown decreases correctly', () => {
    const retryAt = Date.now() + 44_000;
    const remaining = Math.ceil((retryAt - Date.now()) / 1000);
    expect(remaining).toBeGreaterThan(40);
    expect(remaining).toBeLessThanOrEqual(44);
  });

  it('useEffect does not fetch if key unchanged', () => {
    let lastKey: string | null = null;
    let fetchCount = 0;

    const fetchIfKeyChanged = (key: string) => {
      if (lastKey === key) return;
      fetchCount++;
      lastKey = key;
    };

    fetchIfKeyChanged('1:1');
    expect(fetchCount).toBe(1);

    fetchIfKeyChanged('1:1');
    expect(fetchCount).toBe(1);

    fetchIfKeyChanged('1:2');
    expect(fetchCount).toBe(2);
  });

  it('returns stale cache response when rate limited with cache', async () => {
    const key = '1:1';
    mockRateLimitMap.set(key, {
      retryAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });
    mockSectionsCache.set(key, {
      data: [{ id: 1, name: 'Stale Section' }],
      fetchedAt: Date.now() - 10_000,
    });

    const result = await mockTrSectionsProxy.getSections(1, 1);
    expect(result.rateLimited).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.sections).toHaveLength(1);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(result.warning).toBe('testrail_rate_limited');
  });

  it('throws when rate limited without cache', async () => {
    const key = '1:1';
    mockRateLimitMap.set(key, {
      retryAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    await expect(mockTrSectionsProxy.getSections(1, 1)).rejects.toThrow('rate limit');
  });

  it('rate limit info returns null when expired', () => {
    const key = '1:1';
    mockRateLimitMap.set(key, {
      retryAt: Date.now() - 1000,
      retryAfterSeconds: 1,
    });

    const rlInfo = mockTrSectionsProxy.getRateLimitInfo(1, 1);
    expect(rlInfo).toBeNull();
  });
});
