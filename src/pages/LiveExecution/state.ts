import type { ActiveRun } from '../../types';

export type LiveExecutionSummaryLike = {
  scenarioCount?: number;
  totalStories?: number;
  total?: number;
  requested?: number;
  executed?: number;
  completed?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  progressPercent?: number;
  passRate?: number | null;
  errorMessage?: string;
  promotionReason?: string;
  failureGroups?: Record<string, number>;
  testRailRunId?: number;
  testRailRunUrl?: string;
  pendingTestRailReportPath?: string;
  createdTestRailCases?: number;
  reusedTestRailCases?: number;
  reportedTestRailPassed?: number;
  reportedTestRailFailed?: number;
};

export type LiveExecutionStatusLike = {
  status?: string;
  progress?: number;
  progressPercent?: number;
  total?: number;
  requested?: number;
  executed?: number;
  passed?: number;
  failed?: number;
  completed?: number;
  skipped?: number;
  passRate?: number | null;
  currentTest?: string;
  currentCase?: string;
  activeScenario?: ActiveScenarioLike | null;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  finishedAt?: string;
  lastEventAt?: string;
  receivedFinalEventAt?: string;
  durationMs?: number;
  documentReady?: boolean;
  documentUrl?: string;
  documentPath?: string;
  evidenceDocument?: string;
  evidenceDocxPath?: string;
  summaryDocumentReady?: boolean;
  summary?: LiveExecutionSummaryLike;
};

export type ActiveScenarioLike = {
  id: string;
  title: string;
  index: number;
  total: number;
  steps: string[];
  preconditions?: string[];
  expectedResult?: string | null;
  stepResults?: Array<{ status?: string; state?: string }>;
};

export function normalizeCaseStartedScenario(value: unknown): ActiveScenarioLike | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.type !== 'case_started') return null;

  const id = typeof event.caseId === 'string' ? event.caseId.trim() : '';
  const title = typeof event.title === 'string' ? event.title : '';
  if (!id || !title) return null;

  return {
    id,
    title,
    index: typeof event.index === 'number' && Number.isFinite(event.index) ? event.index : 0,
    total: typeof event.total === 'number' && Number.isFinite(event.total) ? event.total : 0,
    steps: Array.isArray(event.steps)
      ? event.steps.filter((step): step is string => typeof step === 'string')
      : [],
  };
}

export function resolveActiveScenarioUpdate(value: unknown): ActiveScenarioLike | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const event = value as Record<string, unknown>;
  if (event.type === 'case_started') return normalizeCaseStartedScenario(value);
  if (event.type === 'case_finished') return null;
  if (Object.prototype.hasOwnProperty.call(event, 'activeScenario')) {
    return (event.activeScenario as ActiveScenarioLike | null | undefined) ?? null;
  }
  return undefined;
}

export function cleanActiveScenarioText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

export function stripStepPrefix(value: string): string {
  return value.replace(/^\s*\d+\s*(?:[.)]|[-:])\s*/, '').trim();
}

export function getCompactScenarioSteps(steps: string[], maxVisible = 5): { steps: string[]; remaining: number } {
  const normalized = steps.map(cleanActiveScenarioText).map(stripStepPrefix).filter(Boolean);
  return {
    steps: normalized.slice(0, maxVisible),
    remaining: Math.max(0, normalized.length - maxVisible),
  };
}

export function getScenarioStepState(
  stepResults: ActiveScenarioLike['stepResults'],
  index: number,
): 'completed' | 'running' | 'pending' {
  const raw = String(stepResults?.[index]?.status ?? stepResults?.[index]?.state ?? '').toLowerCase();
  if (['passed', 'pass', 'completed', 'complete', 'success', 'ok'].includes(raw)) return 'completed';
  if (['running', 'started', 'in_progress', 'executing'].includes(raw)) return 'running';
  return 'pending';
}

export type LiveExecutionMetrics = {
  total: number;
  requested: number;
  completed: number;
  executed: number;
  passed: number;
  failed: number;
  progress: number;
  passRate: number | null;
  currentTestName: string;
  errorMessage: string | null;
  promotionReason: string | null;
  failureGroups: Record<string, number> | null;
  dominantFailure: string | null;
};

