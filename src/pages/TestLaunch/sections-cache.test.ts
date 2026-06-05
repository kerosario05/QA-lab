import { describe, expect, it } from 'vitest';
import { getSectionsCacheWarning, shouldSkipSectionsFetch } from './sections-cache';

describe('sections cache helpers', () => {
  it('skips fetching when key is unchanged and sections are already loaded', () => {
    expect(shouldSkipSectionsFetch({
      currentKey: '56:1731',
      lastFetchedKey: '56:1731',
      loading: false,
      hasSections: true,
    })).toBe(true);
  });

  it('does not skip when key changes', () => {
    expect(shouldSkipSectionsFetch({
      currentKey: '56:1732',
      lastFetchedKey: '56:1731',
      loading: false,
      hasSections: true,
    })).toBe(false);
  });

  it('builds a soft stale-cache warning', () => {
    expect(getSectionsCacheWarning(45)).toBe(
      'Mostrando secciones en caché. TestRail está limitando solicitudes. Reintenta en 45 segundos.',
    );
  });
});
