import type { TRSection, TRCase } from './types';

const PROXY = import.meta.env.VITE_API_URL ?? '';
const FRESH_TTL = 5 * 60 * 1000;
const STALE_TTL = 30 * 60 * 1000;

interface CacheEntry<T> { data: T; fetchedAt: number; }

const sectionsCache = new Map<string, CacheEntry<TRSection[]>>();
const casesCache = new Map<string, CacheEntry<any>>();
const rateLimitCache = new Map<string, number>();

function cacheKey(projectId: number, suiteId: number): string {
  return `${projectId}:${suiteId}`;
}

function isFresh(key: string, cache: Map<string, CacheEntry<any>>): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < FRESH_TTL;
}

function isStale(key: string, cache: Map<string, CacheEntry<any>>): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < STALE_TTL;
}

function isRateLimited(key: string): boolean {
  const until = rateLimitCache.get(key);
  if (!until) return false;
  if (Date.now() >= until) { rateLimitCache.delete(key); return false; }
  return true;
}

function setRateLimited(key: string, retryAfterSeconds: number): void {
  rateLimitCache.set(key, Date.now() + retryAfterSeconds * 1000);
}

export interface SectionsResponse {
  ok: boolean;
  sections: TRSection[];
  fromCache: boolean;
  stale: boolean;
  rateLimited: boolean;
  warning?: string;
  retryAfterSeconds: number;
}

export interface SectionCasesResponse {
  ok: boolean;
  sectionId: number;
  projectId: number;
  suiteId: number;
  count: number;
  cases: TRCase[];
  stale?: boolean;
  rateLimited?: boolean;
  source?: string;
  warning?: string;
}

export const trSectionsProxy = {
  getSections: async (projectId: number, suiteId: number): Promise<TRSection[]> => {
    const key = cacheKey(projectId, suiteId);

    const cached = sectionsCache.get(key);
    if (cached && isFresh(key, sectionsCache)) {
      return cached.data;
    }

    if (isRateLimited(key)) {
      const stale = sectionsCache.get(key);
      if (stale && isStale(key, sectionsCache)) {
        console.log(`[testrail-cache] stale key=${key} reason=rate_limited`);
        return stale.data;
      }
      throw new Error(`TestRail rate limit active for sections.`);
    }

    try {
      const res = await fetch(
        `${PROXY}/api/testrail/sections?projectId=${projectId}&suiteId=${suiteId}`,
      );

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const retryAfter = body?.retryAfterSeconds ?? 60;
        setRateLimited(key, retryAfter);

        const stale = sectionsCache.get(key);
        if (stale && isStale(key, sectionsCache)) {
          return stale.data;
        }
        throw new Error(`TestRail rate limit exceeded. Retry after ${retryAfter} seconds.`);
      }

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data?.sections ?? data?.data ?? []);
      const sections: TRSection[] = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.sections) ? (raw as any).sections : []);
      sectionsCache.set(key, { data: sections, fetchedAt: Date.now() });
      rateLimitCache.delete(key);
      return sections;
    } catch (err: any) {
      if (!err.message?.includes('rate limit')) throw err;

      const stale = sectionsCache.get(key);
      if (stale && isStale(key, sectionsCache)) {
        return stale.data;
      }
      throw err;
    }
  },

  getCases: async (
    sectionId: number,
    projectId: number,
    suiteId: number,
    includeSubsections?: boolean,
    localProjectId?: string,
  ): Promise<SectionCasesResponse> => {
    const key = `cases:${projectId}:${suiteId}:${sectionId}:${includeSubsections ?? true}:${localProjectId ?? ''}`;

    const cached = casesCache.get(key);
    if (cached && isFresh(key, casesCache)) {
      return cached.data;
    }

    const rlKey = cacheKey(projectId, suiteId);
    if (isRateLimited(rlKey)) {
      const stale = casesCache.get(key);
      if (stale && isStale(key, casesCache)) {
        return {
          ...stale.data,
          stale: true,
          rateLimited: true,
          source: 'cache',
          warning: 'testrail_rate_limited',
        };
      }
      const retryAfter = Math.ceil((rateLimitCache.get(rlKey)! - Date.now()) / 1000);
      throw Object.assign(new Error(`TestRail rate limit active. Retry after ${retryAfter} seconds.`), {
        status: 429,
        rateLimited: true,
        retryAfterSeconds: retryAfter,
      });
    }

    const qs = `includeSubsections=${includeSubsections !== false}`;
    const localProjectParam = localProjectId ? `&localProjectId=${encodeURIComponent(localProjectId)}` : '';
    const url = `${PROXY}/api/testrail/sections/${sectionId}/cases?projectId=${projectId}&suiteId=${suiteId}&${qs}${localProjectParam}`;

    try {
      const res = await fetch(url);

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const retryAfter = body?.retryAfterSeconds ?? 60;
        setRateLimited(rlKey, retryAfter);
        console.log(`[testrail-api] rate_limited resource=section-cases section=${sectionId}`);

        const stale = casesCache.get(key);
        if (stale && isStale(key, casesCache)) {
          return {
            ...stale.data,
            stale: true,
            rateLimited: true,
            source: 'cache',
            warning: 'testrail_rate_limited',
          };
        }
        throw Object.assign(new Error(`TestRail rate limit exceeded. Retry after ${retryAfter} seconds.`), {
          status: 429,
          rateLimited: true,
          retryAfterSeconds: retryAfter,
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body?.error ?? `${res.status} ${res.statusText}`), {
          status: res.status,
          error: body?.error ?? 'unknown',
        });
      }

      const data = await res.json();
      const response: SectionCasesResponse = {
        ok: data.ok ?? true,
        sectionId: data.sectionId ?? sectionId,
        projectId: data.projectId ?? projectId,
        suiteId: data.suiteId ?? suiteId,
        count: data.count ?? data.cases?.length ?? 0,
        cases: data.cases ?? [],
      };
      casesCache.set(key, { data: response, fetchedAt: Date.now() });
      rateLimitCache.delete(rlKey);
      return response;
    } catch (err: any) {
      if (err.status !== 429) throw err;

      const stale = casesCache.get(key);
      if (stale && isStale(key, casesCache)) {
        return {
          ...stale.data,
          stale: true,
          rateLimited: true,
          source: 'cache',
          warning: 'testrail_rate_limited',
        };
      }
      throw err;
    }
  },
};

export function resetTestRailSectionCachesForTests(): void {
  sectionsCache.clear();
  casesCache.clear();
  rateLimitCache.clear();
}
