export interface ScenarioStep {
  content: string;
  expected: string;
}

export interface StoryScenario {
  title: string;
  refs: string;
  custom_preconds: string | null;
  custom_expected?: string;
  custom_steps_separated: ScenarioStep[];
  authIntent?: "gate_observation" | "full_authentication";
}

export interface Story {
  jiraKey: string;
  title: string;
  storyType?: string;
  generatedByAi: boolean;
  scenarioCount: number;
  scenarios: StoryScenario[];
}

export interface ScenariosPreviewResponse {
  sprint?: { id: number; name: string };
  totalStories?: number;
  totalScenarios?: number;
  stories: Story[];
}

export interface ScenariosPreviewParams {
  projectKey: string;
  status: string;
  maxResults: number;
  sourceMode?: 'jira' | 'testrail' | 'both' | string;
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  sprintId?: number;
  activeSprint?: boolean;
  testrailProjectId?: number;
  testrailSuiteId?: number;
  testrailSectionId?: number;
  testrailSectionName?: string;
  appSlug?: string;
  effectiveTargetAppSlug?: string;
  selectedIssueKeys?: string[]; // NEW: Issue keys selected by user for preview
}

export interface ScenariosApiError extends Error {
  status?: number;
  errorCode?: string;
  details?: string;
  endpoint?: string;
  method?: string;
  rawBody?: string;
}

export type DiagnosticCode =
  | "needs_route_profile"
  | "missing_parent_route"
  | "missing_intermediate_step"
  | "missing_detail_selection_step"
  | "unsupported_route_target"
  | "ambiguous_route_target";

export interface ScenarioDiagnostic {
  level: "error" | "warning" | "info";
  code: DiagnosticCode;
  message: string;
  context?: Record<string, unknown>;
}

export interface BlockedScenario {
  sourceIssueKey: string;
  title: string;
  status: "blocked";
  reasonCode: DiagnosticCode;
  reason: string;
  diagnostics: ScenarioDiagnostic[];
  appSlug: string;
  appProfilePath?: string;
  suggestedAction: string;
}
