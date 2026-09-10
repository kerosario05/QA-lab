import { describe, expect, it } from 'vitest';
import { evaluateInputRequirementsReadiness } from './input-requirements-gate';

describe('TestRail input requirements launch gate', () => {
  it('blocks cases whose requirements are still loading or failed', () => {
    const result = evaluateInputRequirementsReadiness(
      [101, 202],
      { 101: { status: 'loading' }, 202: { status: 'error', error: 'request failed' } },
      {},
    );

    expect(result).toEqual({ ready: false, unresolvedCaseIds: [101, 202], missingRequiredInputs: [] });
  });

  it('reports missing required case/key without exposing runtime values', () => {
    const result = evaluateInputRequirementsReadiness(
      [303],
      { 303: { status: 'loaded', inputRequirements: [
        { key: 'secret.input', required: true, sensitive: true },
        { key: 'optional.input', required: false },
      ] } },
      { '303': { 'secret.input': '   ' } },
    );

    expect(result).toEqual({
      ready: false,
      unresolvedCaseIds: [],
      missingRequiredInputs: [{ caseId: 303, key: 'secret.input' }],
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('allows loaded empty cases and loaded cases with all required values', () => {
    const result = evaluateInputRequirementsReadiness(
      [404, 505],
      {
        404: { status: 'loaded', inputRequirements: [] },
        505: { status: 'loaded', inputRequirements: [
          { key: 'zero.input', required: true },
          { key: 'false.input', required: true },
        ] },
      },
      { '505': { 'zero.input': '0', 'false.input': 'false' } },
    );

    expect(result).toEqual({ ready: true, unresolvedCaseIds: [], missingRequiredInputs: [] });
  });

  it('uses a common value for every selected case and lets an override win', () => {
    const result = evaluateInputRequirementsReadiness(
      [1, 2],
      {
        1: { status: 'loaded', inputRequirements: [{ key: 'auth.username', required: true }] },
        2: { status: 'loaded', inputRequirements: [{ key: 'auth.username', required: true }] },
      },
      {},
      { 'auth.username': 'common-user' },
      { '2': { 'auth.username': 'case-user' } },
    );

    expect(result.ready).toBe(true);
    expect(JSON.stringify(result)).not.toContain('common-user');
    expect(JSON.stringify(result)).not.toContain('case-user');
  });

  it('applies runtime value policies without bypassing required scenario data', () => {
    const result = evaluateInputRequirementsReadiness(
      [1],
      { 1: { status: 'loaded', inputRequirements: [
        { key: 'scenario', required: true, valuePolicy: 'scenario_controlled' },
        { key: 'trusted', required: true, valuePolicy: 'trusted_required' },
        { key: 'synthetic', required: true, inputRole: 'supporting', valuePolicy: 'safe_synthetic' },
        { key: 'unresolved', required: true, valuePolicy: 'unresolved' },
      ] } },
      {},
    );

    expect(result.ready).toBe(false);
    expect(result.missingRequiredInputs).toEqual([
      { caseId: 1, key: 'scenario' },
      { caseId: 1, key: 'trusted' },
      { caseId: 1, key: 'unresolved' },
    ]);
    expect(result.missingTrustedInputs).toEqual([{ caseId: 1, key: 'trusted' }]);
    expect(result.unresolvedInputs).toEqual([{ caseId: 1, key: 'unresolved' }]);
  });

  it('blocks a missing required expected-value input by its structured key', () => {
    const result = evaluateInputRequirementsReadiness(
      [44759],
      { 44759: { status: 'loaded', inputRequirements: [
        { key: 'dataset_1.expected_name', required: true, inputUsage: ['expected'] },
      ] } },
      {},
    );
    expect(result.ready).toBe(false);
    expect(result.missingRequiredInputs).toEqual([{ caseId: 44759, key: 'dataset_1.expected_name' }]);
  });

  it('keeps legacy missing behavior and accepts false, zero, and string zero', () => {
    const legacy = evaluateInputRequirementsReadiness(
      [2],
      { 2: { status: 'loaded', inputRequirements: [{ key: 'legacy', required: true }] } },
      {},
    );
    expect(legacy.ready).toBe(false);

    const values = evaluateInputRequirementsReadiness(
      [3],
      { 3: { status: 'loaded', inputRequirements: [
        { key: 'false', required: true }, { key: 'zero', required: true }, { key: 'string-zero', required: true },
      ] } },
      { 3: { false: false, zero: 0, 'string-zero': '0' } },
    );
    expect(values.ready).toBe(true);
  });
});
