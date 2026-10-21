import { describe, expect, it } from 'vitest';
import { copyActiveScenariosToRerun, rememberActiveScenarios, rememberActiveScenariosWithCases, resolveActiveScenario } from './runs-provider';

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

  it('resolves TestRail-only cases from numeric and C-prefixed job identities with their authored steps', () => {
    rememberActiveScenariosWithCases('job-testrail-only', [], [{
      id: '54373',
      title: 'Transferencia exitosa entre cuentas propias',
      preconditions: ['Usuario activo'],
      steps: ['Abrir la aplicación', 'Ingresar a Transferencias'],
      expectedResult: 'Se muestra el resultado de la operación',
    }]);

    expect(resolveActiveScenario('job-testrail-only', { currentCaseId: '54373' })).toMatchObject({
      id: '54373',
      title: 'Transferencia exitosa entre cuentas propias',
      steps: ['Abrir la aplicación', 'Ingresar a Transferencias'],
      index: 1,
      total: 1,
    });
    expect(resolveActiveScenario('job-testrail-only', { currentCaseId: 'C54373' })?.title)
      .toBe('Transferencia exitosa entre cuentas propias');
  });

  it('preserves the selected scenario title and ordered steps under the new job id returned by rerun', () => {
    rememberActiveScenariosWithCases('job-before-rerun', [], [{
      id: '53821',
      title: 'Caso promovido',
      preconditions: ['Cliente autenticado'],
      steps: ['Abrir transferencias', 'Seleccionar cuentas', 'Confirmar'],
      expectedResult: 'Se muestra el comprobante',
    }]);

    expect(copyActiveScenariosToRerun('job-before-rerun', 'job-after-rerun')).toBe(true);
    expect(resolveActiveScenario('job-after-rerun', { currentCaseId: 'C53821' })).toMatchObject({
      id: '53821',
      title: 'Caso promovido',
      steps: ['Abrir transferencias', 'Seleccionar cuentas', 'Confirmar'],
      preconditions: ['Cliente autenticado'],
      index: 1,
      total: 1,
    });
  });

  it('does not fabricate a queue when the original job has no presentation metadata', () => {
    expect(copyActiveScenariosToRerun('job-without-scenarios', 'new-job')).toBe(false);
    expect(resolveActiveScenario('new-job', { currentCaseId: '1' })).toBeNull();
  });
});
