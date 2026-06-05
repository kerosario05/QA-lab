import { describe, expect, it } from 'vitest';
import { resolveFunctionalAppSlug } from './scenario-app-slug';

describe('resolveFunctionalAppSlug', () => {
  it('resolves a functional slug from TestRail section name', () => {
    expect(resolveFunctionalAppSlug({ section: { name: 'Detalle_KIOSKO' } })).toEqual({
      appSlug: 'kiosko',
      source: 'testrail_section_mapping',
    });
  });

  it('prefers explicit target app slug over Jira project key-shaped values', () => {
    expect(resolveFunctionalAppSlug({ targetAppSlug: 'kiosko', appSlug: 'AA' })).toEqual({
      appSlug: 'kiosko',
      source: 'target_app_slug',
    });
  });

  it('returns null when no functional slug can be inferred', () => {
    expect(resolveFunctionalAppSlug({})).toBeNull();
  });
});
