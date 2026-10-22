import { expect, it, vi } from 'vitest';
import { TestRailCacheService } from './testrail-cache';

it('a forced refresh replaces cached case content and an older request cannot overwrite it', async () => {
  const cache = new TestRailCacheService();
  let resolve!: (value: string) => void;
  const old = cache.getOrFetch('cases', [1], () => new Promise<string>(done => { resolve = done; }));
  expect((await cache.getOrFetch('cases', [1], async () => 'edited', { refresh: true })).data).toBe('edited');
  resolve('old');
  await old;
  expect((await cache.getOrFetch('cases', [1], async () => 'unexpected')).data).toBe('edited');
});

it('refresh continues respecting an active TestRail rate limit', async () => {
  const cache = new TestRailCacheService();
  await cache.getOrFetch('cases', [1], async () => 'saved');
  const limited = vi.fn(async () => { throw { rateLimited: true, retryAfterSeconds: 60 }; });
  expect(await cache.getOrFetch('cases', [1], limited, { refresh: true })).toMatchObject({ stale: true, rateLimited: true });
  const fetcher = vi.fn(async () => 'unexpected');
  await cache.getOrFetch('cases', [1], fetcher, { refresh: true });
  expect(fetcher).not.toHaveBeenCalled();
});
