import type { LaunchConfig } from './scenario-preview-types';

export type LaunchCaseSelectionState = {
  source: LaunchConfig['source'];
  storiesLoading: boolean;
  selectedMcpScenarioIds: string[];
  selectedTestRailCaseIds: number[];
};

export type LaunchCaseNavigationState = {
  canContinue: boolean;
  shouldShowSelectionHint: boolean;
  selectionHint: string | null;
};

export function computeLaunchCaseNavigationState(input: LaunchCaseSelectionState): LaunchCaseNavigationState {
  const scenariosEnabled = input.source === 'jira' || input.source === 'both';
  const testRailEnabled = input.source === 'testrail' || input.source === 'both';
  const hasScenarioSelection = scenariosEnabled && input.selectedMcpScenarioIds.length > 0;
  const hasTestRailSelection = testRailEnabled && input.selectedTestRailCaseIds.length > 0;
  const hasAnySelection = hasScenarioSelection || hasTestRailSelection;
  const isBusy = input.storiesLoading;

  if (isBusy) {
    return {
      canContinue: false,
      shouldShowSelectionHint: false,
      selectionHint: null,
    };
  }

  if (!hasAnySelection) {
    return {
      canContinue: false,
      shouldShowSelectionHint: true,
      selectionHint: 'Selecciona al menos un caso para continuar.',
    };
  }

  return {
    canContinue: true,
    shouldShowSelectionHint: false,
    selectionHint: null,
  };
}
