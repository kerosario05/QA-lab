export interface MobileStepTarget {
  strategy: 'accessibilityId' | 'id' | 'xpath' | 'androidUiAutomator' | 'className';
  value: string;
}

export interface MobileStep {
  action: 'launchApp' | 'click' | 'fill' | 'assertVisible' | 'waitFor' | 'screenshot';
  description?: string;
  target?: MobileStepTarget;
  value?: string;
  timeoutMs?: number;
}

export interface EmulatorStatus {
  running: boolean;
  avdName?: string;
  bootCompleted: boolean;
  pid?: number;
}

export interface AppiumStatus {
  running: boolean;
  port?: number;
  ready?: boolean;
  pid?: number;
}

export interface MobileDataField {
  key: string;
  label: string;
  kind: 'text' | 'select';
  stepIndex: number;
  exampleValue: string;
  sensitive: boolean;
  options?: string[];
  defaultValue?: string;
  applyTargetTemplate?: { strategy: MobileStepTarget['strategy']; value: string };
}

export interface MobileScenario {
  scenarioId: string;
  sourceIssueKey: string;
  title: string;
  steps: MobileStep[];
  expectedResult: string;
  preconditions: string[];
  /** Editable data fields (text inputs + dropdown selects) the user fills before executing. */
  requiredData?: MobileDataField[];
}

export interface MobileRejectedScenario {
  sourceIssueKey: string;
  reason: string;
}

export interface MobileScenarioPreviewParams {
  projectKey: string;
  sprintId?: number;
  activeSprint?: boolean;
  status?: string;
  maxResults?: number;
  appSlug?: string;
}

export interface MobileScenarioPreviewResponse {
  ok: boolean;
  issuesFound: number;
  scenarios: MobileScenario[];
  rejected: MobileRejectedScenario[];
}

export interface MobilePublishedCase {
  caseId: number;
  launchScenarioId: string;
  title: string;
  sourceIssueKey?: string;
}

export interface MobileLaunchExecutionParams {
  appSlug: string;
  projectId: number;
  testrailSectionId: number;
  suiteId?: number;
  jiraKey?: string;
  sprintName?: string;
  publishStrategy?: 'always_create' | 'use_existing';
  scenarios: MobileScenario[];
}

export interface MobileLaunchExecutionResponse {
  ok: boolean;
  launchId: string;
  testRunId: number;
  publishedCases: MobilePublishedCase[];
  manifestPath?: string;
}

export interface MobileRunExecuteParams {
  launchId: string;
  testRunId: number;
  publishedCases: MobilePublishedCase[];
  appSlug: string;
  scenarios: Array<{ scenarioId: string; title: string; steps: MobileStep[]; requiredData?: MobileDataField[] }>;
  /** User-supplied real values, keyed by scenarioId -> { stepIndex: value }. */
  dataOverrides?: Record<string, Record<number, string>>;
}

export interface MobileRunExecuteResponse {
  ok: boolean;
  jobId: string;
  status: string;
  mode?: string;
}

export interface MobileApiError extends Error {
  status?: number;
  errorCode?: string;
  message: string;
}
