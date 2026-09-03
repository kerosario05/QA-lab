import { describe, expect, it } from 'vitest';
import { rememberActiveScenarios, resolveActiveScenario } from './runs-provider';

function stories() {
  return [{
    jiraKey: 'JOB-1',
    title: 'Run',
    generatedByAi: false,
    scenarioCount: 2,
    scenarios: [
      {
        scenarioId: 'A',
        refs: 'A',
        title: 'Scenario A',
        custom_preconds: 'hidden precondition',
        custom_expected: 'hidden expected result',
        custom_steps_separated: [{ content: 'First A', expected: '' }, { content: 'Second A', expected: '' }],
      },
      {
        scenarioId: 'B',
        refs: 'B',
        title: 'Scenario B',
        custom_preconds: null,
        custom_expected: 'expected B',
        custom_steps_separated: [{ content: 'First B', expected: '' }],
      },
    ],
  }];
}

describe('active scenario resolution', () => {
  it('resolves every case_started by caseId and preserves structured order metadata', () => {
    rememberActiveScenarios('job-active-a', stories() as any);
    const active = resolveActiveScenario('job-active-a', { type: 'case_started', caseId: 'A', index: 1, total: 2 });
    expect(active).toMatchObject({ id: 'A', title: 'Scenario A', steps: ['First A', 'Second A'], index: 1, total: 2 });
  });

  it('replaces A with B for both SSE-style and polling-style identifiers', () => {
    rememberActiveScenarios('job-active-b', stories() as any);
    expect(resolveActiveScenario('job-active-b', { caseId: 'A' })?.id).toBe('A');
    expect(resolveActiveScenario('job-active-b', { currentCaseId: 'B' })?.id).toBe('B');
    expect(resolveActiveScenario('job-active-b', { currentCaseId: 'B', stepResults: [{ status: 'passed' }] })?.stepResults).toEqual([{ status: 'passed' }]);
  });
});
