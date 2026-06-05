import { describe, expect, it } from 'vitest';

import { normalizeStoryScenarios } from './story-scenarios';

describe('story scenarios normalization', () => {
  it('returns an empty array when scenarios are undefined, null or empty', () => {
    expect(normalizeStoryScenarios(undefined)).toEqual([]);
    expect(normalizeStoryScenarios(null)).toEqual([]);
    expect(normalizeStoryScenarios([])).toEqual([]);
  });

  it('preserves valid scenarios', () => {
    const scenarios = [{ title: 'Escenario 1' }, { title: 'Escenario 2' }] as any;
    expect(normalizeStoryScenarios(scenarios)).toHaveLength(2);
  });
});
