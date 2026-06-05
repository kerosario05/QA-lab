import { describe, expect, it } from 'vitest';

import { normalizeScenarioStepList } from './scenario-step-list';

describe('scenario step list normalization', () => {
  it('returns an empty array when steps are undefined, null or empty', () => {
    expect(normalizeScenarioStepList(undefined)).toEqual([]);
    expect(normalizeScenarioStepList(null)).toEqual([]);
    expect(normalizeScenarioStepList([])).toEqual([]);
  });

  it('preserves valid steps', () => {
    const steps = [{ content: 'Paso 1', expected: 'OK' }, { content: 'Paso 2', expected: 'OK' }];
    expect(normalizeScenarioStepList(steps as any)).toHaveLength(2);
  });
});
