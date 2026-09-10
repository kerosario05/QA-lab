import { describe, expect, it } from 'vitest';
import { getAutoExpandedCaseId } from './index';

describe('TestRail selection expansion', () => {
  const cases = [
    { id: 1, custom_steps: 'step', inputRequirements: [{ key: 'runtime.one' }] },
    { id: 2, custom_expected: 'expected', inputRequirements: [{ key: 'runtime.two' }] },
    { id: 3, inputRequirements: [] },
  ];

  it('expands a newly selected case with detail', () => {
    expect(getAutoExpandedCaseId({ currentCaseIds: [], nextCaseIds: [1], cases, requirementStates: {} })).toBe(1);
  });

  it('expands the latest newly selected case without clearing earlier selections', () => {
    expect(getAutoExpandedCaseId({ currentCaseIds: [1], nextCaseIds: [1, 2], cases, requirementStates: {} })).toBe(2);
  });

  it('does not expand a case without detail or reopen on rerender', () => {
    expect(getAutoExpandedCaseId({ currentCaseIds: [], nextCaseIds: [3], cases, requirementStates: {} })).toBeUndefined();
    expect(getAutoExpandedCaseId({ currentCaseIds: [1], nextCaseIds: [1], cases, requirementStates: {} })).toBeUndefined();
  });
});
