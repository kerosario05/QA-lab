import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, FileText, Lock, Pause, Square, CheckCircle2,
  Loader2, Terminal, Maximize2, AlertCircle, Download,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar,
  PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { runsProxy } from '../../services/runs';
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
  resolveProgressPercent,
  resolveDocumentAvailabilityState,
  getTerminalUserMessage,
  shouldResetDocumentStateForJob,
  withStableTerminalTimestamp,
  type EvidenceDocumentAvailability,
  type LiveExecutionStatusLike,
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

export function LiveExecutionScreen({ run, onClose, onComplete, onCloseExecution, onOpenChecklist }: LiveExecutionScreenProps) {
  const [progress,        setProgress]        = useState(run?.progress ?? 0);
  const [total,           setTotal]           = useState(run?.total ?? 0);
  const [completed,       setCompleted]       = useState(run?.completed ?? 0);
  const [passed,          setPassed]          = useState(run?.passed ?? 0);
  const [failed,          setFailed]          = useState(run?.failed ?? 0);
  const [currentTestName, setCurrentTestName] = useState(run?.currentTest || '');
  const [jobStatus,       setJobStatus]       = useState(run?.status || 'queued');
  const [logs,            setLogs]            = useState<DisplayLog[]>([]);
  const [streamError,     setStreamError]     = useState<string | null>(null);
  const [elapsed,         setElapsed]         = useState(0);
  const [currentJobId,    setCurrentJobId]    = useState(run?.jobId || run?.id || '');
  const [checklistUrl,    setChecklistUrl]    = useState<string | null>(null);
  const [issueKey,        setIssueKey]        = useState<string | null>(run?.issueKey ?? null);
  const [defectCount,     setDefectCount]     = useState<number>(0);
  const [rerunning,       setRerunning]        = useState(false);
  const [downloadingDocx,  setDownloadingDocx]  = useState(false);
  const [docxError,      setDocxError]      = useState<string | null>(null);
  const [documentReady,  setDocumentReady]  = useState(false);
  const [documentState,  setDocumentState]  = useState<EvidenceDocumentAvailability>('idle');
  const [rerunKey,        setRerunKey]          = useState(0);

  const logsEndRef   = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const lastStatusRef = useRef<LiveExecutionStatusLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const documentPollTimerRef = useRef<number | null>(null);
  const documentPollingJobIdRef = useRef<string | null>(null);
  const documentPollAttemptsRef = useRef(0);
  const terminalReceivedAtRef = useRef<string | null>(null);
  const activeJobIdRef = useRef(currentJobId);
  const totalRef = useRef(total);
  const completedRef = useRef(completed);
  const passedRef = useRef(passed);
  const failedRef = useRef(failed);
  const progressRef = useRef(progress);

  const isDone = isTerminalStatus(jobStatus);
  const isFailed = isErrorTerminalStatus(jobStatus);
  const isSuccessDone = isSuccessTerminalStatus(jobStatus);
  const isCancelled = isCancelledStatus(jobStatus);
  const finalUserMessage = getTerminalUserMessage(jobStatus);
  const canDownloadDocument = isTerminalStatus(jobStatus) && documentReady && Boolean(currentJobId);

  const handleRerun = async () => {
    if (!run?.jobId || rerunning) return;
    setRerunning(true);
    try {
      const result = await runsProxy.rerun(run.jobId, 'all', issueKey || undefined, checklistUrl || undefined);
      if (result?.jobId) {
        // Preserve issueKey/checklistUrl from rerun response or current state
        const newIssueKey = (result as any).issueKey || issueKey;
        const newChecklistUrl = (result as any).checklistUrl || checklistUrl;
        // Reset state for new run
        setProgress(0);
        setCompleted(0);
        setPassed(0);
        setFailed(0);
        setCurrentTestName('');
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
    const incomingTotal = typeof snapshot.total === 'number' ? Math.max(0, snapshot.total) : undefined;
    const nextTotal = incomingTotal != null
      ? Math.max(totalRef.current, incomingTotal)
      : totalRef.current;
    const nextCompletedRaw = typeof snapshot.completed === 'number' ? Math.max(0, snapshot.completed) : completedRef.current;
    const nextCompleted = nextTotal > 0
      ? Math.min(nextTotal, Math.max(completedRef.current, nextCompletedRaw))
      : Math.max(completedRef.current, nextCompletedRaw);
    const nextPassed = typeof snapshot.passed === 'number'
      ? Math.max(passedRef.current, Math.max(0, snapshot.passed))
      : passedRef.current;
    const nextFailed = typeof snapshot.failed === 'number'
      ? Math.max(failedRef.current, Math.max(0, snapshot.failed))
      : failedRef.current;
    const nextProgress = resolveProgressPercent({
      previousProgress: progressRef.current,
      completed: nextCompleted,
      total: nextTotal,
      backendProgress: typeof snapshot.progress === 'number' ? snapshot.progress : undefined,
    });

    totalRef.current = nextTotal;
    completedRef.current = nextCompleted;
    passedRef.current = nextPassed;
    failedRef.current = nextFailed;
    progressRef.current = nextProgress;

    setTotal(nextTotal);
    setCompleted(nextCompleted);
    setPassed(nextPassed);
    setFailed(nextFailed);
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
    totalRef.current = total;
    completedRef.current = completed;
    passedRef.current = passed;
    failedRef.current = failed;
    progressRef.current = progress;
  }, [total, completed, passed, failed, progress]);

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
    setLogs([]);
    terminalReceivedAtRef.current = null;
    lastStatusRef.current = null;
    documentPollAttemptsRef.current = 0;
    progressRef.current = 0;
    totalRef.current = 0;
    completedRef.current = 0;
    passedRef.current = 0;
    failedRef.current = 0;
    setProgress(0);
    setTotal(0);
    setCompleted(0);
    setPassed(0);
    setFailed(0);
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

    // Mobile: el backend reporta passed/failed a nivel PASO en su summary, así que
    // ignoramos esos contadores y los derivamos a nivel ESCENARIO parseando los logs
    // (ver ./mobile-progress). El total lo aporta run.total (conteo de escenarios).
    const isMobile = run?.runType === 'mobile';
    const mobileTotal = run?.total ?? 0;
    const mobileState = createMobileProgressState();
    if (isMobile && mobileTotal > 0) setTotal(mobileTotal);

    // Fetch job data to get issueKey and checklistUrl
    runsProxy.getJob(streamJobId).then(data => {
      if (activeJobIdRef.current !== streamJobId) return;
      if ((data as any).issueKey) setIssueKey((data as any).issueKey);
      if ((data as any).checklistUrl) setChecklistUrl((data as any).checklistUrl);
      if (typeof (data as any).defectCount === 'number') setDefectCount((data as any).defectCount);
      const stableData = withStableTerminalTimestamp(data as LiveExecutionStatusLike, terminalReceivedAtRef.current ?? undefined) ?? (data as LiveExecutionStatusLike);
      lastStatusRef.current = stableData;
      if (stableData.status) setJobStatus(stableData.status);
      if (stableData.currentTest) setCurrentTestName(stableData.currentTest);
      setProgressSnapshot(stableData);
      if (canEnableDocumentDownload(stableData.status, stableData)) {
        setDocumentReady(true);
        setDocumentState('ready');
        setDocxError(null);
        stopDocumentPolling();
      } else if (isTerminalStatus(stableData.status) && (isSuccessTerminalStatus(stableData.status) || isCancelledStatus(stableData.status))) {
        setDocumentReady(false);
        setDocumentState('preparing');
        setDocxError(null);
        startDocumentPolling(streamJobId);
      }
    }).catch(() => {});

    const applyStatus = (data: any) => {
      if (activeJobIdRef.current !== streamJobId) return;
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
      if (stableStatus.status)      setJobStatus(stableStatus.status);
      if (data.checklistUrl)        setChecklistUrl(data.checklistUrl);
      if (data.issueKey)            setIssueKey(data.issueKey);
      if (typeof data.defectCount === 'number') setDefectCount(data.defectCount);
      if (canEnableDocumentDownload(stableStatus.status, stableStatus)) {
        setDocumentReady(true);
        setDocumentState('ready');
        setDocxError(null);
        stopDocumentPolling();
      } else if (isTerminalStatus(stableStatus.status) && (isSuccessTerminalStatus(stableStatus.status) || isCancelledStatus(stableStatus.status))) {
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

    const cleanup = runsProxy.streamLogs(streamJobId, {
      onLog: entry => {
        if (activeJobIdRef.current !== streamJobId) return;
        setLogs(prev => [...prev, {
          time: entry.timestamp ?? formatNow(),
          type: mapLevel(entry.level),
          msg:  entry.message,
        }]);
        if (isMobile) {
          const counters = reduceMobileProgress(mobileState, entry.message, mobileTotal);
          if (counters) {
            setPassed(counters.passed);
            setFailed(counters.failed);
            setCompleted(counters.completed);
            setProgress(counters.progress);
            setCurrentTestName(counters.currentTest);
          }
        }
      },
      onStatus: applyStatus,
      onDone: data => {
        if (activeJobIdRef.current !== streamJobId) return;
        applyStatus(data);
        const finalStatus = data.status || 'completed';
        setJobStatus(finalStatus);
        if (isMobile) {
          const mobileFinal = computeMobileCounters(mobileState, mobileTotal);
          setPassed(mobileFinal.passed);
          setFailed(mobileFinal.failed);
          setCompleted(mobileFinal.completed);
          setProgress(mobileFinal.progress);
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
                <button className="text-[11px] border border-[#E8EBEC] bg-white px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D]">
                  <FileText size={11} /> Ver reporte
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
              <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/15">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Completados</div>
                  <div className="text-[24px] font-medium mt-1 font-mono">{completed}<span className="text-[12px] text-white/50">/{total}</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Exitosos</div>
                  <div className="text-[24px] font-medium mt-1 text-[#5EC470] font-mono">{passed}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Fallidos</div>
                  <div className="text-[24px] font-medium mt-1 text-[#FFB4B4] font-mono">{failed}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Tiempo</div>
                  <div className="text-[24px] font-medium mt-1 font-mono">{formatTime(elapsed)}</div>
                </div>
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
              <div className={cn(
                "text-[10px] uppercase tracking-[0.15em] font-semibold",
                !isDone && "text-[#8B999D]",
                isDone && finalUserMessage.tone === 'success' && "text-[#48A157]",
                isDone && finalUserMessage.tone === 'error' && "text-[#E63946]",
                isDone && finalUserMessage.tone === 'neutral' && "text-[#58646D]",
              )}>
                {isDone
                  ? finalUserMessage.text
                  : 'Ejecutándose ahora'}
              </div>
            </div>

            {/* During execution: show current test name */}
            {!isDone && currentTestName && (
              <div className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                {currentTestName}
              </div>
            )}
            {!isDone && !currentTestName && (
              <div className="text-[13px] text-[#8B999D]">
                Esperando primer caso...
              </div>
            )}

            {/* When done: show title + optional checklist button */}
            {isDone && (() => {
              const hasFailedCases = failed > 0 || defectCount > 0;
              const hasChecklist = Boolean(checklistUrl || issueKey);
              const visible = hasFailedCases && hasChecklist;
              console.log(`[live-checklist-visibility] status=${jobStatus} failed=${failed} checklistUrl=${Boolean(checklistUrl)} issueKey=${Boolean(issueKey)} finished=${true} visible=${visible}`);
              if (!visible) return null;
               const params = new URLSearchParams();
               // Mobile: los defectos se taggean con un jobId interno distinto al del launch,
               // así que abrimos el checklist por issueKey sin filtrar por jobId.
               if (currentJobId && !run?.checklistByIssueOnly) params.set('jobId', currentJobId);
               const qs = params.toString();
               const targetUrl = run?.checklistByIssueOnly
                 ? `/checklist/${encodeURIComponent(issueKey!)}`
                 : checklistUrl && !checklistUrl.includes('?jobId=')
                 ? `${checklistUrl}${checklistUrl.includes('?') ? '&' : '?'}${qs}`
                 : checklistUrl || `/checklist/${encodeURIComponent(issueKey!)}${qs ? `?${qs}` : ''}`;
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
                  data={[{ name: 'pass', value: completed > 0 ? (passed / completed) * 100 : 0, fill: C.green }]}
                  startAngle={90} endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: '#F4F1EA' } as any} dataKey="value" cornerRadius={20} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[24px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  {completed > 0 ? Math.round((passed / completed) * 100) : 0}<span className="text-[12px] text-[#8B999D]">%</span>
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
    </div>
  );
}