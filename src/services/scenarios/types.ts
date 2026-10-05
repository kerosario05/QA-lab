export interface ScenarioStep {
  content: string;
  expected: string;
}

export interface DataRequirement {
  key: string;
  label: string;
  required: boolean;
  editable: boolean;
  suggestedValue?: string;
  source: string;
  controlType?: "text" | "number" | "select" | "date" | "boolean";
  options?: string[];
  optionsSource?: string;
}

export type RouteProfile = Record<string, unknown>;

export interface StoryScenario {
  scenarioId?: string;
  id?: string;
  sourceIssueKey?: string;
  title: string;
  refs: string;
  custom_preconds: string | null;
  custom_expected?: string;
  custom_steps_separated: ScenarioStep[];
  routeProfile?: RouteProfile;
  authIntent?: "gate_observation" | "full_authentication";
  dataRequirements?: DataRequirement[];
  requiredData?: string;
  mcpExecutable?: boolean;
  executionReadiness?: string;
  semanticValidity?: string;
  automationType?: string;
  launchClassification?: "standard" | "adaptive" | "nonAutomatable";
  publicationClassification?: string;
  nonAutomatable?: boolean;
  metadata?: Record<string, unknown>;
  targetScreen?: string;
  actualChain?: unknown;
  requiredChain?: unknown;
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
  routeProfile?: RouteProfile;
  scenarios?: McpScenario[];
  data?: {
    routeProfile?: RouteProfile;
    stories?: Story[];
    scenarios?: McpScenario[];
    [key: string]: unknown;
  };
}

export interface McpScenario {
  scenarioId?: string;
  id?: string;
  caseId?: number;
  sourceIssueKey: string;
  title: string;
  steps: string[];
  preconditions?: string[];
  expectedResult?: string;
  nonExecutableCriteria?: string;
  dataRequirements?: string;
  type?: string;
  database?: string;
  isConverted?: boolean;
  automationType?: string;
  launchClassification?: 'standard' | 'adaptive' | 'nonAutomatable';
  setupStrategy?: string;
  appSlug?: string;
  targetAppSlug?: string;
  targetAppName?: string;
  routeProfile?: McpRouteProfile;
  mcpExecutable?: boolean;
  executionReadiness?: string;
  semanticValidity?: string;
  validation?: { valid?: boolean; [key: string]: unknown };
  publicationClassification?: string;
  nonAutomatable?: boolean;
  metadata?: Record<string, unknown>;
  targetScreen?: string;
  actualChain?: unknown;
  requiredChain?: unknown;
  sourceTrace?: { jiraSummary?: string; [key: string]: unknown };
  generationSource?: { jiraSummary?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface McpPreviewResponse extends ScenariosPreviewResponse {
  source?: { issuesFound?: unknown[]; [key: string]: unknown };
  cached?: boolean;
  jobId?: string;
  job?: { id?: string; status?: string } | null;
  status?: string;
  summary?: Record<string, unknown>;
  blockedScenarios?: unknown[];
  adaptiveScenarios?: unknown[];
  rejected?: unknown[];
}

export interface McpRouteProfile {
  entry?: Array<{ businessLabel?: string; visibleLabel?: string }>;
  domainTerms?: Record<string, string>;
  visibleControls?: string[];
  [key: string]: unknown;
}

export type ScenarioReadinessStatus = 'auto_executable' | 'needs_route_profile' | 'needs_test_data' | 'unsupported_or_manual' | 'too_ambiguous';

export interface ScenarioReadinessItem {
  sourceIssueKey: string;
  title: string;
  status: ScenarioReadinessStatus;
  reasons: string[];
  blockingSignals: string[];
  recommendation: string;
}

export interface ScenarioReadinessSummary {
  counts: Record<ScenarioReadinessStatus, number>;
  items: ScenarioReadinessItem[];
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