export type LiveExecutionBannerMetric = {
  id: 'processed' | 'executed' | 'passed' | 'failed';
  label: string;
  value: number;
  total?: number;
  valueClassName?: string;
};

export type LiveExecutionOutcome = {
  status: 'running' | 'completed' | 'completed_with_failures' | 'technical_failure';
  title: string;
  subtitle: string;
  isTechnicalFailure: boolean;
  usesObservationsCopy: boolean;
};

export type EvidenceDocumentAvailability = 'idle' | 'preparing' | 'ready' | 'failed' | 'unavailable';

export const LIVE_EXECUTION_BANNER_GRID_CLASS = 'grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/15';

const TERMINAL_STATUSES = new Set([
  'completed',
  'completed_with_failures',
  'failed',
  'cancelled',
  'canceled',
  'stopped',
  'timeout',
  'error',
  'done',
]);

const ACTIVE_STATUSES = new Set([
  'queued',
  'pending',
  'starting',
  'running',
  'in_progress',
]);

function getNumeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getProgressNumeric(value: unknown): number | undefined {
  const numeric = getNumeric(value);
  if (numeric == null) return undefined;
  return clampProgressPercent(numeric);
}

function parseDateMs(value?: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isTerminalRunStatus(status?: string | null): boolean {
  if (!status?.trim()) return false;
  return TERMINAL_STATUSES.has(status.trim().toLowerCase());
}

export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

export function computeProgressFromCompleted(
  completed?: number,
  total?: number,
): number | undefined {
  if (completed == null || total == null) return undefined;
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return undefined;
  return clampProgressPercent((completed / total) * 100);
}

export function resolveProgressPercent(input: {
  previousProgress?: number;
  completed?: number;
  total?: number;
  backendProgress?: number;
}): number {
  const previousProgress = getProgressNumeric(input.previousProgress) ?? 0;
  const completedProgress = computeProgressFromCompleted(input.completed, input.total);
  const backendProgress = getProgressNumeric(input.backendProgress);

  let nextProgress: number;
  if (completedProgress != null) {
    nextProgress = backendProgress != null
      ? Math.max(completedProgress, backendProgress)
      : completedProgress;
  } else {
    nextProgress = backendProgress ?? previousProgress;
  }
  return Math.max(previousProgress, clampProgressPercent(nextProgress));
}

export function computePassRatePercent(passed?: number, executed?: number): number | null {
  if (!Number.isFinite(passed) || !Number.isFinite(executed) || (executed ?? 0) <= 0) {
    return null;
  }
  return clampProgressPercent(Math.round((Number(passed) / Number(executed)) * 100));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeFunctionalPassRatePercent(passed?: number, failed?: number): number | null {
  const passedCases = Number.isFinite(passed) ? Math.max(0, Number(passed)) : 0;
  const failedCases = Number.isFinite(failed) ? Math.max(0, Number(failed)) : 0;
  const executedCases = passedCases + failedCases;
  if (executedCases <= 0) return null;
  const raw = (passedCases / executedCases) * 100;
  return Math.max(0, Math.min(100, roundToTwoDecimals(raw)));
}

export function computeBlockedCases(completed?: number, executed?: number, skipped?: number): number {
  const completedCases = Number.isFinite(completed) ? Math.max(0, Number(completed)) : 0;
  const executedCases = Number.isFinite(executed) ? Math.max(0, Number(executed)) : 0;
  const skippedCases = Number.isFinite(skipped) ? Math.max(0, Number(skipped)) : 0;
  if (completedCases >= executedCases) {
    return Math.max(0, completedCases - executedCases);
  }
  return skippedCases;
}

export function buildLiveExecutionBannerMetrics(input: {
  completed: number;
  processedTotal: number;
  executed: number;
  passed: number;
  failed: number;
}): LiveExecutionBannerMetric[] {
  return [
    {
      id: 'processed',
      label: 'Procesados',
      value: input.completed,
      total: input.processedTotal,
    },
    {
      id: 'executed',
      label: 'Ejecutados',
      value: input.executed,
    },
    {
      id: 'passed',
      label: 'Aprobados',
      value: input.passed,
      valueClassName: 'text-[#5EC470]',
    },
    {
      id: 'failed',
      label: 'Fallidos',
      value: input.failed,
      valueClassName: 'text-[#FFB4B4]',
    },
  ];
}

function formatPercentCompact(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

export function formatFunctionalPassRateLabel(input: { passed?: number; failed?: number; status?: string | null }): string {
  const passedCases = Number.isFinite(input.passed) ? Math.max(0, Number(input.passed)) : 0;
  const failedCases = Number.isFinite(input.failed) ? Math.max(0, Number(input.failed)) : 0;
  const executedCases = passedCases + failedCases;
  if (executedCases <= 0) {
    const normalizedStatus = input.status?.trim().toLowerCase();
    if (normalizedStatus === 'running' || normalizedStatus === 'in_progress' || normalizedStatus === 'starting') {
      return 'Pendiente';
    }
    if (normalizedStatus === 'pending' || normalizedStatus === 'queued') {
      return 'Sin resultados';
    }
    if (normalizedStatus === 'completed' || normalizedStatus === 'done' || normalizedStatus === 'completed_with_failures') {
      return 'No aplica';
    }
    return 'Sin resultados';
  }
  const percent = computeFunctionalPassRatePercent(passedCases, failedCases) ?? 0;
  return `${formatPercentCompact(percent)}%`;
}

export function isTerminalStatus(status?: string | null): boolean {
  return isTerminalRunStatus(status);
}

export function isActiveRunStatus(status?: string | null): boolean {
  if (!status?.trim()) return false;
  return ACTIVE_STATUSES.has(status.trim().toLowerCase());
}

export function isSuccessTerminalStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'done' || normalized === 'completed';
}

export function isErrorTerminalStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'failed' || normalized === 'error';
}

export function isCancelledStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled';
}

