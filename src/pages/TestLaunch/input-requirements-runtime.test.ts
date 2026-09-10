import { describe, expect, it } from 'vitest';
import { hydrateNewlySelectedCaseInputs, propagateRuntimeInputChange, updateRuntimeInput } from './input-requirements-values';

describe('runtime input values by case', () => {
  it('updates only the selected case', () => {
    const result = updateRuntimeInput({ '44721': { email: 'old' }, '44722': { email: 'other' } }, 44721, 'email', 'new');

    expect(result).toEqual({ '44721': { email: 'new' }, '44722': { email: 'other' } });
  });

  it('keeps the same key isolated when cases share it', () => {
    const result = updateRuntimeInput({ '44721': { username: 'A' }, '44722': { username: 'B' } }, 44722, 'username', 'C');

    expect(result['44721']).toEqual({ username: 'A' });
    expect(result['44722']).toEqual({ username: 'C' });
  });

  it('merges fields for one case without losing existing values', () => {
    const result = updateRuntimeInput({ '44721': { first: 'one' } }, 44721, 'second', 'two');

    expect(result).toEqual({ '44721': { first: 'one', second: 'two' } });
  });

  it('copies a non-empty value only to selected cases with the exact key still empty', () => {
    const result = propagateRuntimeInputChange(
      { '44721': { 'auth.user': '' }, '44722': { 'auth.user': 'already-set', 'account.user': '' }, '44723': {} },
      44721,
      'auth.user',
      'userA',
      [
        { id: 44721, inputRequirements: [{ key: 'auth.user' }] },
        { id: 44722, inputRequirements: [{ key: 'auth.user' }, { key: 'account.user' }] },
        { id: 44723, inputRequirements: [{ key: 'auth.user' }] },
      ],
      [44721, 44722, 44723],
    );

    expect(result).toEqual({
      '44721': { 'auth.user': 'userA' },
      '44722': { 'auth.user': 'already-set', 'account.user': '' },
      '44723': { 'auth.user': 'userA' },
    });
  });

  it('allows a later edit to replace the copied value in its own case', () => {
    const result = propagateRuntimeInputChange(
      { '44721': { 'auth.user': 'userA' }, '44722': { 'auth.user': 'userA' } },
      44722,
      'auth.user',
      'userB',
      [
        { id: 44721, inputRequirements: [{ key: 'auth.user' }] },
        { id: 44722, inputRequirements: [{ key: 'auth.user' }] },
      ],
      [44721, 44722],
    );

    expect(result['44721']['auth.user']).toBe('userA');
    expect(result['44722']['auth.user']).toBe('userB');
  });

  it('hydrates a newly selected case from one distinct existing value per exact key', () => {
    const result = hydrateNewlySelectedCaseInputs({
      caseId: 44722,
      selectedTestRailCaseIds: [44721, 44722],
      inputRequirementsByCaseId: {
        44721: { status: 'loaded', inputRequirements: [{ key: 'auth.user' }, { key: 'same-label.other' }] },
        44722: { status: 'loaded', inputRequirements: [{ key: 'auth.user' }, { key: 'same-label.different' }] },
      },
      runtimeInputValuesByCaseId: { '44721': { 'auth.user': 'userA', 'same-label.other': 'A' }, '44722': {} },
    });

    expect(result['44722']).toEqual({ 'auth.user': 'userA' });
  });

  it('does not hydrate conflicting or already populated destination values', () => {
    const base = {
      1: { status: 'loaded', inputRequirements: [{ key: 'auth.user' }] },
      2: { status: 'loaded', inputRequirements: [{ key: 'auth.user' }] },
      3: { status: 'loaded', inputRequirements: [{ key: 'auth.user' }] },
    };
    expect(hydrateNewlySelectedCaseInputs({
      caseId: 3,
      selectedTestRailCaseIds: [1, 2, 3],
      inputRequirementsByCaseId: base,
      runtimeInputValuesByCaseId: { '1': { 'auth.user': 'A' }, '2': { 'auth.user': 'B' }, '3': {} },
    })['3']).toEqual({});
    expect(hydrateNewlySelectedCaseInputs({
      caseId: 2,
      selectedTestRailCaseIds: [1, 2],
      inputRequirementsByCaseId: base,
      runtimeInputValuesByCaseId: { '1': { 'auth.user': 'A' }, '2': { 'auth.user': 'existing' } },
    })['2']).toEqual({ 'auth.user': 'existing' });
  });
});
