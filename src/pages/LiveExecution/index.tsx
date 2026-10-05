import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, FileText, Lock, Pause, Square, CheckCircle2,
  Loader2, Terminal, Maximize2, AlertCircle, Download,
  X, Copy, Check,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar,
  PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { runsProxy } from '../../services/runs';
import { flushScenarioValueWrites } from '../../services/recordings/scenario-value-flush';
import type { ActiveRun } from '../../types';
import {
  computeLiveExecutionElapsedMs,
  getLiveExecutionElapsedSeconds,
  isActiveRunStatus,
  isCancelledStatus,
  isErrorTerminalStatus,
  isSuccessTerminalStatus,
  isTerminalStatus,
  canEnableDocumentDownload,
  buildLiveExecutionBannerMetrics,
  computeFunctionalPassRatePercent,
  formatFunctionalPassRateLabel,
  resolveProgressPercent,
  resolveDocumentAvailabilityState,
  getTerminalUserMessage,
  LIVE_EXECUTION_BANNER_GRID_CLASS,
  shouldResetDocumentStateForJob,
  shouldShowDefectChecklistButton,
  withStableTerminalTimestamp,
  resolveActiveScenarioUpdate,
  type EvidenceDocumentAvailability,
  type LiveExecutionStatusLike,
  type ActiveScenarioLike,
  getScenarioStepState,
  parseLiveScenarioProgress,
  applyLiveScenarioProgress,
  finishActiveScenario,
  getCurrentScenarioStepIndex,
} from './state';
import {
  createMobileProgressState,
  reduceMobileProgress,
  computeMobileCounters,
} from './mobile-progress';

interface LiveExecutionScreenProps {
  run: ActiveRun | null;
  onClose: () => void;
  onComplete?: () => void;
  onCloseExecution?: (execution: any) => void;
  onOpenChecklist?: (issueKey: string, jobId?: string, scenarioIds?: string[]) => void;
}

interface DisplayLog { time: string; type: string; msg: string; }

const DOC_STATUS_POLL_INTERVAL_MS = 2000;
const DOC_STATUS_MAX_ATTEMPTS = 30;
const RUN_STATUS_POLL_INTERVAL_MS = 2000;

/** Clipboard write that also works on non-secure origins (navigator.clipboard needs HTTPS/localhost). */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { return document.execCommand('copy'); } finally { document.body.removeChild(area); }
}

