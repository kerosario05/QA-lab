import { describe, expect, it } from 'vitest';
import {
  countSelection,
  duplicateScenario,
  initialProjectFilter,
  mergeServerScenarios,
  moveItem,
  newScenario,
  scenarioProblems,
  setSelection,
  setStoryDataValue,
  storyDataFields,
  syncDataFields,
  unusedDataKeys,
  missingDataCount,
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

  it('typing {{key}} in a step creates its data field, sensitive when the name says so', () => {
    const s = syncDataFields({
      ...complete(),
      steps: [{ action: 'Ingresar {{usuario}} y {{contrasena}}', expected: 'Entra' }],
      data: [{ key: 'usuario', label: 'Usuario', description: '', value: 'ana', sensitive: false }],
    });
    expect(s.data.map((f) => [f.key, f.label, f.sensitive])).toEqual([
      ['usuario', 'Usuario', false],
      ['contrasena', 'Contrasena', true],
    ]);
    expect(missingDataCount(s)).toBe(1);
    expect(unusedDataKeys({ ...s, steps: [{ action: 'Ingresar {{usuario}}', expected: '' }] })).toEqual(new Set(['contrasena']));
  });

  it('story data groups each key across cases and fills them all at once', () => {
    const withData = (value: string, extra = false) => ({
      ...complete(),
      data: [
        { key: 'usuario', label: 'Usuario', description: 'Cliente activo', value, sensitive: false },
        ...(extra ? [{ key: 'otp', label: 'OTP', description: '', value: '', sensitive: true }] : []),
      ],
    });
    const scenarios = [withData('ana'), withData('', true), complete()];
    const fields = storyDataFields(scenarios);
    expect(fields).toEqual([
      { key: 'usuario', label: 'Usuario', description: 'Cliente activo', sensitive: false, value: null, scenarioCount: 2, missing: 1 },
      { key: 'otp', label: 'OTP', description: '', sensitive: true, value: '', scenarioCount: 1, missing: 1 },
    ]);
    const filled = setStoryDataValue(scenarios, 'usuario', 'beto');
    expect(filled.map((s) => s.data.find((f) => f.key === 'usuario')?.value)).toEqual(['beto', 'beto', undefined]);
    expect(storyDataFields(filled)[0].value).toBe('beto');
  });

  it('a duplicate copies data values without sharing the objects', () => {
    const source = { ...complete(), data: [{ key: 'usuario', label: 'Usuario', description: '', value: 'ana', sensitive: false }] };
    const copy = duplicateScenario(source);
    copy.data[0].value = 'otro';
    expect(source.data[0].value).toBe('ana');
  });

  it('the project filter starts on the only project, or the remembered one if still granted', () => {
    expect(initialProjectFilter([{ slug: 'kiosko' }], '')).toBe('kiosko');
    expect(initialProjectFilter([{ slug: 'kiosko' }], 'fenix')).toBe('kiosko');
    expect(initialProjectFilter([{ slug: 'kiosko' }, { slug: 'fenix' }], 'fenix')).toBe('fenix');
    expect(initialProjectFilter([{ slug: 'kiosko' }, { slug: 'fenix' }], 'portal')).toBe('');
    expect(initialProjectFilter([{ slug: 'kiosko' }, { slug: 'fenix' }], '')).toBe('');
    expect(initialProjectFilter([], 'kiosko')).toBe('');
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
