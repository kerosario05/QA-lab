const FRESH_TTL = 5 * 60 * 1000;
const STALE_TTL = 30 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class TestRailCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();
  private rateLimitUntil = new Map<string, number>();

  private log(prefix: string, key: string, extra?: string): void {
    const msg = extra ? `${prefix} key=${key} ${extra}` : `${prefix} key=${key}`;
    console.log(`[testrail-cache] ${msg}`);
  }

  private buildKey(resource: string, ...parts: (string | number)[]): string {
    return [resource, ...parts].join(':');
  }

  private isFresh(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < FRESH_TTL;
  }

  private isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < STALE_TTL;
  }

  private getFreshOrNull<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isFresh(key)) return entry.data as T;
    return null;
  }

  private getStaleOrNull<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isStale(key)) return entry.data as T;
    return null;
  }

  isRateLimited(key: string): boolean {
    const until = this.rateLimitUntil.get(key);
    if (!until) return false;
    if (Date.now() >= until) {
      this.rateLimitUntil.delete(key);
      return false;
    }
    return true;
  }

  private setRateLimited(key: string, retryAfterSeconds: number): void {
    this.rateLimitUntil.set(key, Date.now() + retryAfterSeconds * 1000);
  }

  getRetryAfterSeconds(key: string): number {
    const until = this.rateLimitUntil.get(key);
    if (!until || Date.now() >= until) return 0;
    return Math.ceil((until - Date.now()) / 1000);
  }

  async getOrFetch<T>(
    resource: string,
    params: (string | number)[],
    fetcher: () => Promise<T>,
  ): Promise<{ data: T; stale?: boolean; rateLimited?: boolean; retryAfterSeconds?: number }> {
    const key = this.buildKey(resource, ...params);

    const fresh = this.getFreshOrNull<T>(key);
    if (fresh !== null) {
      this.log('hit', key, '(fresh)');
      return { data: fresh };
    }

    if (this.isRateLimited(key)) {
      const stale = this.getStaleOrNull<T>(key);
      if (stale !== null) {
        const retryAfter = this.getRetryAfterSeconds(key);
        this.log('stale', key, `reason=rate_limited retry_after=${retryAfter}s`);
        return {
          data: stale,
          stale: true,
          rateLimited: true,
          retryAfterSeconds: retryAfter,
        };
      }
      const retryAfter = this.getRetryAfterSeconds(key);
      throw Object.assign(new Error(`TestRail rate limit active. Retry after ${retryAfter} seconds.`), {
        status: 429,
        rateLimited: true,
        retryAfterSeconds: retryAfter,
      });
    }

    const inflight = this.inflight.get(key);
    if (inflight) {
      this.log('inflight', key);
      const data = await inflight as T;
      this.cache.set(key, { data, fetchedAt: Date.now() });
      return { data };
    }

    this.log('miss', key);
    const promise = fetcher()
      .then(data => {
        this.cache.set(key, { data, fetchedAt: Date.now() });
        this.inflight.delete(key);
        this.rateLimitUntil.delete(key);
        return data;
      })
      .catch(err => {
        this.inflight.delete(key);

        if (err?.rateLimited) {
          const retryAfter = err?.retryAfterSeconds ?? 60;
          this.setRateLimited(key, retryAfter);
          console.log(`[testrail-api] rate_limited resource=${resource} params=${params.join(':')}`);

          const stale = this.getStaleOrNull<T>(key);
          if (stale !== null) {
            this.log('stale', key, 'reason=rate_limited');
            return stale; // Return stale data as fallback
          }

          throw Object.assign(new Error(`TestRail rate limit active. Retry after ${retryAfter} seconds.`), {
            status: 429,
            rateLimited: true,
            retryAfterSeconds: retryAfter,
          });
        }

        throw err;
      });

    this.inflight.set(key, promise);
    return { data: await promise };
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
    this.rateLimitUntil.clear();
  }
}
