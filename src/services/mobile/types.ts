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
  sourceIssueTitle?: string;
  sourceIssueSummary?: string;
  title: string;
  steps: MobileStep[];
  expectedResult: string;
  preconditions: string[];
  sourceTrace?: {
    jiraSummary?: string;
    [key: string]: unknown;
  };
  /** Editable data fields (text inputs + dropdown selects) the user fills before executing. */
  requiredData?: MobileDataField[];
  /** Name of a functional data profile this scenario depends on (business/backend state). */
  requiredDataProfile?: string;
  /** True when the scenario declared a profile that is missing/unresolved — user must supply data manually. */
  requiresManualData?: boolean;
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
  selectedIssueKeys?: string[];
  sourceRevision?: string;
  launchDraftId?: string;
}

export interface MobileScenarioPreviewResponse {
  ok: boolean;
  issuesFound: number;
  scenarios: MobileScenario[];
  rejected: MobileRejectedScenario[];
}

export interface MobileScenarioGenerationIssueProgress {
  issueKey: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  scenarioCount: number;
  rejectedCount: number;
  reasonCode?: string;
  errorMessage?: string;
}

export interface MobileScenarioGenerationStartResponse {
  ok: boolean;
  requestId?: string;
  generationJobId: string;
  launchDraftId?: string;
  idempotencyKeyHash?: string;
  issueKeys?: string[];
  appSlug?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  reused?: boolean;
  cacheHit?: boolean;
  consumersWaiting?: number;
}

export interface MobileScenarioGenerationStatusResponse {
  ok: boolean;
  requestId?: string;
  generationJobId: string;
  launchDraftId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  appSlug?: string;
  issueKeys?: string[];
  issueProgress?: MobileScenarioGenerationIssueProgress[];
  startedAt?: string;
  finishedAt?: string;
  consumersWaiting?: number;
  result?: {
    issuesFound: number;
    scenarios: MobileScenario[];
    rejected: MobileRejectedScenario[];
    diagnosticsByIssue?: Record<string, unknown>;
    scenariosByIssue?: Record<string, MobileScenario[]>;
    rejectedByIssue?: Record<string, MobileRejectedScenario[]>;
    consolidated?: {
      totalScenarios: number;
      totalRejected: number;
      perIssueScenarioCount?: Record<string, number>;
      perIssueRejectedCount?: Record<string, number>;
    };
  };
  error?: {
    code?: string;
    message?: string;
  };
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

export interface MobileRouteLearningScenario {
  scenarioId: string;
  sourceIssueKey?: string;
  title: string;
  requiresRouteLearning?: boolean;
  locatorExecutionBacked?: boolean;
}

export interface MobileHuContext {
  issueKey?: string;
  summary?: string;
  intent?: string;
  acceptanceCriteria?: string;
}

/** Dato que el walk puede escribir/seleccionar para cruzar un formulario. */
export interface MobileLearnerFieldData {
  /** Substring de la etiqueta del campo, para emparejarlo en pantalla. */
  match: string;
  /** Texto a escribir (campos de texto). */
  value?: string;
  /** Opción a tocar antes de escribir (campos de selección, ej. "Cédula"). */
  selectFirst?: string;
}

export interface MobileRouteLearningParams {
  appSlug: string;
  apkPath?: string;
  appPackage?: string;
  flowId?: string;
  flowDescription?: string;
  triggerKeywords?: string[];
  maxScreens?: number;
  /** Rehúsa pulsar controles que confirman el flujo. Default true en el motor. */
  stopBeforeSubmit?: boolean;
  /** Datos que ingresó el usuario en el UI para cruzar formularios (ej. la cédula). */
  screenData?: MobileLearnerFieldData[];
  /** Contexto de la HU: habilita la capa interpretativa (IA) del walk en el motor. */
  huContext?: MobileHuContext;
}

export interface MobileRouteLearningStartResponse {
  ok: boolean;
  jobId: string;
  status: string;
  mode?: string;
  appSlug?: string;
  flowId?: string | null;
  stopBeforeSubmit?: boolean;
}

export interface MobileRouteLearningStatusResponse {
  ok: boolean;
  jobId?: string;
  /** queued | running | done | failed | cancelled */
  status: string;
  result?: unknown;
  error?: string;
  message?: string;
}

/** Respuesta de GET /api/projects/:slug — usada para resolver el APK/package del proyecto. */
export interface MobileProjectConfigResponse {
  project?: { slug?: string; name?: string; projectType?: number };
  mobileConfig?: { apkPath?: string; packageName?: string; mainActivity?: string } | null;
  webConfig?: unknown;
}

export interface MobileLaunchExecutionResponse {
  ok: boolean;
  /** null cuando el motor no publicó nada (p.ej. status === 'requires_route_learning'). */
  launchId: string | null;
  testRunId?: number;
  publishedCases: MobilePublishedCase[];
  manifestPath?: string;
  /** Estado del motor: 'requires_route_learning' cuando los escenarios aún no son ejecutables. */
  status?: string;
  /** Escenarios que necesitan aprendizaje de ruta antes de poder publicarse/ejecutarse. */
  routeLearningScenarios?: MobileRouteLearningScenario[];
  message?: string;
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
  /** Jira issue key used to open the defect checklist (sourceIssueKey). */
  issueKey?: string;
  /** Checklist URL, already carrying ?runId=<mobileRunId> when the backend resolved an issueKey. */
  checklistUrl?: string;
}

export interface MobileApiError extends Error {
  status?: number;
  errorCode?: string;
  message: string;
}
