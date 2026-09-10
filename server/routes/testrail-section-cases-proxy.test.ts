import { describe, expect, it, vi } from 'vitest';
import { fetchAutomationEngineSectionCases } from './testrail';

describe('TestRail section cases Automation Engine proxy', () => {
  it('delegates section cases and preserves the complete enriched response', async () => {
    const enrichedCase = {
      id: 44757,
      title: 'Case',
      custom_preconds: 'Cuenta activa',
      normalizedScenario: { caseId: 44757, source: 'testrail' },
      inputRequirements: [{ key: 'account.id', required: true }],
      unresolvedPlaceholders: ['account.token'],
      conflicts: [{ key: 'account.id' }],
      runtimeTransformStatus: 'success',
      runtimeTransformErrorCode: undefined,
      additionalRuntimeMetadata: { origin: 'runtime' },
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sectionId: 9,
      projectId: 56,
      suiteId: 1731,
      count: 1,
      cases: [enrichedCase],
    }), { status: 200 }));

    const result = await fetchAutomationEngineSectionCases({
      baseUrl: 'http://automation-engine.test',
      sectionId: 9,
      projectId: 56,
      suiteId: 1731,
      localProjectId: 'local-project-1',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://automation-engine.test/api/testrail/sections/9/cases?projectId=56&suiteId=1731&localProjectId=local-project-1',
    );
    expect(result.cases[0]).toEqual(enrichedCase);
    expect(result.cases[0].runtimeTransformStatus).toBe('success');
    expect(result.cases[0].inputRequirements).toEqual([{ key: 'account.id', required: true }]);
    expect(result.cases[0].normalizedScenario).toEqual({ caseId: 44757, source: 'testrail' });
    expect(result.cases[0].unresolvedPlaceholders).toEqual(['account.token']);
    expect(result.cases[0].conflicts).toEqual([{ key: 'account.id' }]);
    expect(result.cases[0].additionalRuntimeMetadata).toEqual({ origin: 'runtime' });
  });
});
