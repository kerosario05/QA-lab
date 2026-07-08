import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, FileText, Lock, Pause, Square, CheckCircle2,
  Loader2, Check, Terminal, Maximize2, AlertCircle,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar,
  PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { runsProxy } from '../../services/runs';
import type { ActiveRun } from '../../types';

interface LiveExecutionScreenProps {
  run: ActiveRun | null;
  onClose: () => void;
  onComplete?: () => void;
  onCloseExecution?: (execution: any) => void;
  onOpenChecklist?: (issueKey: string, jobId?: string) => void;
}

interface DisplayLog { time: string; type: string; msg: string; }

const DONE_STATUSES = new Set(['completed', 'failed', 'error', 'done']);

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
  const [completed,       setCompleted]       = useState(run?.completed ?? 0);
  const [passed,          setPassed]          = useState(run?.passed ?? 0);
  const [failed,          setFailed]          = useState(run?.failed ?? 0);
  const [currentTestName, setCurrentTestName] = useState(run?.currentTest || '');
  const [jobStatus,       setJobStatus]       = useState(run?.status || 'queued');
  const [logs,            setLogs]            = useState<DisplayLog[]>([]);
  const [streamError,     setStreamError]     = useState<string | null>(null);
  const [elapsed,         setElapsed]         = useState(0);
  const [checklistUrl,    setChecklistUrl]    = useState<string | null>(null);
  const [issueKey,        setIssueKey]        = useState<string | null>(null);
  const [defectCount,     setDefectCount]     = useState<number>(0);
  const [rerunning,       setRerunning]        = useState(false);
  const [rerunKey,        setRerunKey]          = useState(0);

  const logsEndRef   = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isDone   = DONE_STATUSES.has(jobStatus);
  const isFailed = jobStatus === 'failed' || jobStatus === 'error';
  const total    = run?.total || 0;

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
        // Update run with new jobId so SSE reconnects
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

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      console.debug(`[live-execution] timer stopped jobId=${run?.jobId || run?.id}`);
    }
  };

  // Wall-clock timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Consumir stream SSE
  useEffect(() => {
    if (!run?.jobId) return;

    // Fetch job data to get issueKey and checklistUrl
    runsProxy.getJob(run.jobId).then(data => {
      if ((data as any).issueKey) setIssueKey((data as any).issueKey);
      if ((data as any).checklistUrl) setChecklistUrl((data as any).checklistUrl);
      if (typeof (data as any).defectCount === 'number') setDefectCount((data as any).defectCount);
    }).catch(() => {});

    const applyStatus = (data: any) => {
      if (data.progress    != null) setProgress(data.progress);
      if (data.completed   != null) setCompleted(data.completed);
      if (data.passed      != null) setPassed(data.passed);
      if (data.failed      != null) setFailed(data.failed);
      if (data.currentTest)         setCurrentTestName(data.currentTest);
      if (data.status)              setJobStatus(data.status);
      if (data.checklistUrl)        setChecklistUrl(data.checklistUrl);
      if (data.issueKey)            setIssueKey(data.issueKey);
      if (typeof data.defectCount === 'number') setDefectCount(data.defectCount);
      if (isTerminalRunStatus(data.status)) {
        syncElapsed(data);
        console.debug(`[live-execution] terminal status received status=${data.status} durationMs=${computeLiveExecutionElapsedMs(run, data)}`);
        stopTimer();
      }
    };

    const cleanup = runsProxy.streamLogs(run.jobId, {
      onLog: entry => {
        setLogs(prev => [...prev, {
          time: entry.timestamp ?? formatNow(),
          type: mapLevel(entry.level),
          msg:  entry.message,
        }]);
      },
      onStatus: applyStatus,
      onDone: data => {
        applyStatus(data);
        const finalStatus = data.status || 'completed';
        setJobStatus(finalStatus);
        if (data.progress == null) setProgress(100);
        setLogs(prev => [...prev, {
          time: formatNow(),
          type: DONE_STATUSES.has(finalStatus) && finalStatus !== 'completed' ? 'error' : 'success',
          msg:  finalStatus === 'completed'
            ? `✓ Ejecución completada · ${data.passed ?? passed} pasaron · ${data.failed ?? failed} fallaron`
            : `✗ Ejecución terminada con estado: ${finalStatus}`,
        }]);
        setTimeout(() => onCompleteRef.current?.(), 1500);
      },
      onError: err => setStreamError(err.message),
    });

    return cleanup;
  }, [run?.jobId]);

  const eta = total > 0 && progress > 0
    ? Math.max(0, Math.round(((100 - progress) / progress) * elapsed))
    : 0;

  return (
    <div className="p-7 min-h-full" style={{ background: C.canvas }}>
      <div className="max-w-6xl mx-auto">

        {/* ── Topbar ── */}
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

        {/* ── Status hero card ── */}
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
                      {isFailed ? 'Ejecución fallida' : 'Ejecución completada'}
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
          {/* ── Test en curso ── */}
          <BentoCard className="col-span-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-[#104B99]/10 flex items-center justify-center">
                {isDone
                  ? <CheckCircle2 size={13} className={isFailed ? 'text-[#E63946]' : 'text-[#48A157]'} />
                  : <Loader2 size={13} className="text-[#104B99] animate-spin" />}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">
                {isDone
                  ? isFailed ? 'Terminado con errores' : 'Ejecución completada'
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
            {isDone && (
              <div>
                <div className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  Ejecución finalizada
                </div>
                {issueKey && checklistUrl && defectCount > 0 && (
                  <button
                    onClick={() => onOpenChecklist?.(issueKey, run?.jobId)}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black px-4 py-2 rounded-full transition"
                  >
                    <FileText size={13} /> Ver checklist de defectos
                  </button>
                )}
              </div>
            )}
            {streamError && (
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-[#E63946]">
                <AlertCircle size={12} /> Error de conexión: {streamError}
              </div>
            )}
          </BentoCard>

          {/* ── Distribución ── */}
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

          {/* ── Rerun button (only when execution is done) ── */}
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

        {/* ── Terminal de logs ── */}
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
