import { describe, expect, it } from 'vitest';
import { enrichCasesWithInputRequirements } from './input-requirements-loader';
import { composeSelectedInputRequirements } from './input-requirements';

describe('input requirements pre-launch boundary', () => {
  it('distinguishes loaded empty requirements from an unresolved case', () => {
    const loaded = enrichCasesWithInputRequirements(
      [{ id: 101, title: 'Empty requirements' }],
      { 101: { status: 'loaded', inputRequirements: [] } },
    )[0];

    expect(loaded.requirementsLoadStatus).toBe('loaded');
    expect(loaded.inputRequirements).toEqual([]);
    expect(loaded.requirementsLoadError).toBeUndefined();
  });

  it('keeps loading and failed cases explicitly unresolved', () => {
    const enriched = enrichCasesWithInputRequirements(
      [{ id: 202, title: 'Loading' }, { id: 303, title: 'Failed' }],
      {
        202: { status: 'loading' },
        303: { status: 'error', error: 'network failure' },
      },
    );

    expect(enriched[0]).toMatchObject({ id: 202, requirementsLoadStatus: 'loading' });
    expect(enriched[0].inputRequirements).toBeUndefined();
    expect(enriched[1]).toMatchObject({
      id: 303,
      requirementsLoadStatus: 'error',
      requirementsLoadError: 'network failure',
    });
    expect(enriched[1].inputRequirements).toBeUndefined();
  });

  it('passes loaded API requirements into the panel composition', () => {
    const enriched = enrichCasesWithInputRequirements(
      [{ id: 404, title: 'Case 404' }],
      { 404: { status: 'loaded', inputRequirements: [{ key: 'customer.id', required: true }] } },
    );

    expect(composeSelectedInputRequirements(enriched, [404])).toMatchObject({
      shared: [],
      byCase: { '404': [{ key: 'customer.id', required: true }] },
    });
  });
});
