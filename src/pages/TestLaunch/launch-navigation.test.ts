import { describe, expect, test } from 'vitest';
import { computeLaunchCaseNavigationState } from './launch-navigation';

describe('computeLaunchCaseNavigationState', () => {
  test('sin selección permanece deshabilitado', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'both',
      storiesLoading: false,
      selectedMcpScenarioIds: [],
      selectedTestRailCaseIds: [],
    });

    expect(state.canContinue).toBe(false);
    expect(state.shouldShowSelectionHint).toBe(true);
    expect(state.selectionHint).toBe('Selecciona al menos un caso para continuar.');
  });

  test('generando escenarios permanece deshabilitado', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'jira',
      storiesLoading: true,
      selectedMcpScenarioIds: ['a'],
      selectedTestRailCaseIds: [],
    });

    expect(state.canContinue).toBe(false);
    expect(state.shouldShowSelectionHint).toBe(false);
  });

  test('con un escenario seleccionado habilita', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'jira',
      storiesLoading: false,
      selectedMcpScenarioIds: ['a'],
      selectedTestRailCaseIds: [],
    });

    expect(state.canContinue).toBe(true);
  });

  test('seleccionar todos habilita', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'testrail',
      storiesLoading: false,
      selectedMcpScenarioIds: [],
      selectedTestRailCaseIds: [1, 2, 3],
    });

    expect(state.canContinue).toBe(true);
  });

  test('desmarcar todos deshabilita', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'both',
      storiesLoading: false,
      selectedMcpScenarioIds: [],
      selectedTestRailCaseIds: [],
    });

    expect(state.canContinue).toBe(false);
  });

  test('volver desde lanzar conserva estado y canContinue correcto', () => {
    const state = computeLaunchCaseNavigationState({
      source: 'both',
      storiesLoading: false,
      selectedMcpScenarioIds: ['scenario-1'],
      selectedTestRailCaseIds: [],
    });

    expect(state.canContinue).toBe(true);
    expect(state.shouldShowSelectionHint).toBe(false);
  });
});
