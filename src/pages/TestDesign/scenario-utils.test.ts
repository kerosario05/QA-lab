import { describe, expect, it } from 'vitest';
import {
  countSelection,
  duplicateScenario,
  mergeServerScenarios,
  moveItem,
  newScenario,
  scenarioProblems,
  setSelection,
} from './scenario-utils';

const complete = () => ({
  ...newScenario(),
  title: 'Pagar con tarjeta',
  steps: [{ action: 'Pagar', expected: 'Pago aprobado' }],
});

describe('scenario-utils', () => {
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
