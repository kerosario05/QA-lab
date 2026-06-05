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
  routeProfile?: string;
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
}

export interface ScenariosApiError extends Error {
  status?: number;
  errorCode?: string;
  details?: string;
  endpoint?: string;
  method?: string;
  rawBody?: string;
}