export function withStableTerminalTimestamp(
  data: LiveExecutionStatusLike | null | undefined,
  receivedAtIso?: string,
): LiveExecutionStatusLike | undefined {
  if (!data) return undefined;
  if (!isTerminalStatus(data.status)) return data;
  if (getRunEndTimeMs(data) != null) return data;
  if (!receivedAtIso) return data;
  return {
    ...data,
    receivedFinalEventAt: data.receivedFinalEventAt ?? receivedAtIso,
  };
}

export function hasReadyEvidenceDocument(data?: LiveExecutionStatusLike | null): boolean {
  if (!data) return false;
  if (data.documentReady === true) return true;
  if (data.summaryDocumentReady === true) return true;

  const stringFields = [
    data.documentUrl,
    data.documentPath,
    data.evidenceDocument,
    data.evidenceDocxPath,
    (data.summary as Record<string, unknown> | undefined)?.documentUrl as string | undefined,
    (data.summary as Record<string, unknown> | undefined)?.documentPath as string | undefined,
    (data.summary as Record<string, unknown> | undefined)?.evidenceDocument as string | undefined,
    (data.summary as Record<string, unknown> | undefined)?.evidenceDocxPath as string | undefined,
    (data.summary as Record<string, unknown> | undefined)?.evidenceDocumentPath as string | undefined,
  ];
  return stringFields.some((value) => typeof value === 'string' && value.trim().length > 0);
}

export function canEnableDocumentDownload(status?: string | null, data?: LiveExecutionStatusLike | null): boolean {
  if (!isTerminalStatus(status)) return false;
  return hasReadyEvidenceDocument(data);
}

export function shouldShowDefectChecklistButton(input: {
  failed?: number;
  defectCount?: number;
  checklistUrl?: string | null;
  issueKey?: string | null;
}): boolean {
  const failedCases = Math.max(0, Number(input.failed ?? 0));
  const defects = Math.max(0, Number(input.defectCount ?? 0));
  const hasFailedCases = failedCases > 0 || defects > 0;
  const hasChecklistIdentity = Boolean(
    input.checklistUrl && input.checklistUrl.trim().length > 0,
  ) || Boolean(
    input.issueKey && input.issueKey.trim().length > 0,
  );
  return hasFailedCases && hasChecklistIdentity;
}

