import { describe, expect, it } from 'vitest';
import {
  countSelection,
  currentGeneratedScenarios,
  duplicateScenario,
  generatedContractErrors,
  generatedContractIssues,
  hasValidGeneratedContract,
  mergeScenarioSubset,
  mergeServerScenarios,
  moveItem,
  newScenario,
  scenarioProblems,
  scenarioReviewWarnings,
  setSelection,
  replaceScenarioSubset,
  uncoveredAcceptanceCriteria,
} from './scenario-utils';

const complete = () => ({
  ...newScenario(),
  title: 'Pagar con tarjeta',
  steps: [{ action: 'Pagar', expected: 'Pago aprobado' }],
});

describe('scenario-utils', () => {
  it('keeps story-wide coverage gaps out of each scenario review card', () => {
    const scenario = { ...complete(), generationWarnings: [
      'Cobertura de la HU pendiente: 2 criterios sin cubrir (AC1.1, AC2.1).',
      'Revisar este caso antes de publicarlo: JIRA_UI_OBSERVATION_REQUIRED',
    ] };
    expect(scenarioReviewWarnings(scenario)).toEqual([
      'Revisar este caso antes de publicarlo: JIRA_UI_OBSERVATION_REQUIRED',
    ]);
  });

  it('filters legacy story coverage errors out of individual generated-case diagnostics', () => {
    const scenario = {
      ...complete(),
      jiraSourceScenarioId: 'AA-113:jira:1',
      jiraSourceScenario: {
        validation: {
          valid: false,
          errors: ['JIRA_ACCEPTANCE_COVERAGE_INCOMPLETE:AC1.1,AC2.1'],
          issues: [{ code: 'JIRA_ACCEPTANCE_COVERAGE_INCOMPLETE', stepIndex: 0 }],
        },
      },
    } as any;
    expect(generatedContractIssues(scenario)).toEqual([]);
  });

  it('a new scenario is manual, selected for both destinations and incomplete', () => {
    const s = newScenario();
    expect(s.origin).toBe('manual');
    expect(s.selectedForTestRail && s.selectedForJira).toBe(true);
    expect(scenarioProblems(s)).toEqual(['Falta el título', 'Agrega al menos un paso', 'Falta el resultado esperado']);
  });

  it('a duplicate never keeps the TestRail case of the original', () => {
    const copy = duplicateScenario({ ...complete(), testRailCaseId: 42, origin: 'ai', edited: true });
    expect(copy.testRailCaseId).toBeNull();
    expect(copy.origin).toBe('manual');
    expect(copy.title).toBe('Pagar con tarjeta (copia)');
  });

  it('reports steps without action and a missing expected result', () => {
    const s = { ...complete(), steps: [{ action: '', expected: 'algo' }, { action: 'Pagar', expected: '' }] };
    expect(scenarioProblems(s)).toEqual(['El paso 1 no tiene acción']);
    const noExpected = { ...complete(), steps: [{ action: 'Pagar', expected: '' }] };
    expect(scenarioProblems(noExpected)).toEqual(['Falta el resultado esperado']);
    expect(scenarioProblems({ ...noExpected, expectedResult: 'Pago ok' })).toEqual([]);
  });

  it('counts each destination independently and only blocks selected incomplete scenarios', () => {
    const scenarios = [
      complete(),
      { ...complete(), selectedForJira: false },
      { ...newScenario(), selectedForTestRail: false, selectedForJira: false },
      { ...newScenario(), selectedForJira: false },
    ];
    expect(countSelection(scenarios)).toEqual({ total: 4, testrail: 3, jira: 1, blocked: 1 });
  });

  it('counts only new or edited TestRail cases as publishable selections', () => {
    const scenarios = [
      { ...complete(), testRailCaseId: 51, testRailDirty: false },
      { ...complete(), testRailCaseId: 52, testRailDirty: true },
      complete(),
    ];
    expect(countSelection(scenarios).testrail).toBe(2);
  });

  it('keeps the workspace and publish selection limited to scenarios generated for the current Jira story', () => {
    const generated = {
      ...complete(), id: 'jira-current', selectedForTestRail: false, jiraSourceScenarioId: 'AA-113:jira:1',
      jiraSourceScenario: { validation: { valid: true, errors: [] } },
    };
    const historical = { ...complete(), id: 'old', selectedForTestRail: true, origin: 'ai' as const, edited: true };
    const visible = currentGeneratedScenarios([historical, generated]);
    expect(visible.map((scenario) => scenario.id)).toEqual(['jira-current']);
    expect(countSelection(visible).total).toBe(1);
    expect(countSelection(visible).testrail).toBe(0);
    expect(hasValidGeneratedContract(generated)).toBe(true);
    expect(hasValidGeneratedContract(historical)).toBe(false);
  });

  it('counts unique uncovered acceptance criteria only from generated scenarios', () => {
    const generated = {
      ...complete(), jiraSourceScenarioId: 'AA-113:jira:1',
      generationWarnings: ['Cobertura pendiente: AC1.1, AC2.1, AC1.1'],
      jiraSourceScenario: { validation: { valid: false, errors: ['JIRA_ASSERTION_CAPABILITY_UNSUPPORTED'] } },
    };
    const historical = { ...complete(), origin: 'ai' as const, edited: true, generationWarnings: ['AC99.1'] };
    expect(uncoveredAcceptanceCriteria([generated, historical], 'Faltan AC3.2, AC2.1')).toEqual(['AC1.1', 'AC2.1', 'AC3.2']);
    expect(generatedContractErrors(generated)).toEqual(['JIRA_ASSERTION_CAPABILITY_UNSUPPORTED']);
  });

  it('turns contract diagnostics into actionable step guidance without exposing the recorded step text', () => {
    const generated = {
      ...complete(), jiraSourceScenarioId: 'AA-113:jira:1',
      jiraSourceScenario: { validation: {
        valid: false,
        errors: ['JIRA_ASSERTION_CAPABILITY_UNSUPPORTED'],
        issues: [{ code: 'JIRA_ASSERTION_CAPABILITY_UNSUPPORTED', stepIndex: 7, step: 'Ingresar secreto privado' }],
      } },
    };
    expect(generatedContractIssues(generated)).toEqual([{
      code: 'JIRA_ASSERTION_CAPABILITY_UNSUPPORTED',
      stepIndex: 7,
      guidance: 'Cambia la comprobación por un resultado visible que el motor pueda verificar.',
    }]);
  });

  it('merges content edits without altering historical rows and reorders only the generated subset', () => {
    const first = { ...complete(), id: 'first', jiraSourceScenarioId: 'AA-1:jira:1' };
    const historical = { ...complete(), id: 'old' };
    const second = { ...complete(), id: 'second', jiraSourceScenarioId: 'AA-1:jira:2' };
    const changedFirst = { ...first, title: 'Editado' };
    expect(mergeScenarioSubset([first, historical, second], [changedFirst])).toEqual([changedFirst, historical, second]);
    expect(replaceScenarioSubset([first, historical, second], [second, first])).toEqual([second, historical, first]);
  });

  it('bulk selection changes one destination only', () => {
    const next = setSelection([complete(), complete()], 'jira', false);
    expect(next.every((s) => !s.selectedForJira && s.selectedForTestRail)).toBe(true);
  });

  it('moves items within bounds', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('a poll keeps unsaved local edits and takes the server list otherwise', () => {
    const local = { a: [complete()], b: [complete()] };
    const fromServer = [newScenario(), newScenario()];
    const merged = mergeServerScenarios(
      local,
      [
        { id: 'a', scenarios: [fromServer[0]] },
        { id: 'b', scenarios: [fromServer[1]] },
      ],
      new Set(['a']),
    );
    expect(merged.a).toBe(local.a);
    expect(merged.b).toEqual([fromServer[1]]);
  });
});

describe('test data placeholders', () => {
  it('keeps canonical keys separate from labels and prevents cross-field shared values', async () => {
    const { groupStoryData, applyStoryDatum } = await import('./scenario-utils');
    const cases = [complete(), complete()].map((scenario, index) => ({
      ...scenario, id: String(index), data: [{ key: 'jira_step_3', label: index ? 'Warehouse' : 'Usuario',
        value: '', sensitive: false, description: '' }],
    }));
    const groups = groupStoryData(cases);
    expect(groups.map(group => group.key)).toEqual(['Usuario', 'Warehouse']);
    const edited = applyStoryDatum(cases, groups[0].id, 'fixture-user');
    expect(edited[0].data?.[0].key).toBe('jira_step_3');
    expect(edited[0].data?.[0].value).toBe('fixture-user');
    expect(edited[1].data?.[0].value).toBe('');
  });
  it('disambiguates repeated visible labels while keeping role and condition data separate', async () => {
    const { groupStoryData } = await import('./scenario-utils');
    const scenarios = [
      { ...complete(), id: 'generic-user', data: [{ key: 'usuario', label: 'Usuario', value: '', sensitive: false, description: '', condition: 'valid' as const }] },
      { ...complete(), id: 'business-user', data: [{ key: 'usuario_negocios', label: 'Usuario', value: '', sensitive: false, description: '', condition: 'valid' as const }] },
      { ...complete(), id: 'invalid-user', data: [{ key: 'usuario_invalido', label: 'Usuario', value: '', sensitive: false, description: '', condition: 'invalid' as const }] },
    ];
    const groups = groupStoryData(scenarios);
    expect(groups).toHaveLength(3);
    expect(groups.map(group => group.displayLabel)).toEqual([
      'Usuario · usuario', 'Usuario · negocios', 'Usuario · inválido',
    ]);
    expect(new Set(groups.map(group => group.id)).size).toBe(3);
  });
  it('creates a data field for every new {{key}} and keeps existing values', async () => {
    const { syncData } = await import('./scenario-utils');
    const scenario = {
      id: '1', title: 't', preconditions: 'El usuario {{usuario}} existe', expectedResult: '',
      steps: [{ action: 'Ingresar {{RNC}} en "RNC"', expected: '' }],
      data: [{ key: 'Usuario', value: 'juan', sensitive: false, description: '' }],
    } as never;
    const keys = syncData(scenario).data?.map((d) => [d.key, d.value]);
    expect(keys).toEqual([['Usuario', 'juan'], ['RNC', '']]);
  });
});
