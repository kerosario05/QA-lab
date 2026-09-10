import { describe, expect, it } from 'vitest';
import { hydrateScenarioSyntheticInputs, isSafeAutofillCandidate, isScenarioEnrichmentCandidate } from './scenario-input-autofill';

describe('scenario input autofill', () => {
  it('selects structurally safe candidates independently of scenarioDataPolicy', () => {
    const base = { key: 'fixture', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'manual_required', fieldCapability: { kind: 'text' } } as any;
    expect(isScenarioEnrichmentCandidate(base)).toBe(true);
    expect(isScenarioEnrichmentCandidate({ ...base, scenarioDataPolicy: 'synthetic_allowed' })).toBe(true);
    expect(isScenarioEnrichmentCandidate({ ...base, sensitive: true })).toBe(false);
    expect(isScenarioEnrichmentCandidate({ ...base, fieldCapability: { kind: 'password' } })).toBe(false);
    expect(isScenarioEnrichmentCandidate({ ...base, scenarioDataPolicy: 'trusted_required' })).toBe(false);
    expect(isScenarioEnrichmentCandidate({ ...base, inputRole: 'supporting' })).toBe(false);
  });

  it('sends complete safe contracts even when optional classification is absent', () => {
    expect(isSafeAutofillCandidate({ key: 'legacy.field', fieldCapability: { kind: 'text' } })).toBe(true);
    expect(isSafeAutofillCandidate({ key: 'supporting.field', inputRole: 'supporting', fieldCapability: { kind: 'text' } })).toBe(true);
    expect(isSafeAutofillCandidate({ key: 'trusted.field', valuePolicy: 'trusted_required', fieldCapability: { kind: 'text' } })).toBe(false);
    expect(isSafeAutofillCandidate({ key: 'secret.field', controlType: 'password' })).toBe(false);
    expect(isSafeAutofillCandidate({ key: 'optional.field', required: false, fieldCapability: { kind: 'text' } })).toBe(false);
  });

  it('hydrates only authorized empty inputs and preserves existing values', async () => {
    const result = await hydrateScenarioSyntheticInputs({
      projectId: '00000000-0000-0000-0000-000000000001',
      caseId: 1,
      seed: 'fixture-seed',
      scenarioContext: { title: 'fixture case', preconditions: 'fixture preconditions', steps: 'fixture steps', expected: 'fixture expected' },
      requirements: [
        { key: 'email', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'email' } },
        { key: 'number', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'number' } },
        { key: 'manual', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'manual_required', fieldCapability: { kind: 'text' } },
      ],
      values: { number: 'existing-number' },
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.projectId).toBe('00000000-0000-0000-0000-000000000001');
        expect(body.caseId).toBe(1);
        expect(body.scenarioContext).toEqual({ title: 'fixture case', preconditions: 'fixture preconditions', steps: 'fixture steps', expected: 'fixture expected' });
        expect(body.requirements.map((requirement: { key: string }) => requirement.key)).toEqual(['email', 'manual']);
        return new Response(JSON.stringify({ generated: [{ key: 'email', status: 'generated', value: 'generated@example.test' }], unresolved: [] }), { status: 200 });
      },
    });

    expect(result).toEqual({ number: 'existing-number', email: 'generated@example.test' });
  });

  it('does not alter values when the backend returns unresolved', async () => {
    const result = await hydrateScenarioSyntheticInputs({
      projectId: '00000000-0000-0000-0000-000000000001',
      caseId: 1,
      seed: 'fixture-seed',
      requirements: [{ key: 'email', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'email' } }],
      values: {},
      fetcher: async () => new Response(JSON.stringify({ generated: [], unresolved: [{ key: 'email', status: 'unresolved' }] }), { status: 200 }),
    });
    expect(result).toEqual({});
  });

  it('keeps the legacy payload safe when projectId is unavailable', async () => {
    await hydrateScenarioSyntheticInputs({
      caseId: 1,
      seed: 'fixture-seed',
      requirements: [{ key: 'text', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'text' } }],
      values: {},
      fetcher: async (_url, init) => {
        expect(JSON.parse(String(init?.body)).projectId).toBeUndefined();
        return new Response(JSON.stringify({ generated: [], unresolved: [] }), { status: 200 });
      },
    });
  });

  it('maps the resolved backend contract and exposes provenance without overwriting a value', async () => {
    const resolved: Array<{ key?: unknown; source?: unknown; generated?: unknown; verified?: unknown }> = [];
    const result = await hydrateScenarioSyntheticInputs({
      caseId: 2,
      seed: 'fixture-seed',
      requirements: [{ key: 'employee.document', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'text' } }],
      values: {},
      onResolved: (fields) => resolved.push(...fields),
      fetcher: async () => new Response(JSON.stringify({
        resolved: [{ key: 'employee.document', status: 'resolved', value: 'confirmed-value', source: 'confirmed_replay', generated: false, verified: true, sensitive: false, editable: true }],
        generated: [],
        unresolved: [],
      }), { status: 200 }),
    });
    expect(result).toEqual({ 'employee.document': 'confirmed-value' });
    expect(resolved).toEqual([{ key: 'employee.document', status: 'resolved', value: 'confirmed-value', source: 'confirmed_replay', generated: false, verified: true, sensitive: false, editable: true }]);
  });
});
