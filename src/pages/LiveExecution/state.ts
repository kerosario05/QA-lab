import type { ActiveRun } from '../../types';

export type LiveExecutionSummaryLike = {
  scenarioCount?: number;
  totalStories?: number;
  total?: number;
  completed?: number;
  passed?: number;
  failed?: number;
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
  total?: number;
  passed?: number;
  failed?: number;
  completed?: number;
  currentTest?: string;
  currentCase?: string;
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

export type LiveExecutionMetrics = {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  progress: number;
  passRate: number;
  currentTestName: string;
  errorMessage: string | null;
  promotionReason: string | null;
  failureGroups: Record<string, number> | null;
  dominantFailure: string | null;
};

export type LiveExecutionOutcome = {
  status: 'running' | 'completed' | 'completed_with_failures' | 'technical_failure';
  title: string;
  subtitle: string;
  isTechnicalFailure: boolean;
  usesObservationsCopy: boolean;
};

export type EvidenceDocumentAvailability = 'idle' | 'preparing' | 'ready' | 'failed' | 'unavailable';

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

export function computePassRatePercent(passed?: number, completed?: number): number {
  if (!Number.isFinite(passed) || !Number.isFinite(completed) || (completed ?? 0) <= 0) {
    return 0;
  }
  return clampProgressPercent(Math.round((Number(passed) / Number(completed)) * 100));
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
    ?? getNumeric(data?.total)
    ?? run?.total
    ?? 0;
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
  const progress = resolveProgressPercent({
    previousProgress: getNumeric(run?.progress),
    completed,
    total,
    backendProgress: getNumeric(data?.progress),
  });
  const passRate = computePassRatePercent(passed, completed);

  return {
    total,
    completed,
    passed,
    failed,
    progress,
    passRate,
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