export function resolveDocumentAvailabilityState(input: {
  ready: boolean;
  state?: string;
  statusCode?: number;
  attempt: number;
  maxAttempts: number;
}): { state: EvidenceDocumentAvailability; continuePolling: boolean } {
  if (input.ready) {
    return { state: 'ready', continuePolling: false };
  }

  const normalizedState = input.state?.trim().toLowerCase();
  if (normalizedState === 'failed') {
    return { state: 'failed', continuePolling: false };
  }
  if (normalizedState === 'unavailable') {
    return { state: 'unavailable', continuePolling: false };
  }

  const attemptsExceeded = input.attempt >= input.maxAttempts;
  if (attemptsExceeded) {
    return { state: 'unavailable', continuePolling: false };
  }

  if (input.statusCode === 404 || normalizedState === 'preparing' || normalizedState === 'pending') {
    return { state: 'preparing', continuePolling: true };
  }

  if ((input.statusCode ?? 0) >= 500) {
    return { state: 'failed', continuePolling: false };
  }

  return { state: 'preparing', continuePolling: true };
}

export function getTerminalUserMessage(status?: string | null): { text: string; tone: 'success' | 'error' | 'neutral' | 'info' } {
  if (isSuccessTerminalStatus(status)) {
    return { text: '✓ Ejecución completada', tone: 'success' };
  }
  if (isErrorTerminalStatus(status)) {
    return { text: 'Ejecución finalizada con errores', tone: 'error' };
  }
  if (isCancelledStatus(status)) {
    return { text: 'Ejecución cancelada', tone: 'neutral' };
  }
  return { text: 'Ejecutándose ahora', tone: 'info' };
}

export function shouldResetDocumentStateForJob(previousJobId?: string | null, nextJobId?: string | null): boolean {
  if (!nextJobId) return false;
  return previousJobId !== nextJobId;
}

export function getRunStartTimeMs(run: Pick<ActiveRun, 'startedAt'> | null, data?: LiveExecutionStatusLike): number | null {
  return parseDateMs(data?.startedAt) ?? parseDateMs(run?.startedAt ?? null);
}

export function getRunEndTimeMs(data?: LiveExecutionStatusLike): number | null {
  return parseDateMs(data?.completedAt)
    ?? parseDateMs(data?.finishedAt)
    ?? parseDateMs(data?.receivedFinalEventAt)
    ?? parseDateMs(data?.lastEventAt)
    ?? null;
}

export function computeLiveExecutionElapsedMs(
  run: Pick<ActiveRun, 'startedAt'> | null,
  data?: LiveExecutionStatusLike,
  now: number = Date.now(),
): number {
  const startedAtMs = getRunStartTimeMs(run, data);
  if (startedAtMs == null) return 0;

  const durationMs = getNumeric(data?.durationMs);
  if (isTerminalRunStatus(data?.status)) {
    const endMs = getRunEndTimeMs(data);
    if (durationMs != null) return Math.max(0, durationMs);
    if (endMs != null) return Math.max(0, endMs - startedAtMs);
    return 0;
  }

  if (durationMs != null) return Math.max(0, durationMs);
  return Math.max(0, now - startedAtMs);
}

