import type { ScenariosPreviewParams } from '../../services/scenarios';

export type ScenarioPreviewRequestInput = {
  projectKey: string;
  status: string;
  maxResults: number;
  sourceMode?: string;
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  sprintId?: number | null;
  useActiveSprint?: boolean;
  testRailProjectId?: number | null;
  testRailSuiteId?: number | null;
  testRailSectionId?: number | null;
  testRailSectionName?: string | null;
  appSlug?: string;
  effectiveTargetAppSlug?: string;
};

export function buildScenarioPreviewRequest(input: ScenarioPreviewRequestInput): ScenariosPreviewParams {
  const payload: ScenariosPreviewParams = {
    projectKey: input.projectKey,
    status: input.status,
    maxResults: input.maxResults,
    sourceMode: input.sourceMode,
    jiraIssueKey: input.jiraIssueKey,
    jiraSummary: input.jiraSummary,
    jiraDescription: input.jiraDescription,
    testrailProjectId: input.testRailProjectId ?? undefined,
    testrailSuiteId: input.testRailSuiteId ?? undefined,
    testrailSectionId: input.testRailSectionId ?? undefined,
    testrailSectionName: input.testRailSectionName ?? undefined,
    appSlug: input.appSlug,
    effectiveTargetAppSlug: input.effectiveTargetAppSlug,
  };

  if (typeof input.sprintId === 'number' && Number.isFinite(input.sprintId)) {
    payload.sprintId = input.sprintId;
  } else if (input.useActiveSprint) {
    payload.activeSprint = true;
  }

  return payload;
}
