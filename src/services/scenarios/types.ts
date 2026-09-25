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

export interface StoryScenario {
  scenarioId?: string;
  title: string;
  refs: string;
  custom_preconds: string | null;
  custom_expected?: string;
  custom_steps_separated: ScenarioStep[];
  authIntent?: "gate_observation" | "full_authentication";
  dataRequirements?: DataRequirement[];
  requiredData?: string;
  mcpExecutable?: boolean;
  executionReadiness?: string;
  semanticValidity?: string;
  automationType?: string;
  /** Nombre del perfil de rutas; ver storiesToMcpScenarios en server/runs-provider.ts. */
  routeProfile?: string;
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

// ---------------------------------------------------------------------------
// Forma MCP (plana). Distinta de StoryScenario, que es la forma TestRail:
// aquí `steps` son strings sueltos y el resultado esperado es `expectedResult`.
// ---------------------------------------------------------------------------

export interface McpRouteProfile {
  name: string;
  entry: Array<{ businessLabel: string; visibleLabel: string }>;
  aliases?: Record<string, string>;
  intermediates?: Record<string, string[]>;
  domainTerms?: Record<string, string>;
  visibleControls?: string[];
  representativeFixture?: Record<string, string>;
  notes?: string[];
}

export interface ScenarioSourceTrace {
  sourceMode: string;
  jiraIssueKey: string;
  jiraSummary: string;
  testRailProjectId: number | null;
  suiteId: number | null;
  sectionId: number | null;
  sectionName: string | null;
  sourceCaseIds: string[];
}

export interface ScenarioValidation {
  valid?: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface McpScenario {
  sourceIssueKey: string;
  title: string;
  steps?: string[];
  preconditions?: string[];
  expectedResult?: string;
  scenarioId?: string;
  caseId?: number;
  type?: string;
  database?: string;
  isConverted?: number | boolean;
  automationType?: string;
  launchClassification?: "standard" | "adaptive" | "nonAutomatable";
  setupStrategy?: string;
  appSlug?: string;
  targetAppSlug?: string;
  targetAppName?: string;
  /** Nombre del perfil de rutas, no el perfil en sí (ver McpRouteProfile). */
  routeProfile?: string;
  dataRequirements?: string;
  nonExecutableCriteria?: string;
  mcpExecutable?: boolean;
  executionReadiness?: string;
  semanticValidity?: string;
  validation?: ScenarioValidation;
  publicationClassification?: string;
  nonAutomatable?: boolean;
  metadata?: Record<string, unknown>;
  targetScreen?: string;
  actualChain?: unknown;
  requiredChain?: unknown;
  sourceTrace?: ScenarioSourceTrace;
  generationSource?: ScenarioSourceTrace;
}

export interface McpPreviewResponse {
  scenarios: McpScenario[];
  stories?: Story[];
  totalScenarios?: number;
  cached?: boolean;
  summary?: { generated?: number };
  source?: { issuesFound?: unknown[] };
  /** Campos presentes cuando la generación se resuelve de forma asíncrona. */
  status?: string;
  jobId?: string;
  job?: { id?: string; status?: string } | null;
}

export type ScenarioReadinessStatus =
  | "auto_executable"
  | "needs_route_profile"
  | "needs_test_data"
  | "unsupported_or_manual"
  | "too_ambiguous";

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