export function computeLiveExecutionMetrics(
  run: ActiveRun | null,
  data?: LiveExecutionStatusLike,
): LiveExecutionMetrics {
  const summary = data?.summary;
  const total = getNumeric(summary?.scenarioCount)
    ?? getNumeric(summary?.totalStories)
    ?? getNumeric(summary?.total)
    ?? getNumeric(summary?.requested)
    ?? getNumeric(data?.total)
    ?? getNumeric(data?.requested)
    ?? run?.total
    ?? 0;
  const requested = getNumeric(data?.requested)
    ?? getNumeric(summary?.requested)
    ?? total;
  const completed = getNumeric(data?.completed)
    ?? getNumeric(summary?.completed)
    ?? run?.completed
    ?? 0;
  const passed = getNumeric(data?.passed)
    ?? getNumeric(summary?.passed)
    ?? run?.passed
    ?? 0;
  const failed = getNumeric(data?.failed)
    ?? getNumeric(summary?.failed)
    ?? run?.failed
    ?? 0;
  const executed = getNumeric(data?.executed)
    ?? getNumeric(summary?.executed)
    ?? Math.max(0, passed + failed);
  const progress = resolveProgressPercent({
    previousProgress: getNumeric(run?.progress),
    completed,
    total: requested,
    backendProgress: getNumeric(data?.progressPercent) ?? getNumeric(summary?.progressPercent) ?? getNumeric(data?.progress),
  });
  const passRate = (data?.passRate ?? summary?.passRate) as number | null | undefined;
  const resolvedPassRate = typeof passRate === 'number' && Number.isFinite(passRate)
    ? clampProgressPercent(passRate)
    : passRate === null
      ? null
      : computePassRatePercent(passed, executed);

  return {
    total,
    requested,
    completed,
    executed,
    passed,
    failed,
    progress,
    passRate: resolvedPassRate,
    currentTestName: data?.currentCase || data?.currentTest || run?.currentTest || '',
    errorMessage: data?.errorMessage || summary?.errorMessage || null,
    promotionReason: (summary?.promotionReason as string | undefined) ?? null,
    failureGroups: (summary?.failureGroups as Record<string, number> | undefined) ?? null,
    dominantFailure: (() => {
      const groups = (summary?.failureGroups as Record<string, number> | undefined) ?? null;
      if (!groups) return null;
      const ordered = Object.entries(groups)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);
      return ordered[0]?.[0] ?? null;
    })(),
  };
}

export function getLiveExecutionElapsedSeconds(
  run: Pick<ActiveRun, 'startedAt'> | null,
  data?: LiveExecutionStatusLike,
  now: number = Date.now(),
): number {
  return Math.floor(computeLiveExecutionElapsedMs(run, data, now) / 1000);
}

export function getLiveExecutionStatusText(status: string, completed: number): string {
  if (status === 'failed' || status === 'error') {
    return completed > 0 ? 'Terminado con errores' : 'Ejecución fallida';
  }
  if (status === 'completed_with_failures') {
    return 'Ejecución completada con observaciones';
  }
  if (status === 'done' || status === 'completed') {
    return 'Ejecución completada';
  }
  return 'Ejecutándose ahora';
}

export function getLiveExecutionOutcome(
  status: string,
  summary: Pick<LiveExecutionMetrics, 'completed' | 'passed' | 'failed' | 'total'>,
  errorMessage?: string | null,
): LiveExecutionOutcome {
  const hasPartialResults = summary.completed > 0 || summary.passed > 0 || summary.failed > 0;
  const total = summary.total || summary.completed;

  if (status === 'completed_with_failures' && summary.passed > 0 && summary.failed > 0) {
    return {
      status: 'completed_with_failures',
      title: 'Ejecución completada con observaciones',
      subtitle: `${summary.passed} de ${total} escenarios pasaron. ${summary.failed} requiere${summary.failed === 1 ? '' : 'n'} revisión.`,
      isTechnicalFailure: false,
      usesObservationsCopy: true,
    };
  }

  if (status === 'completed') {
    return {
      status: 'completed',
      title: 'Ejecución completada',
      subtitle: `${summary.passed} de ${total} escenarios pasaron.`,
      isTechnicalFailure: false,
      usesObservationsCopy: false,
    };
  }

  if (status === 'failed' || status === 'error') {
    const technicalFailure = !hasPartialResults;
    return {
      status: technicalFailure ? 'technical_failure' : 'completed_with_failures',
      title: technicalFailure ? '✗ Error' : 'Ejecución completada con observaciones',
      subtitle: technicalFailure
        ? (errorMessage || 'La ejecución falló antes de iniciar el primer caso.')
        : `${summary.passed} de ${total} escenarios pasaron. ${summary.failed} requiere${summary.failed === 1 ? '' : 'n'} revisión.`,
      isTechnicalFailure: technicalFailure,
      usesObservationsCopy: !technicalFailure,
    };
  }

  return {
    status: 'running',
    title: 'Ejecutándose ahora',
    subtitle: '',
    isTechnicalFailure: false,
    usesObservationsCopy: false,
  };
}
