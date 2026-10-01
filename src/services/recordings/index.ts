import type {
  DeriveResult,
  GoalCoverage,
  RecordingReviewerContext,
  ReviewerContext,
  RecordedScenario,
  RecordingLive,
  RecordingSummary,
  RecordingLifecycle,
  RecordingDerivationProgress,
  RecordingReplayAdmission,
  RecordingScenarioRejection,
  RecordedScenarioCatalogEntry,
  ScenarioTitleReview,
  TestRailPublishResult,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Carries the backend's own structured `errorCode` (e.g. `SCENARIO_NOT_READY`) alongside the
 * human message, so a caller can react to a SPECIFIC, well-known condition without matching on
 * human-readable text (which can be reworded/translated without notice).
 */
export class ApiError extends Error {
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (res.status === 413) {
    throw new ApiError(body?.message || 'No se pudo guardar la actualización de Recording porque la solicitud excedió el límite permitido.', body?.errorCode);
  }
  // A Recording batch may legitimately return a useful partial body with a non-2xx status.
  // Preserve that result for the card-level status instead of replacing it with “502”.
  if (body?.partial === true && Array.isArray(body?.created) && Array.isArray(body?.failed)) {
    return body as T;
  }
  if (!res.ok || body?.ok === false) {
    const missing = Array.isArray(body?.missingInputs)
      ? body.missingInputs.map((input: { entityScope?: string; semanticField?: string; valueKey?: string }) => [input.entityScope, input.semanticField ?? input.valueKey].filter(Boolean).join(' · ')).join(', ')
      : '';
    throw new ApiError(
      missing ? `${body?.message || 'Faltan inputs requeridos'}: ${missing}` : body?.message || body?.error || `${res.status} ${res.statusText}`,
      body?.errorCode,
    );
  }
  return body as T;
}

export function buildScenarioValueUpdateCommand(projectSlug: string, scenarioId: string, valueKey: string, value: string) {
  return { projectSlug, scenarioId, valueKey, value };
}

export function serializedPayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export type RecordingTestRailDestination = { projectId?: string; suiteId?: string; sectionId?: string; sectionName?: string };

export function buildRecordingExecutePayload(
  projectSlug: string,
  scenarioIds: string[],
  dataOverrides?: Record<string, Record<number, string>>,
  datasetValues?: Record<string, string>,
  // Structured, explicit intent only — never inferred from a button's label. Omitted (or
  // false) on a plain replay so the backend keeps deferring spec generation; `true` only
  // when the caller is the explicit "Reproducir y generar spec" action.
  generateSpec?: boolean,
  // Structured TestRail destination. When present, the backend itself resolves per scenario
  // whether to reuse an existing case/promoted spec, publish a case, and/or generate a spec
  // — this single call replaces a client-side publish-then-execute sequence, superseding
  // `generateSpec` (the backend decides generation from the same resolution).
  testRailDestination?: RecordingTestRailDestination,
) {
  const base = { projectSlug, scenarioIds, dataOverrides, datasetValues };
  if (testRailDestination) return { ...base, testRailDestination };
  return generateSpec === true ? { ...base, generateSpec: true as const } : base;
}

/**
 * Recording API.
 *
 * Every call carries the project slug because the project — not a typed package name or URL —
 * is what determines the app under record. The UI never gets to name a target of its own.
 */
export const recordingsApi = {
  list: (projectSlug: string) =>
    request<{ recordings: RecordingSummary[]; appSlug: string }>(
      `/api/recordings?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  /** Every recorded scenario of the project, newest recording first, with its executability. */
  scenarioCatalog: (projectSlug: string) =>
    request<{ scenarios: RecordedScenarioCatalogEntry[] }>(
      `/api/recordings/scenario-catalog?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  start: (projectSlug: string, recordingGoal?: string) =>
    request<{ recordingId: string; jobId: string; summary: RecordingSummary }>('/api/recordings/start', {
      method: 'POST',
      body: JSON.stringify({ projectSlug, label: recordingGoal, recordingGoal }),
    }),

  status: (recordingId: string, projectSlug: string) =>
    request<{ active: boolean; summary: RecordingSummary; live?: RecordingLive; scenarios?: RecordedScenario[]; semanticModel?: import('./types').SemanticRecordingModel }>(
      `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  stop: (recordingId: string, projectSlug: string) =>
    request<{ summary: RecordingSummary }>(`/api/recordings/${encodeURIComponent(recordingId)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug }),
    }),

  derive: (recordingId: string, projectSlug: string, title?: string) =>
    request<DeriveResult>(`/api/recordings/${encodeURIComponent(recordingId)}/derive`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, title }),
    }),

  /**
   * Starts step generation in the background. A current engine answers 202 with `derivation`;
   * an engine without background generation answers with the full `DeriveResult` instead.
   */
  deriveAsync: (recordingId: string, projectSlug: string, title?: string) =>
    request<{ derivation?: RecordingDerivationProgress } & Partial<DeriveResult>>(`/api/recordings/${encodeURIComponent(recordingId)}/derive`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, title, async: true }),
    }),

  derivation: (recordingId: string, projectSlug: string) =>
    request<{ derivation: RecordingDerivationProgress }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/derivation?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  scenarios: (recordingId: string, projectSlug: string) =>
    request<{ scenarios: RecordedScenario[]; lifecycle?: RecordingLifecycle; titleReview?: Record<string, ScenarioTitleReview> }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/scenarios?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  saveScenarios: (recordingId: string, projectSlug: string, scenarios: RecordedScenario[], datasetValues?: Record<string, string | undefined>, scenarioDatasetValues?: Record<string, Record<string, string | undefined>>) =>
    request<{ scenarios: RecordedScenario[]; lifecycle?: RecordingLifecycle }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/scenarios`,
      { method: 'PUT', body: JSON.stringify({ projectSlug, scenarios, datasetValues, scenarioDatasetValues }) },
    ),

  updateScenarioValue: (recordingId: string, projectSlug: string, scenarioId: string, valueKey: string, value: string) =>
    request<{ scenario: RecordedScenario }>(`/api/recordings/${encodeURIComponent(recordingId)}/scenario-value`, {
      method: 'PUT',
      body: JSON.stringify(buildScenarioValueUpdateCommand(projectSlug, scenarioId, valueKey, value)),
    }),

  /** Renames one scenario; the answer carries the fresh title review. */
  renameScenario: (recordingId: string, projectSlug: string, scenarioId: string, title: string) =>
    request<{ scenario: RecordedScenario; titleReview?: ScenarioTitleReview }>(`/api/recordings/${encodeURIComponent(recordingId)}/scenario-title`, {
      method: 'PUT',
      body: JSON.stringify({ projectSlug, scenarioId, title }),
    }),

  /** Business context QA added, recording-wide and per scenario. */
  reviewerContext: (recordingId: string, projectSlug: string) =>
    request<{ context: RecordingReviewerContext }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/context?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  /** `scope` is "recording" or a scenario id; an empty context removes it. */
  updateReviewerContext: (recordingId: string, projectSlug: string, scope: string, context: ReviewerContext) =>
    request<{ context: RecordingReviewerContext }>(`/api/recordings/${encodeURIComponent(recordingId)}/context`, {
      method: 'PUT',
      body: JSON.stringify({ projectSlug, scope, context }),
    }),

  /** Does the recording do what its declared goal says? Computed by the engine on every read. */
  goalCoverage: (recordingId: string, projectSlug: string) =>
    request<{ coverage: GoalCoverage }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/goal-coverage?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  updateGoal: (recordingId: string, projectSlug: string, change: { goal?: string; acknowledgeCoverage?: boolean }) =>
    request<{ coverage: GoalCoverage }>(`/api/recordings/${encodeURIComponent(recordingId)}/goal`, {
      method: 'PUT',
      body: JSON.stringify({ projectSlug, ...change }),
    }),

  /** Keeps a suggestion the quality gate discarded, as a draft that never runs or publishes. */
  keepSuggestionDraft: (recordingId: string, projectSlug: string, candidateId: string) =>
    request<{ scenario: RecordedScenario }>(`/api/recordings/${encodeURIComponent(recordingId)}/suggestion-drafts`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, candidateId }),
    }),

  discardSuggestionDraft: (recordingId: string, projectSlug: string, scenarioId: string) =>
    request<{ scenarioId: string }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/suggestion-drafts/${encodeURIComponent(scenarioId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
      { method: 'DELETE' },
    ),

  trace: (recordingId: string, projectSlug: string) =>
    request<{ trace: { narrative?: string } }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/trace?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  semantic: (recordingId: string, projectSlug: string) =>
    request<{ model: import('./types').SemanticRecordingModel }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/semantic?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  /**
   * Publishes the selected scenarios as TestRail cases.
   *
   * `destination` overrides where they land. Omitting it keeps the project's configured
   * section, which is what the panel does until someone picks another one; sending the
   * project and suite alongside the section lets the engine refuse a mismatched pair rather
   * than filing the cases in another team's project.
   */
  publishToTestRail: (
    recordingId: string,
    projectSlug: string,
    scenarioIds?: string[],
    destination?: { sectionId?: string; projectId?: string; suiteId?: string },
    datasetValues?: Record<string, string>,
  ) =>
    request<TestRailPublishResult>(`/api/recordings/${encodeURIComponent(recordingId)}/testrail`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, scenarioIds, datasetValues, ...destination }),
    }),

  /**
   * Replays a recorded web walkthrough in a real browser.
   *
   * Answers with a job id, not with the outcome: the replay walks the whole flow, so the
   * panel follows it on the job endpoint like every other long operation.
   */
  execute: (
    recordingId: string,
    projectSlug: string,
    scenarioIds: string[],
    dataOverrides?: Record<string, Record<number, string>>,
    datasetValues?: Record<string, string>,
    generateSpec?: boolean,
    testRailDestination?: RecordingTestRailDestination,
  ) =>
    request<{
      jobId?: string;
      scenarioCount?: number;
      rejectedScenarios?: RecordingScenarioRejection[];
      executionMode?: string;
      fastPath?: Array<{ scenarioId: string; caseId: number; specPath: string; status: 'passed' | 'failed' | 'skipped'; error?: string }>;
    } & Partial<RecordingReplayAdmission>>(
      `/api/recordings/${encodeURIComponent(recordingId)}/execute`,
      { method: 'POST', body: JSON.stringify(buildRecordingExecutePayload(projectSlug, scenarioIds, dataOverrides, datasetValues, generateSpec, testRailDestination)) },
    ),

  remove: (recordingId: string, projectSlug: string) =>
    request<{ ok: boolean }>(
      `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
      { method: 'DELETE' },
    ),
};

export type * from './types';
