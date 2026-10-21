export type Step3LaunchGateInput = {
  storiesLoading: boolean;
  storiesError: string | null;
  totalScenarios: number;
  trCasesLoading: boolean;
  trCasesError: string | null;
  trCasesCount: number;
  selectedScenarioKeys: string[];
  selectedTestRailCaseIds?: number[];
  source: string;
  requiredInputsReady?: boolean;
};

export function canContinueFromStep3(input: Step3LaunchGateInput): boolean {
  const usesJira = input.source === 'jira' || input.source === 'both';
  const usesTestRail = input.source === 'testrail' || input.source === 'both';

  if (usesJira && input.storiesLoading) return false;
  if (usesTestRail && input.trCasesLoading) return false;

  const hasJiraData = usesJira && !input.storiesError && input.totalScenarios > 0;
  const hasTestRailData = usesTestRail && !input.trCasesError && input.trCasesCount > 0;

  if (!hasJiraData && !hasTestRailData) return false;

  let hasSelection = false;
  if (hasJiraData && hasTestRailData) {
    hasSelection = (input.selectedScenarioKeys?.length ?? 0) > 0 || (input.selectedTestRailCaseIds?.length ?? 0) > 0;
  } else if (hasJiraData) {
    hasSelection = (input.selectedScenarioKeys?.length ?? 0) > 0;
  } else if (hasTestRailData) {
    hasSelection = (input.selectedTestRailCaseIds?.length ?? 0) > 0;
  }

  return hasSelection && input.requiredInputsReady !== false;
}

export function getStep3SelectionMessage(input: Step3LaunchGateInput): string | null {
  const usesJira = input.source === 'jira' || input.source === 'both';
  const usesTestRail = input.source === 'testrail' || input.source === 'both';

  if (usesJira && input.storiesLoading) return null;
  if (usesJira && input.storiesError) return null;
  if (usesJira && input.totalScenarios <= 0) return null;
  if (usesTestRail && input.trCasesLoading) return null;
  if (usesTestRail && input.trCasesError) return null;
  if (usesTestRail && input.trCasesCount <= 0) return null;

  if ((input.selectedScenarioKeys?.length ?? 0) === 0 && (input.selectedTestRailCaseIds?.length ?? 0) === 0) {
    return 'Selecciona al menos un caso para continuar.';
  }
  return null;
}