const formatTime = (s: number) => {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const formatNow = () => new Date().toTimeString().slice(0, 8);

const mapLevel = (level?: string): DisplayLog['type'] => {
  if (!level) return 'info';
  if (level === 'success' || level === 'pass' || level === 'passed') return 'success';
  if (level === 'error'   || level === 'fail' || level === 'failed')  return 'error';
  return 'info';
};

export function LiveExecutionScreen({ run, onClose, onComplete, onCloseExecution }: LiveExecutionScreenProps) {
  const [progress,        setProgress]        = useState(run?.progress ?? 0);
  const [total,           setTotal]           = useState(run?.total ?? 0);
  const [requested,       setRequested]       = useState(run?.total ?? 0);
  const [completed,       setCompleted]       = useState(run?.completed ?? 0);
  const [executed,        setExecuted]        = useState(0);
  const [passed,          setPassed]          = useState(run?.passed ?? 0);
  const [failed,          setFailed]          = useState(run?.failed ?? 0);
  const [skipped,         setSkipped]         = useState(0);
  const [passRate,        setPassRate]        = useState<number | null>(null);
  const [currentTestName, setCurrentTestName] = useState(run?.currentTest || '');
  const [activeScenario, setActiveScenario] = useState<ActiveScenarioLike | null>(
    ((run as (ActiveRun & { activeScenario?: ActiveScenarioLike | null }) | null)?.activeScenario)
      ?? run?.activeScenarios?.[0]
      ?? null,
  );
  const [jobStatus,       setJobStatus]       = useState(run?.status || 'queued');
  const [logs,            setLogs]            = useState<DisplayLog[]>([]);
  const [logsCopied,      setLogsCopied]      = useState(false);
  const [streamError,     setStreamError]     = useState<string | null>(null);
  const [elapsed,         setElapsed]         = useState(0);
  const [currentJobId,    setCurrentJobId]    = useState(run?.jobId || run?.id || '');
  const [checklistUrl,    setChecklistUrl]    = useState<string | null>(run?.checklistUrl ?? null);
  const [issueKey,        setIssueKey]        = useState<string | null>(run?.issueKey ?? null);
  const [defectCount,     setDefectCount]     = useState<number>(typeof run?.defectCount === 'number' ? run.defectCount : 0);
  const [rerunning,       setRerunning]        = useState(false);
  const [downloadingDocx,  setDownloadingDocx]  = useState(false);
  const [docxError,      setDocxError]      = useState<string | null>(null);
  const [documentReady,  setDocumentReady]  = useState(false);
  const [documentState,  setDocumentState]  = useState<EvidenceDocumentAvailability>('idle');
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const [rerunKey,        setRerunKey]          = useState(0);

  const logsEndRef   = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const lastStatusRef = useRef<LiveExecutionStatusLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const documentPollTimerRef = useRef<number | null>(null);
  const documentPollingJobIdRef = useRef<string | null>(null);
  const documentPollAttemptsRef = useRef(0);
  const reportPreviewRequestRef = useRef(0);
  const terminalReceivedAtRef = useRef<string | null>(null);
  const activeJobIdRef = useRef(currentJobId);
  const totalRef = useRef(total);
  const requestedRef = useRef(requested);
  const completedRef = useRef(completed);
  const executedRef = useRef(executed);
  const passedRef = useRef(passed);
  const failedRef = useRef(failed);
  const skippedRef = useRef(skipped);
  const passRateRef = useRef<number | null>(passRate);
  const progressRef = useRef(progress);

  const isDone = isTerminalStatus(jobStatus);
  const isFailed = isErrorTerminalStatus(jobStatus);
  const isSuccessDone = isSuccessTerminalStatus(jobStatus);
  const isCancelled = isCancelledStatus(jobStatus);
  const processedTotal = requested > 0 ? requested : total;
  const bannerMetrics = buildLiveExecutionBannerMetrics({
    completed,
    processedTotal,
    executed,
    passed,
    failed,
  });
  const functionalPassRate = computeFunctionalPassRatePercent(passed, failed);
  const functionalPassRateLabel = formatFunctionalPassRateLabel({ passed, failed, status: jobStatus });
  const finalUserMessage = getTerminalUserMessage(jobStatus);
  const currentScenarioStepIndex = getCurrentScenarioStepIndex(activeScenario);
  const currentScenarioStep = currentScenarioStepIndex >= 0
    ? activeScenario?.steps[currentScenarioStepIndex]?.replace(/^\s*\d+\s*[.)-]\s*/, '').trim()
    : '';
  const canDownloadDocument = isTerminalStatus(jobStatus) && documentReady && Boolean(currentJobId);

  const closeReportPreview = () => {
    reportPreviewRequestRef.current += 1;
    setReportPreviewOpen(false);
    setReportPreviewUrl(null);
    setReportPreviewLoading(false);
    setReportPreviewError(null);
  };

  const openReportPreview = async () => {
    if (!canDownloadDocument || reportPreviewLoading) return;
    const requestId = ++reportPreviewRequestRef.current;
    setReportPreviewOpen(true);
    setReportPreviewUrl(null);
    setReportPreviewError(null);
    setReportPreviewLoading(true);
    try {
      const url = await runsProxy.previewEvidencePdf(currentJobId);
      if (requestId !== reportPreviewRequestRef.current) {
        window.URL.revokeObjectURL(url);
        return;
      }
      setReportPreviewUrl(url);
    } catch (error) {
      if (requestId === reportPreviewRequestRef.current) {
        setReportPreviewError(error instanceof Error ? error.message : 'No se pudo cargar la vista previa del PDF.');
      }
    } finally {
      if (requestId === reportPreviewRequestRef.current) setReportPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!reportPreviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReportPreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [reportPreviewOpen]);

  useEffect(() => () => {
    if (reportPreviewUrl) window.URL.revokeObjectURL(reportPreviewUrl);
  }, [reportPreviewUrl]);

  const handleRerun = async () => {
    if (!run?.jobId || rerunning) return;
    setRerunning(true);
    try {
      if (run.recordingId) {
        const flush = await flushScenarioValueWrites(run.recordingId, run.scenarioIds);
        if (flush.persistFailedCount > 0) {
          console.error('[scenario-value-flush]', {
            dirtyKeyCount: flush.dirtyKeyCount,
            persistSucceededCount: flush.persistSucceededCount,
            persistFailedCount: flush.persistFailedCount,
            rerunBlocked: true,
          });
          return;
        }
      }
      const result = await runsProxy.rerun(run.jobId, 'all', issueKey || undefined, checklistUrl || undefined);
      if (result?.jobId) {
        // Preserve issueKey/checklistUrl from rerun response or current state
        const newIssueKey = (result as any).issueKey || issueKey;
        const newChecklistUrl = (result as any).checklistUrl || checklistUrl;
        // Reset state for new run
        setProgress(0);
        setRequested(0);
        setCompleted(0);
        setExecuted(0);
        setPassed(0);
        setFailed(0);
        setSkipped(0);
        setPassRate(null);
        setCurrentTestName('');
        setActiveScenario(null);
        setLogs([]);
        setJobStatus('queued');
        setChecklistUrl(newChecklistUrl);
        setIssueKey(newIssueKey);
        setDefectCount(0);
        setDocumentReady(false);
        setDocumentState('idle');
        setDocxError(null);
        setDownloadingDocx(false);
        terminalReceivedAtRef.current = null;
        lastStatusRef.current = null;
        documentPollAttemptsRef.current = 0;
        setElapsed(0);
        // Update run with new jobId so SSE reconnects
        setCurrentJobId(result.jobId as string);
        const updatedRun = { ...run, jobId: result.jobId, status: 'queued', progress: 0, completed: 0, passed: 0, failed: 0, currentTest: '' };
        Object.assign(run, updatedRun);
        // Force re-mount SSE by toggling key
        setRerunKey(prev => prev + 1);
      } else {
        console.error('[rerun] failed: no jobId in response');
      }
    } catch (err) {
      console.error('[rerun] error:', err);
    } finally {
      setRerunning(false);
    }
  };

  const syncElapsed = (data?: LiveExecutionStatusLike | null, now?: number) => {
    const elapsedSeconds = getLiveExecutionElapsedSeconds(run, data ?? lastStatusRef.current ?? undefined, now);
    setElapsed(elapsedSeconds);
  };

  const startTimer = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setInterval(() => {
      syncElapsed();
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      console.debug(`[live-execution] timer stopped jobId=${currentJobId || run?.jobId || run?.id}`);
    }
  };

  const stopDocumentPolling = () => {
    if (documentPollTimerRef.current !== null) {
      window.clearTimeout(documentPollTimerRef.current);
      documentPollTimerRef.current = null;
    }
    documentPollingJobIdRef.current = null;
  };

  const startDocumentPolling = (jobId: string) => {
    if (!jobId || activeJobIdRef.current !== jobId) return;
    if (documentPollingJobIdRef.current === jobId) return;
    stopDocumentPolling();
    documentPollingJobIdRef.current = jobId;
    documentPollAttemptsRef.current = 0;
    void pollEvidenceDocumentStatus(jobId);
  };

  const setProgressSnapshot = (snapshot: LiveExecutionStatusLike) => {
    const summary = snapshot.summary && typeof snapshot.summary === 'object'
      ? (snapshot.summary as Record<string, unknown>)
      : undefined;
    const numeric = (value: unknown): number | undefined => (
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined
    );
    const passRateNumeric = (value: unknown): number | null | undefined => {
      if (value === null) return null;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.min(100, value));
      }
      return undefined;
    };

    const incomingRequested = numeric(snapshot.requested) ?? numeric(summary?.requested);
    const incomingTotal = numeric(snapshot.total)
      ?? numeric(summary?.total)
      ?? numeric(summary?.totalStories)
      ?? numeric(summary?.scenarioCount);
    const nextRequested = incomingRequested != null
      ? Math.max(requestedRef.current, incomingRequested)
      : requestedRef.current;
    const nextTotal = incomingTotal != null
      ? Math.max(totalRef.current, incomingTotal)
      : (nextRequested > 0 ? Math.max(totalRef.current, nextRequested) : totalRef.current);
    const nextCompletedRaw = numeric(snapshot.completed) ?? numeric(summary?.completed) ?? completedRef.current;
    const completionBound = nextRequested > 0 ? nextRequested : nextTotal;
    const nextCompleted = completionBound > 0
      ? Math.min(completionBound, Math.max(completedRef.current, nextCompletedRaw))
      : Math.max(completedRef.current, nextCompletedRaw);
    const nextPassedRaw = numeric(snapshot.passed) ?? numeric(summary?.passed) ?? passedRef.current;
    const nextFailedRaw = numeric(snapshot.failed) ?? numeric(summary?.failed) ?? failedRef.current;
    const nextPassed = Math.max(passedRef.current, nextPassedRaw);
    const nextFailed = Math.max(failedRef.current, nextFailedRaw);
    const nextSkippedRaw = numeric(snapshot.skipped) ?? numeric(summary?.skipped) ?? skippedRef.current;
    const nextSkipped = Math.max(skippedRef.current, nextSkippedRaw);
    const nextExecutedRaw = numeric(snapshot.executed) ?? numeric(summary?.executed) ?? (nextPassed + nextFailed);
    const nextExecuted = Math.max(executedRef.current, nextExecutedRaw);
    const incomingPassRate = passRateNumeric(snapshot.passRate) ?? passRateNumeric(summary?.passRate);
    const nextPassRate = incomingPassRate !== undefined
      ? incomingPassRate
      : (nextExecuted > 0 ? Math.max(0, Math.min(100, Math.round((nextPassed / nextExecuted) * 100))) : null);
    const nextProgress = resolveProgressPercent({
      previousProgress: progressRef.current,
      completed: nextCompleted,
      total: completionBound,
      backendProgress: numeric(snapshot.progressPercent)
        ?? numeric(summary?.progressPercent)
        ?? numeric(snapshot.progress)
        ?? numeric(summary?.progress),
    });

    requestedRef.current = nextRequested;
    totalRef.current = nextTotal;
    completedRef.current = nextCompleted;
    executedRef.current = nextExecuted;
    passedRef.current = nextPassed;
    failedRef.current = nextFailed;
    skippedRef.current = nextSkipped;
    passRateRef.current = nextPassRate;
    progressRef.current = nextProgress;

    setRequested(nextRequested);
    setTotal(nextTotal);
    setCompleted(nextCompleted);
    setExecuted(nextExecuted);
    setPassed(nextPassed);
    setFailed(nextFailed);
    setSkipped(nextSkipped);
    setPassRate(nextPassRate);
    setProgress(nextProgress);
  };

  const pollEvidenceDocumentStatus = async (jobId: string) => {
    if (!jobId || activeJobIdRef.current !== jobId) return;
    documentPollAttemptsRef.current += 1;
    try {
      const probe = await runsProxy.getEvidenceDocumentStatus(jobId);
      if (activeJobIdRef.current !== jobId) return;
      const probeStatus = probe.status?.trim().toLowerCase();
      const probeReady = probe.documentReady === true || probe.ready === true || probeStatus === 'ready';
      const isMissingJob = probe.reasonCode === 'job_not_found' || probeStatus === 'not_found';
      if (isMissingJob || probe.statusCode === 404) {
        setDocumentReady(false);
        setDocumentState('failed');
        setDocxError('No se encontró la ejecución para generar el documento.');
        stopDocumentPolling();
        return;
      }
      const resolution = resolveDocumentAvailabilityState({
        ready: probeReady,
        state: probeStatus ?? probe.state,
        statusCode: probe.statusCode,
        attempt: documentPollAttemptsRef.current,
        maxAttempts: DOC_STATUS_MAX_ATTEMPTS,
      });

      setDocumentState(resolution.state);
      if (resolution.state === 'ready') {
        setDocumentReady(true);
        setDocxError(null);
        stopDocumentPolling();
        return;
      }
      if (resolution.state === 'failed') {
        setDocumentReady(false);
        setDocxError('No se pudo preparar el documento.');
        stopDocumentPolling();
        return;
      }
      if (resolution.state === 'unavailable') {
        setDocumentReady(false);
        setDocxError('Documento no disponible para esta ejecución.');
        stopDocumentPolling();
        return;
      }
      if (resolution.continuePolling) {
        documentPollTimerRef.current = window.setTimeout(() => {
          void pollEvidenceDocumentStatus(jobId);
        }, DOC_STATUS_POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (activeJobIdRef.current !== jobId) return;
      setDocumentReady(false);
      setDocumentState('failed');
      setDocxError('No se pudo verificar el estado del documento.');
      stopDocumentPolling();
    }
  };

  // Keep active job id ref in sync to ignore stale async callbacks
  useEffect(() => {
    activeJobIdRef.current = currentJobId;
  }, [currentJobId]);

  useEffect(() => {
    requestedRef.current = requested;
    totalRef.current = total;
    completedRef.current = completed;
    executedRef.current = executed;
    passedRef.current = passed;
    failedRef.current = failed;
    skippedRef.current = skipped;
    passRateRef.current = passRate;
    progressRef.current = progress;
  }, [requested, total, completed, executed, passed, failed, skipped, passRate, progress]);

  // Reset job-scoped states when job changes
  useEffect(() => {
    const nextJobId = run?.jobId || run?.id || '';
    if (!shouldResetDocumentStateForJob(currentJobId, nextJobId)) return;
    stopDocumentPolling();
    setCurrentJobId(nextJobId);
    setDocumentReady(false);
    setDocumentState('idle');
    setDocxError(null);
    setDownloadingDocx(false);
    setChecklistUrl(run?.checklistUrl ?? null);
    setActiveScenario(null);
    setIssueKey(run?.issueKey ?? null);
    setDefectCount(typeof run?.defectCount === 'number' ? run.defectCount : 0);
    setLogs([]);
    terminalReceivedAtRef.current = null;
    lastStatusRef.current = null;
    documentPollAttemptsRef.current = 0;
    progressRef.current = 0;
    requestedRef.current = 0;
    totalRef.current = 0;
    completedRef.current = 0;
    executedRef.current = 0;
    passedRef.current = 0;
    failedRef.current = 0;
    skippedRef.current = 0;
    passRateRef.current = null;
    setProgress(0);
    setRequested(0);
    setTotal(0);
    setCompleted(0);
    setExecuted(0);
    setPassed(0);
    setFailed(0);
    setSkipped(0);
    setPassRate(null);
    stopTimer();
    syncElapsed(undefined, Date.now());
  }, [run?.jobId, run?.id, currentJobId]);

  // Timer orchestration based on status
  useEffect(() => {
    if (!currentJobId) return;
    syncElapsed(undefined, Date.now());
    if (isDone || !isActiveRunStatus(jobStatus)) {
      stopTimer();
      return () => stopTimer();
    }
    startTimer();
    return () => stopTimer();
  }, [currentJobId, jobStatus, run?.startedAt, isDone]);

  useEffect(() => () => {
    stopTimer();
    stopDocumentPolling();
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Consumir stream SSE
  useEffect(() => {
    const streamJobId = currentJobId || run?.jobId;
    if (!streamJobId) return;
    let statusPollTimer: number | null = null;

    // Mobile: el backend reporta passed/failed a nivel PASO en su summary, así que
    // ignoramos esos contadores y los derivamos a nivel ESCENARIO parseando los logs
    // (ver ./mobile-progress). El total lo aporta run.total (conteo de escenarios).
    const isMobile = run?.runType === 'mobile';
    const mobileTotal = run?.total ?? 0;
    const mobileState = createMobileProgressState();
    if (isMobile && mobileTotal > 0) setTotal(mobileTotal);

    const applyStatus = (data: any) => {
      if (activeJobIdRef.current !== streamJobId) return;
      // A case lifecycle event has a case-level `status` (for example, failed),
      // which must never be interpreted as the status of the whole queued job.
      // Handle it before terminal-status filtering so the next case can become
      // active immediately after the previous case finishes.
      if (data?.type === 'case_started') {
        let nextScenario = resolveActiveScenarioUpdate(data);
        if (nextScenario) {
          const queueMatch = run?.activeScenarios?.find((scenario) =>
            scenario.id === nextScenario?.id || scenario.title === nextScenario?.title,
          ) ?? run?.activeScenarios?.[Math.max(0, nextScenario.index - 1)];
          if (queueMatch) {
            nextScenario = {
              ...nextScenario,
              steps: nextScenario.steps.length ? nextScenario.steps : queueMatch.steps,
              index: nextScenario.index || queueMatch.index,
              total: nextScenario.total || queueMatch.total,
              currentStepIndex: nextScenario.currentStepIndex ?? 0,
            };
          }
          setCurrentTestName(nextScenario.title);
          setActiveScenario(nextScenario);
          setStreamError(null);
        }
        return;
      }
      if (data?.type === 'case_finished') {
        setActiveScenario(previous => finishActiveScenario(previous, data));
        return;
      }

      let stableStatus = data as LiveExecutionStatusLike;
      if (isTerminalStatus(stableStatus.status)) {
        if (!terminalReceivedAtRef.current) {
          terminalReceivedAtRef.current = new Date().toISOString();
        }
        stableStatus = withStableTerminalTimestamp(stableStatus, terminalReceivedAtRef.current) ?? stableStatus;
      }
      const previousStatus = lastStatusRef.current?.status;
      if (isTerminalStatus(previousStatus) && !isTerminalStatus(stableStatus.status)) {
        return;
      }
      lastStatusRef.current = stableStatus;
      // Mobile reporta passed/failed por paso; mantenemos contadores derivados de logs.
      if (!isMobile) {
        setProgressSnapshot(stableStatus);
      }
      if (stableStatus.currentTest) setCurrentTestName(stableStatus.currentTest);
      const activeScenarioUpdate = resolveActiveScenarioUpdate(data);
      if (activeScenarioUpdate && activeScenarioUpdate !== undefined) {
        setActiveScenario(previous => previous?.id === activeScenarioUpdate.id
          ? {
              ...activeScenarioUpdate,
              steps: activeScenarioUpdate.steps.length ? activeScenarioUpdate.steps : previous.steps,
              stepResults: activeScenarioUpdate.stepResults?.length ? activeScenarioUpdate.stepResults : previous.stepResults,
              currentStepIndex: activeScenarioUpdate.currentStepIndex
                ?? (activeScenarioUpdate.stepResults?.length ? undefined : previous.currentStepIndex),
              status: activeScenarioUpdate.status ?? previous.status,
            }
          : activeScenarioUpdate);
      } else if (activeScenarioUpdate === null && !isTerminalStatus(stableStatus.status)) {
        // Retain the completed case until the next case_started event.
      } else if (isTerminalStatus(stableStatus.status)) {
        setActiveScenario(previous => previous);
      }
      if (stableStatus.status)      setJobStatus(stableStatus.status);
      if (data.checklistUrl)        setChecklistUrl(data.checklistUrl);
      if (data.issueKey)            setIssueKey(data.issueKey);
      if (typeof data.defectCount === 'number') setDefectCount(data.defectCount);
      if (canEnableDocumentDownload(stableStatus.status, stableStatus)) {
        setDocumentReady(true);
        setDocumentState('ready');
        setDocxError(null);
        stopDocumentPolling();
      } else if (isTerminalStatus(stableStatus.status)) {
        setDocumentReady(false);
        setDocumentState('preparing');
        setDocxError(null);
        startDocumentPolling(streamJobId);
      }
      if (isTerminalStatus(stableStatus.status)) {
        syncElapsed(stableStatus);
        console.debug(`[live-execution] terminal status received status=${stableStatus.status} durationMs=${computeLiveExecutionElapsedMs(run, stableStatus)}`);
        stopTimer();
      }
    };

    const stopRunStatusPolling = () => {
      if (statusPollTimer != null) {
        window.clearTimeout(statusPollTimer);
        statusPollTimer = null;
      }
    };

    const shouldContinueRunStatusPolling = (statusLike?: LiveExecutionStatusLike): boolean => {
      const latestStatus = statusLike?.status ?? lastStatusRef.current?.status ?? jobStatus;
      if (isTerminalStatus(latestStatus)) return false;
      const hasPendingCases = requestedRef.current > 0 && completedRef.current < requestedRef.current;
      return hasPendingCases || isActiveRunStatus(latestStatus);
    };

    function scheduleRunStatusPolling() {
      if (statusPollTimer != null) return;
      statusPollTimer = window.setTimeout(() => {
        statusPollTimer = null;
        void pollRunStatus();
      }, RUN_STATUS_POLL_INTERVAL_MS);
    }

    async function pollRunStatus() {
      if (activeJobIdRef.current !== streamJobId) return;
      try {
        const statusData = await runsProxy.getJob(streamJobId);
        if (activeJobIdRef.current !== streamJobId) return;
        setStreamError(null);
        applyStatus(statusData as LiveExecutionStatusLike);
      } catch {
        // Ignore transient polling errors; stream keeps primary real-time channel.
      } finally {
        if (activeJobIdRef.current !== streamJobId) return;
        if (shouldContinueRunStatusPolling()) scheduleRunStatusPolling();
        else stopRunStatusPolling();
      }
    }

    // Initial snapshot for issue metadata + partial counters.
    void runsProxy.getJob(streamJobId).then(data => {
      if (activeJobIdRef.current !== streamJobId) return;
      applyStatus(data as LiveExecutionStatusLike);
      if (shouldContinueRunStatusPolling(data as LiveExecutionStatusLike)) {
        scheduleRunStatusPolling();
      }
    }).catch(() => {
      if (activeJobIdRef.current !== streamJobId) return;
      if (shouldContinueRunStatusPolling()) {
        scheduleRunStatusPolling();
      }
    });

    const cleanup = runsProxy.streamLogs(streamJobId, {
      onLog: entry => {
        if (activeJobIdRef.current !== streamJobId) return;
        setLogs(prev => [...prev, {
          time: entry.timestamp ?? formatNow(),
          type: mapLevel(entry.level),
          msg:  entry.message,
        }]);
        const trimmedMessage = entry.message.trim();
        const jsonStart = trimmedMessage.indexOf('{');
        const jsonEnd = trimmedMessage.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try {
            const lifecycleEvent = JSON.parse(trimmedMessage.slice(jsonStart, jsonEnd + 1));
            if (lifecycleEvent?.type === 'case_started' || lifecycleEvent?.type === 'case_finished') {
              applyStatus(lifecycleEvent);
            }
          } catch {
            // Ordinary log text can begin with a brace; only structured lifecycle JSON matters.
          }
        }
        const scenarioProgress = parseLiveScenarioProgress(entry.message);
        if (scenarioProgress) setActiveScenario(previous => applyLiveScenarioProgress(previous, scenarioProgress));
        if (isMobile) {
          const counters = reduceMobileProgress(mobileState, entry.message, mobileTotal);
          if (counters) {
            setPassed(counters.passed);
            setFailed(counters.failed);
            setCompleted(counters.completed);
            setProgress(counters.progress);
            setExecuted(counters.passed + counters.failed);
            setPassRate((counters.passed + counters.failed) > 0
              ? Math.round((counters.passed / (counters.passed + counters.failed)) * 100)
              : null);
            setCurrentTestName(counters.currentTest);
          }
        }
      },
      onStatus: applyStatus,
      onDone: data => {
        if (activeJobIdRef.current !== streamJobId) return;
        stopRunStatusPolling();
        applyStatus(data);
        const finalStatus = data.status || 'completed';
        setJobStatus(finalStatus);
        if (isMobile) {
          const mobileFinal = computeMobileCounters(mobileState, mobileTotal);
          setPassed(mobileFinal.passed);
          setFailed(mobileFinal.failed);
          setCompleted(mobileFinal.completed);
          setProgress(mobileFinal.progress);
          const mobileExecuted = mobileFinal.passed + mobileFinal.failed;
          setExecuted(mobileExecuted);
          setPassRate(mobileExecuted > 0 ? Math.round((mobileFinal.passed / mobileExecuted) * 100) : null);
          if (mobileTotal > 0) setTotal(mobileTotal);
        } else if (data.progress == null) {
          setProgress(100);
        }
        const mobileFinal = computeMobileCounters(mobileState, mobileTotal);
        const finalPassed = isMobile ? mobileFinal.passed : (data.passed ?? passedRef.current);
        const finalFailed = isMobile ? mobileFinal.failed : (data.failed ?? failedRef.current);
        const finalMessage = isSuccessTerminalStatus(finalStatus)
          ? `✔ Ejecución completada · ${finalPassed} pasaron · ${finalFailed} fallaron`
          : getTerminalUserMessage(finalStatus).text;
        setLogs(prev => [...prev, {
          time: formatNow(),
          type: isSuccessTerminalStatus(finalStatus)
            ? 'success'
            : isErrorTerminalStatus(finalStatus)
              ? 'error'
              : 'info',
          msg: finalMessage,
        }]);
        setTimeout(() => onCompleteRef.current?.(), 1500);
      },
      onError: err => setStreamError(err.message),
    });

    return () => {
      cleanup();
      stopDocumentPolling();
      stopRunStatusPolling();
    };
  }, [currentJobId, rerunKey]);

  const eta = total > 0 && progress > 0
    ? Math.max(0, Math.round(((100 - progress) / progress) * elapsed))
    : 0;

  return (
    <div className="p-7 min-h-full" style={{ background: C.canvas }}>
      <div className="max-w-6xl mx-auto">

        {/* ΓöÇΓöÇ Topbar ΓöÇΓöÇ */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="text-[11px] text-[#58646D] hover:text-[#104B99] flex items-center gap-1 transition">
            <ChevronLeft size={12} /> Volver al dashboard
          </button>
          <div className="flex items-center gap-2">
            {isDone ? (
              <>
                <button
                  onClick={openReportPreview}
                  disabled={!canDownloadDocument || reportPreviewLoading}
                  className="text-[11px] border border-[#E8EBEC] bg-white px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reportPreviewLoading ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} Ver reporte
                </button>
                <button
                  onClick={async () => {
                    setDownloadingDocx(true);
                    setDocxError(null);
                    try { await runsProxy.downloadEvidence(currentJobId); }
                    catch { setDocxError("El documento de evidencia aun no esta disponible."); }
                    finally { setDownloadingDocx(false); }
                  }}
                  disabled={downloadingDocx || !canDownloadDocument}
                  className="text-[11px] border border-[#E8EBEC] bg-white px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D] disabled:opacity-50"
                >
                  {downloadingDocx ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  Descargar documento
                </button>
                {isSuccessDone && documentState === 'preparing' && !documentReady && (
                  <span className="text-[10px] text-[#58646D] bg-[#FAFAF7] px-2 py-1 rounded-full">Preparando documento...</span>
                )}
                {docxError && (
                  <span className="text-[10px] text-[#E63946] bg-[#E63946]/5 px-2 py-1 rounded-full">{docxError}</span>
                )}
                <button
                  onClick={() => onCloseExecution?.({ id: run?.jobId || run?.id, project: run?.project, total, passed, failed, duration: formatTime(elapsed) })}
                  className="text-[11px] bg-gradient-to-r from-[#48A157] to-[#357a42] text-white px-4 py-1.5 rounded-full flex items-center gap-1.5 font-semibold shadow-lg shadow-[#48A157]/20 hover:from-[#5EC470] hover:to-[#48A157]"
                >
                  <Lock size={11} /> Ejecutar cierre
                </button>
              </>
            ) : (
              <>
                <button className="text-[11px] border border-[#E8EBEC] bg-white px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D]">
                  <Pause size={11} /> Pausar
                </button>
                <button className="text-[11px] border border-[#E63946]/30 bg-white text-[#E63946] px-3 py-1.5 rounded-full hover:bg-[#E63946]/5 flex items-center gap-1.5 font-medium">
                  <Square size={10} fill="currentColor" /> Detener
                </button>
              </>
            )}
          </div>
        </div>

        {/* ΓöÇΓöÇ Status hero card ΓöÇΓöÇ */}
        <BentoCard className="!p-0 overflow-hidden mb-4">
          <div className={cn(
            'relative p-7 text-white transition-all duration-700',
            isFailed
              ? 'bg-gradient-to-br from-[#7f1d1d] via-[#991b1b] to-[#7f1d1d]'
              : isDone
                ? 'bg-gradient-to-br from-[#357a42] via-[#48A157] to-[#5EC470]'
                : 'bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547]',
          )}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 70% 30%, ${isDone ? '#ffffff' : C.green}50 0%, transparent 50%)` }} />
            <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
            <div className="absolute right-20 top-20 w-16 h-16 rounded-full border border-white/10" />

            <div className="relative">
              {/* Estado */}
              <div className="flex items-center gap-2 mb-2">
                {isDone ? (
                  <>
                    {isFailed
                      ? <AlertCircle size={14} className="text-[#FFB4B4]" />
                      : <CheckCircle2 size={14} className="text-white" />}
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">
                      {isFailed ? 'EJECUCIÓN FALLIDA' : isCancelled ? 'EJECUCIÓN CANCELADA' : 'EJECUCIÓN COMPLETADA'}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-[#5EC470]" />
                      <div className="absolute inset-0 rounded-full bg-[#5EC470] animate-ping" />
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">
                      Ejecución en curso · {run?.jobId || run?.id}
                    </span>
                  </>
                )}
              </div>

              <h2 className="text-[36px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                {run?.project || 'Proyecto'}
              </h2>
              <div className="text-[12px] text-white/60 mt-2 font-mono">
                Disparado por {run?.triggered || 'Carlos M.'} · iniciado {run?.startedAt || 'hace 0m'}
              </div>

              {/* Barra de progreso */}
              <div className="mt-7 mb-2">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60 mb-1">Progreso</div>
                    <div className="text-[56px] font-medium leading-none" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.04em' }}>
                      {Math.round(progress)}<span className="text-[24px] text-white/60 ml-1">%</span>
                    </div>
                  </div>
                  {!isDone && eta > 0 && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-white/60">ETA</div>
                      <div className="text-[20px] font-medium font-mono mt-0.5">{Math.floor(eta / 60)}m {eta % 60}s</div>
                    </div>
                  )}
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full relative overflow-hidden transition-all duration-700"
                    style={{
                      width: `${progress}%`,
                      background: isFailed
                        ? 'rgba(255,100,100,0.8)'
                        : isDone
                          ? 'rgba(255,255,255,0.9)'
                          : `linear-gradient(90deg, ${C.green}, #5EC470)`,
                    }}
                  >
                    {!isDone && (
                      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', animation: 'shimmer 1.8s linear infinite' }} />
                    )}
                  </div>
                </div>
              </div>

              {/* Contadores */}
              <div className={LIVE_EXECUTION_BANNER_GRID_CLASS}>
                {bannerMetrics.map((metric) => (
                  <div key={metric.id}>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">{metric.label}</div>
                    <div className={cn('text-[24px] font-medium mt-1 font-mono', metric.valueClassName)}>
                      {metric.value}
                      {typeof metric.total === 'number' && (
                        <span className="text-[12px] text-white/50">/{metric.total}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BentoCard>

        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* ΓöÇΓöÇ Test en curso ΓöÇΓöÇ */}
          <BentoCard className="col-span-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-[#104B99]/10 flex items-center justify-center">
                {isDone
                  ? <CheckCircle2 size={13} className={isFailed ? 'text-[#E63946]' : 'text-[#48A157]'} />
                  : <Loader2 size={13} className="text-[#104B99] animate-spin" />}
              </div>
              <div title={!isDone && activeScenario ? activeScenario.title : undefined} className={cn(
                "min-w-0 truncate font-semibold",
                !isDone && activeScenario && "text-[13px] text-[#1a1f2e]",
                !isDone && !activeScenario && "text-[10px] uppercase tracking-[0.15em] text-[#8B999D]",
                isDone && finalUserMessage.tone === 'success' && "text-[#48A157]",
                isDone && finalUserMessage.tone === 'error' && "text-[#E63946]",
                isDone && finalUserMessage.tone === 'neutral' && "text-[#58646D]",
              )}>
                {isDone
                  ? finalUserMessage.text
                  : activeScenario ? `Ejecutándose ahora · ${activeScenario.title}` : 'Ejecutándose ahora'}
              </div>
            </div>

            {/* Show only the current step; the case title lives in the one-line header above. */}
             {activeScenario && (
               <div className="border-t border-[#E8ECEE] pt-2.5 text-[12px] text-[#58646D]">
                   <div className="text-[9px] uppercase tracking-[0.14em] font-semibold text-[#8B999D] mb-1.5">
                     {activeScenario.phase === 'promoting'
                       ? `Promoviendo spec · ${activeScenario.steps.length} de ${activeScenario.steps.length}`
                       : `Paso actual${currentScenarioStepIndex >= 0 ? ` · ${currentScenarioStepIndex + 1} de ${activeScenario.steps.length}` : ''}`}
                   </div>
                   {currentScenarioStep && (
                     <div key={`${activeScenario.id}-${currentScenarioStepIndex}`} className="flex items-start gap-2 leading-5 transition-opacity duration-300 animate-[live-step-enter_220ms_ease-out]">
                       {(() => {
                       const state = getScenarioStepState(activeScenario.stepResults, currentScenarioStepIndex);
                       const marker = state === 'completed' ? '✓' : state === 'failed' ? '✕' : state === 'running' ? '●' : '○';
                       const markerClass = state === 'completed' ? 'text-[#48A157]' : state === 'failed' ? 'text-[#E63946]' : state === 'running' ? 'text-[#104B99]' : 'text-[#AAB4B8]';
                       return <><span className={cn('w-3 shrink-0 text-center font-semibold', markerClass)}>{marker}</span><span>{currentScenarioStep}</span></>;
                       })()}
               </div>
                   )}
                   {!currentScenarioStep && !isDone && (
                     <div className="text-[11px] text-[#8B999D]">Esperando el siguiente paso…</div>
                   )}
                  </div>
             )}
            {!activeScenario && (
              <div>
                <div className="text-[16px] font-medium text-[#1a1f2e]">{currentTestName || 'Preparando el primer escenario…'}</div>
                <div className="text-[13px] text-[#8B999D] mt-1">Esperando que inicie el caso para mostrar sus pasos.</div>
              </div>
            )}

            {/* When done: show title + optional checklist button */}
            {isDone && (() => {
              const visible = shouldShowDefectChecklistButton({
                failed,
                defectCount,
                checklistUrl,
                issueKey,
              });
              console.log(`[live-checklist-visibility] status=${jobStatus} failed=${failed} checklistUrl=${Boolean(checklistUrl)} issueKey=${Boolean(issueKey)} finished=${true} visible=${visible}`);
              if (!visible) return null;
               // Mobile ejecución real: el runId canónico ES el execution job id actual
               // (el mismo que se muestra como job://<id> en LiveExecution y con el que el
               // backend etiqueta los defectos: defect.runId). Usamos ese id para abrir el
               // checklist filtrado por la ejecución actual, no los defectos históricos.
               const executionRunId = currentJobId || '';
               const checklistHasRunId = Boolean(checklistUrl && checklistUrl.includes('?runId='));
               const isMobileRun = run?.runType === 'mobile';
               let targetUrl: string;
               if (checklistHasRunId) {
                 // La respuesta backend ya trae ?runId=<mobileRunId>: conservarlo tal cual.
                 targetUrl = checklistUrl!;
               } else if (isMobileRun && executionRunId && issueKey) {
                 // Sin runId en checklistUrl pero con contexto de ejecución Mobile: reconstruir
                 // la URL con el execution job id canónico.
                 targetUrl = `/checklist/${encodeURIComponent(issueKey)}?runId=${encodeURIComponent(executionRunId)}`;
               } else {
                 // Sin contexto de una ejecución Mobile: navegación histórica del checklist.
                 targetUrl = checklistUrl || `/checklist/${encodeURIComponent(issueKey || '')}`;
               }
              return (
              <div>
                <div className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  Ejecución finalizada
                </div>
                <button
                  onClick={() => {
                    window.open(targetUrl, "_blank");
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black px-4 py-2 rounded-full transition"
                >
                  <FileText size={13} /> Ver checklist de defectos
                </button>
              </div>
              );
            })()}
            {streamError && (
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-[#E63946]">
                <AlertCircle size={12} /> Error de conexión: {streamError}
              </div>
            )}
          </BentoCard>

          {/* ΓöÇΓöÇ Distribución ΓöÇΓöÇ */}
          <BentoCard className="col-span-4 flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold mb-1">Resultados</div>
            <h3 className="text-[16px] font-medium text-[#1a1f2e] leading-tight mb-2" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Distribución</h3>
            <div className="flex-1 flex items-center justify-center relative my-2">
              <ResponsiveContainer width="100%" height={150}>
                <RadialBarChart
                  innerRadius="65%" outerRadius="100%"
                  data={[{ name: 'pass', value: functionalPassRate ?? 0, fill: C.green }]}
                  startAngle={90} endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: '#F4F1EA' } as any} dataKey="value" cornerRadius={20} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[24px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  {functionalPassRateLabel}
                </div>
                <div className="text-[9px] text-[#8B999D] uppercase tracking-wider mt-1">Pass rate</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-[#48A157]/5 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-[#48A157] uppercase tracking-wider font-semibold">Pass</div>
                <div className="text-[18px] font-medium text-[#48A157] mt-0.5 font-mono">{passed}</div>
              </div>
              <div className="bg-[#E63946]/5 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-[#E63946] uppercase tracking-wider font-semibold">Fail</div>
                <div className="text-[18px] font-medium text-[#E63946] mt-0.5 font-mono">{failed}</div>
              </div>
            </div>
          </BentoCard>

          {/* ΓöÇΓöÇ Rerun button (only when execution is done) ΓöÇΓöÇ */}
          {isDone && (
            <BentoCard className="col-span-12 !p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[13px] text-[#1a1f2e] font-medium">
                    ¿Deseas reejecutar los escenarios?
                  </div>
                  <div className="text-[11px] text-[#8B999D] mt-0.5">
                    Se usarán los mismos escenarios ya generados, sin volver a publicar casos en TestRail.
                  </div>
                </div>
                <button
                  onClick={handleRerun}
                  disabled={rerunning}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black disabled:opacity-50 px-4 py-2 rounded-full transition"
                >
                  {rerunning ? 'Reejecutando...' : 'Reejecutar escenarios'}
                </button>
              </div>
            </BentoCard>
          )}
        </div>

        {/* ΓöÇΓöÇ Terminal de logs ΓöÇΓöÇ */}
        <BentoCard className="!p-0 overflow-hidden">
          <div className="bg-[#1a1f2e] px-5 py-3 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2">
              <Terminal size={13} className="text-[#5EC470]" />
              <span className="text-[11px] font-mono text-white font-semibold">Live logs</span>
              <span className="text-[9px] text-white/40 font-mono ml-2">
                job://{run?.jobId || run?.id}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!isDone && (
                <span className="flex items-center gap-1 text-[9px] font-mono text-[#5EC470]/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5EC470] animate-pulse" /> stream
                </span>
              )}
              <span className="text-[9px] text-white/40 font-mono">{logs.length} eventos</span>
              <button
                type="button"
                title={logsCopied ? 'Copiado' : 'Copiar logs'}
                aria-label="Copiar logs"
                disabled={logs.length === 0}
                onClick={async () => {
                  const copied = await copyTextToClipboard(logs.map((log) => `${log.time} ${log.msg}`).join('\n'));
                  if (!copied) return;
                  setLogsCopied(true);
                  window.setTimeout(() => setLogsCopied(false), 1500);
                }}
                className="text-white/60 hover:text-white disabled:opacity-30 disabled:hover:text-white/60"
              >
                {logsCopied ? <Check size={12} className="text-[#5EC470]" /> : <Copy size={12} />}
              </button>
              <button className="text-white/60 hover:text-white"><Maximize2 size={12} /></button>
            </div>
          </div>
          <div className="bg-[#0d1119] p-5 font-mono text-[11px] max-h-[320px] overflow-y-auto">
            {logs.length === 0 && !isDone ? (
              <div className="flex items-center gap-2 text-white/40">
                <Loader2 size={12} className="animate-spin" />
                <span>Conectando al stream...</span>
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 py-0.5 hover:bg-white/[0.02] -mx-2 px-2 rounded">
                  <span className="text-white/30 select-none flex-shrink-0">{log.time}</span>
                  <span className={cn(
                    'flex-1',
                    log.type === 'success' && 'text-[#5EC470]',
                    log.type === 'error'   && 'text-[#FFB4B4]',
                    log.type === 'info'    && 'text-white/70',
                  )}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
            {!isDone && logs.length > 0 && (
              <div className="flex items-center gap-3 py-0.5 mt-1">
                <span className="text-white/30 select-none">{formatTime(elapsed)}</span>
                <span className="text-white/50 text-[10px] flex items-center gap-1.5">
                  {currentTestName || 'procesando...'}
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-[#5EC470] animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#5EC470] animate-pulse" style={{ animationDelay: '200ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#5EC470] animate-pulse" style={{ animationDelay: '400ms' }} />
                  </span>
                </span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </BentoCard>

      </div>
      {reportPreviewOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReportPreview();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-preview-title"
            className="flex h-[min(92vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[#E8EBEC] px-5 py-3">
              <div>
                <h2 id="report-preview-title" className="text-sm font-semibold text-[#1a1f2e]">Reporte de ejecución</h2>
                <p className="mt-0.5 text-[11px] text-[#8B999D]">Vista previa del PDF de evidencias</p>
              </div>
              <button
                type="button"
                onClick={closeReportPreview}
                aria-label="Cerrar vista previa del reporte"
                className="rounded-full p-2 text-[#58646D] transition hover:bg-[#F4F1EA] hover:text-[#1a1f2e]"
              >
                <X size={17} />
              </button>
            </header>
            <div className="min-h-0 flex-1 bg-[#F4F1EA]">
              {reportPreviewLoading && (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-[#58646D]">
                  <Loader2 size={16} className="animate-spin" /> Cargando PDF...
                </div>
              )}
              {reportPreviewError && (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#B4463C]">
                  No se pudo mostrar el PDF: {reportPreviewError}
                </div>
              )}
              {reportPreviewUrl && !reportPreviewLoading && (
                <iframe title="Vista previa del PDF de evidencias" src={reportPreviewUrl} className="h-full w-full border-0" />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
