import type { Story } from '../../services/scenarios';

export type LaunchSourceLabel = 'Jira' | 'TestRail' | 'Jira + TestRail' | 'Ninguna';

export type SelectedGeneratedScenario = {
  scenarioId: string;
  title: string;
  steps: string[];
  expectedResult: string;
  preconditions: string[];
  sourceIssueKey?: string;
  authIntent?: "gate_observation" | "full_authentication";
};

export type LaunchSelectionSummary = {
  selectedStories: Story[];
  selectedGeneratedScenarios: SelectedGeneratedScenario[];
  existingTestRailCaseIds: number[];
  jiraSelectedCount: number;
  testRailSelectedCount: number;
  totalSelected: number;
  hasLaunchableSelection: boolean;
  sourceLabel: LaunchSourceLabel;
};

export type LaunchPublishedCase = {
  scenarioId: string;
  caseId: number;
  title?: string;
  sourceType?: 'jira_preview' | 'testrail_case';
  sourceIssueKey?: string;
  launchScenarioId?: string;
  executionScenarioId?: string;
};

function normalizeSelectedCaseKeys(selectedCaseKeys: string[]): Set<string> {
  return new Set(
    selectedCaseKeys
      .map((key) => key.trim())
      .filter((key) => key.length > 0),
  );
}

function normalizeSelectedTestRailCaseIds(caseIds: number[]): number[] {
  const normalized = caseIds
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(normalized));
}

function toSelectedGeneratedStories(stories: Story[], selectedCaseKeys: Set<string>): Story[] {
  const selectedStories: Story[] = [];
  for (const story of stories) {
    const scenarios = story.scenarios.filter((_, index) => selectedCaseKeys.has(`${story.jiraKey}::${index}`));
    if (scenarios.length === 0) continue;
    selectedStories.push({
      ...story,
      scenarios,
      scenarioCount: scenarios.length,
    });
  }
  return selectedStories;
}

function toSelectedGeneratedScenarios(selectedStories: Story[]): SelectedGeneratedScenario[] {
  let scenarioIndex = 0;
  const selectedScenarios: SelectedGeneratedScenario[] = [];
  for (const story of selectedStories) {
    for (const scenario of story.scenarios) {
      scenarioIndex++;
      selectedScenarios.push({
        scenarioId: `LAUNCH-${String(scenarioIndex).padStart(3, '0')}`,
        title: scenario.title || `${story.jiraKey} Scenario ${scenarioIndex}`,
        steps: Array.isArray(scenario.custom_steps_separated)
          ? scenario.custom_steps_separated.map((step) => `${step.content}`)
          : [],
        expectedResult: scenario.custom_expected || '',
        preconditions: scenario.custom_preconds ? [scenario.custom_preconds] : [],
        sourceIssueKey: story.jiraKey,
        authIntent: scenario.authIntent,
      });
    }
  }
  return selectedScenarios;
}

export function deriveSelectedSourceLabel(jiraSelectedCount: number, testRailSelectedCount: number): LaunchSourceLabel {
  if (jiraSelectedCount > 0 && testRailSelectedCount > 0) return 'Jira + TestRail';
  if (jiraSelectedCount > 0) return 'Jira';
  if (testRailSelectedCount > 0) return 'TestRail';
  return 'Ninguna';
}

export function computeLaunchSelectionSummary(input: {
  stories: Story[];
  selectedCaseKeys: string[];
  selectedTestRailCaseIds: number[];
}): LaunchSelectionSummary {
  const selectedCaseKeys = normalizeSelectedCaseKeys(input.selectedCaseKeys);
  const selectedStories = toSelectedGeneratedStories(input.stories, selectedCaseKeys);
  const selectedGeneratedScenarios = toSelectedGeneratedScenarios(selectedStories);
  const existingTestRailCaseIds = normalizeSelectedTestRailCaseIds(input.selectedTestRailCaseIds);

  const jiraSelectedCount = selectedGeneratedScenarios.length;
  const testRailSelectedCount = existingTestRailCaseIds.length;
  const totalSelected = jiraSelectedCount + testRailSelectedCount;

  return {
    selectedStories,
    selectedGeneratedScenarios,
    existingTestRailCaseIds,
    jiraSelectedCount,
    testRailSelectedCount,
    totalSelected,
    hasLaunchableSelection: totalSelected > 0,
    sourceLabel: deriveSelectedSourceLabel(jiraSelectedCount, testRailSelectedCount),
  };
}

export function normalizePublishedCasesForDiscovery(
  publishedCases?: LaunchPublishedCase[],
): LaunchPublishedCase[] | undefined {
  if (!Array.isArray(publishedCases)) return undefined;
  const normalized: LaunchPublishedCase[] = [];
  for (const entry of publishedCases) {
    if (!entry || typeof entry !== 'object') continue;
    const scenarioId = typeof entry.scenarioId === 'string' ? entry.scenarioId.trim() : '';
    const caseId = Number(entry.caseId);
    if (!scenarioId || !Number.isInteger(caseId) || caseId <= 0) continue;
    normalized.push({
      scenarioId,
      caseId,
      title: typeof entry.title === 'string' ? entry.title : undefined,
      sourceType: entry.sourceType,
      sourceIssueKey: typeof entry.sourceIssueKey === 'string' ? entry.sourceIssueKey : undefined,
      launchScenarioId: typeof entry.launchScenarioId === 'string' ? entry.launchScenarioId : undefined,
      executionScenarioId: typeof entry.executionScenarioId === 'string' ? entry.executionScenarioId : undefined,
    });
  }
  return normalized;
}
