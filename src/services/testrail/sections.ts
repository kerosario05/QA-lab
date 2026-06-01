import type { TRSection, TRCase } from './types';

const PROXY = import.meta.env.VITE_API_URL ?? '';
const TTL = 60_000;

interface CacheEntry<T> { data: T; fetchedAt: number; }
const sectionsCache = new Map<string, CacheEntry<TRSection[]>>();

export const trSectionsProxy = {
  getSections: async (projectId: number, suiteId: number): Promise<TRSection[]> => {
    const key = `${projectId}:${suiteId}`;
    const cached = sectionsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < TTL) return cached.data;

    const data: TRSection[] = await fetch(
      `${PROXY}/api/testrail/sections?projectId=${projectId}&suiteId=${suiteId}`,
    ).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    }).then((d: any) => Array.isArray(d) ? d : (d?.sections ?? []));

    sectionsCache.set(key, { data, fetchedAt: Date.now() });
    return data;
  },

  getCases: (sectionId: number, projectId: number, suiteId: number): Promise<TRCase[]> =>
    fetch(`${PROXY}/api/testrail/sections/${sectionId}/cases?projectId=${projectId}&suiteId=${suiteId}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data: any) => Array.isArray(data) ? data : (data?.cases ?? [])),
};
