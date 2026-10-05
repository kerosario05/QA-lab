import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, Loader2, AlertCircle, ExternalLink,
  FileText, Download, Boxes, Database, ListChecks, Bug, CheckCircle2, XCircle, Clock, RefreshCw, X,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { runsProxy } from '../../services/runs';
import { listExecutions, getExecution } from '../../services/executions';
import type { ExecutionListItem, ExecutionSummary } from '../../services/executions';

// ── Helpers ──────────────────────────────────────────────────────────────

function mapStatusToBadge(status?: string): string {
  if (!status) return 'running';
  if (['completed', 'done', 'passed', 'success'].includes(status.toLowerCase())) return 'success';
  if (['completed_with_failures', 'failed', 'error'].includes(status.toLowerCase())) return 'failed';
  return 'running';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const SEVERITY_STYLE: Record<string, { bg: string; label: string }> = {
  critical: { bg: '#E63946', label: 'Crítico' },
  high:     { bg: '#F4A261', label: 'Alto' },
  medium:   { bg: C.blue,    label: 'Medio' },
  low:      { bg: C.mute,    label: 'Bajo' },
};

const DEFECT_STATUS_LABEL: Record<string, string> = {
  pending_review: 'Pendiente de revisión',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  fixed: 'Corregido',
};

function ResultBadge({ result }: { result: 'passed' | 'failed' | 'pending' }) {
  const map = {
    passed:  { color: C.green, Icon: CheckCircle2, label: 'Pasó' },
    failed:  { color: '#E63946', Icon: XCircle, label: 'Falló' },
    pending: { color: C.mute, Icon: Clock, label: 'Pendiente' },
  } as const;
  const { color, Icon, label } = map[result] ?? map.pending;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function executionGroupKey(item: ExecutionListItem): string {
  const title = (item.huTitle || item.huKey || 'Ejecución').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return `${(item.appSlug || 'sin-proyecto').toLowerCase()}|${(item.huKey || '').toLowerCase()}|${title}`;
}

function groupExecutions(items: ExecutionListItem[]): Array<{ key: string; items: ExecutionListItem[] }> {
  const groups = new Map<string, ExecutionListItem[]>();
  for (const item of items) {
    const key = executionGroupKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, grouped]) => ({
    key,
    items: grouped.sort((a, b) => (Date.parse(b.completedAt ?? b.createdAt ?? '') || 0) - (Date.parse(a.completedAt ?? a.createdAt ?? '') || 0)),
  })).sort((a, b) => (Date.parse(b.items[0]?.completedAt ?? b.items[0]?.createdAt ?? '') || 0) - (Date.parse(a.items[0]?.completedAt ?? a.items[0]?.createdAt ?? '') || 0));
}

// ── Component ────────────────────────────────────────────────────────────

export function Ejecuciones() {
  const [selectedLaunchId, setSelectedLaunchId] = useState<string | null>(null);

  return (
    <div className="p-7 min-h-full" style={{ background: C.canvas }}>
      <div className="max-w-6xl mx-auto">
        {selectedLaunchId
          ? <ExecutionDetail launchId={selectedLaunchId} onBack={() => setSelectedLaunchId(null)} />
          : <ExecutionList onOpen={setSelectedLaunchId} />}
      </div>
    </div>
  );
}

// ── LISTA ────────────────────────────────────────────────────────────────

function ExecutionList({ onOpen }: { onOpen: (launchId: string) => void }) {
  const [items, setItems] = useState<ExecutionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    listExecutions({ limit: 40, offset: 0 })
      .then((page) => {
        setItems((current) => {
          if (initial || current.length === 0) return page.executions;
          const merged = new Map(current.map((item) => [item.launchId, item]));
          for (const item of page.executions) merged.set(item.launchId, item);
          return [...merged.values()].sort((a, b) => (Date.parse(b.completedAt ?? b.createdAt ?? '') || 0) - (Date.parse(a.completedAt ?? a.createdAt ?? '') || 0));
        });
        setTotal(page.total);
        setError(null);
        setUpdatedAt(new Date());
      })
      .catch(e => setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await listExecutions({ limit: 40, offset: items.length });
      setItems((current) => {
        const merged = new Map(current.map((item) => [item.launchId, item]));
        for (const item of page.executions) merged.set(item.launchId, item);
        return [...merged.values()].sort((a, b) => (Date.parse(b.completedAt ?? b.createdAt ?? '') || 0) - (Date.parse(a.completedAt ?? a.createdAt ?? '') || 0));
      });
      setTotal(page.total);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar más ejecuciones.');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void refresh(true);
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const toolbar = (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-[22px] font-medium text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Ejecuciones</h2>
        <p className="text-[11px] text-[#8B999D] mt-1">{groupExecutions(items).length} grupos · {items.length} de {total} ejecuciones cargadas{updatedAt ? ` · Actualizado ${updatedAt.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</p>
      </div>
      <button
        onClick={() => void refresh()}
        disabled={refreshing}
        className="inline-flex items-center gap-2 rounded-full border border-[#E8EBEC] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#58646D] hover:border-[#104B99]/40 hover:text-[#104B99] disabled:opacity-60 transition"
      >
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Actualizar
      </button>
    </div>
  );

  if (loading) {
    return (
      <>
        {toolbar}
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[76px] rounded-2xl bg-white border border-[#E8EBEC] animate-pulse" />
          ))}
        </div>
      </>
    );
  }

  if (error && items.length === 0) {
    return (
      <>
        {toolbar}
        <BentoCard className="!p-8">
          <div className="flex items-center gap-3 text-[#E63946] mb-1">
            <AlertCircle size={18} />
            <span className="text-[14px] font-semibold">No se pudieron cargar las ejecuciones</span>
          </div>
          <p className="text-[12px] text-[#8B999D]">{error}</p>
        </BentoCard>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        {toolbar}
        <BentoCard className="text-center !p-12 max-w-md mx-auto">
          <ListChecks size={28} className="text-[#BABEC3] mx-auto mb-3" />
          <div className="text-[18px] font-medium text-[#1a1f2e] mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Aún no hay ejecuciones</div>
          <div className="text-[11px] text-[#8B999D]">Cuando corras una prueba aparecerá aquí su resumen.</div>
        </BentoCard>
      </>
    );
  }

  return (
    <>
    {toolbar}
    {error && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">No se pudo actualizar el historial; se muestran los datos cargados anteriormente.</div>}
    <div className="space-y-3">
      {groupExecutions(items).map(({ key, items: grouped }) => {
        const expanded = expandedGroups.has(key);
        const visibleItems = expanded ? grouped : grouped.slice(0, 1);
        return <div key={key} className="space-y-2">
          {visibleItems.map((it, index) => {
            const failed = it.failed > 0;
            return <div key={it.launchId} className="w-full bg-white border border-[#E8EBEC] rounded-2xl px-5 py-4 flex items-center gap-5 hover:border-[#104B99]/40 transition group">
              <button onClick={() => onOpen(it.jobId ?? it.launchId)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-[11px] font-mono font-bold text-[#104B99] bg-[#104B99]/8 px-2 py-0.5 rounded">{it.huKey ?? '—'}</span>
                  <StatusBadge status={mapStatusToBadge(it.status)} />
                  {index > 0 && <span className="text-[10px] text-[#8B999D]">Ejecución anterior</span>}
                </div>
                <div className="text-[14px] font-medium text-[#1a1f2e] truncate">{it.huTitle || it.huKey || 'Ejecución'}</div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-[#8B999D]">
                  <span className="inline-flex items-center gap-1"><Boxes size={11} /> {it.appSlug ?? '—'}</span>
                  {it.testRunId != null && <span className="inline-flex items-center gap-1"><Database size={11} /> Run {it.testRunId}</span>}
                  <span>{formatDate(it.completedAt ?? it.createdAt)}</span>
                </div>
              </button>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Resultado</div>
                  <div className="text-[15px] font-semibold mt-0.5"><span style={{ color: C.green }}>{it.passed}</span><span className="text-[#BABEC3] mx-0.5">/</span><span style={{ color: failed ? '#E63946' : C.mute }}>{it.failed}</span></div>
                </div>
                <button aria-label={`Abrir ${it.huTitle || 'ejecución'}`} onClick={() => onOpen(it.jobId ?? it.launchId)} className="text-[#BABEC3] group-hover:text-[#104B99]"><ChevronRight size={16} /></button>
              </div>
            </div>;
          })}
          {grouped.length > 1 && <button onClick={() => setExpandedGroups((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })} className="ml-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[#104B99] hover:underline">
            <ChevronDown size={13} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {expanded ? 'Ocultar historial' : `Ver ${grouped.length - 1} ejecuciones anteriores`}
          </button>}
        </div>;
      })}
    </div>
    {items.length < total && <div className="flex justify-center pt-4"><button onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-full border border-[#E8EBEC] bg-white px-5 py-2.5 text-[12px] font-semibold text-[#104B99] hover:border-[#104B99]/40 disabled:opacity-60">{loadingMore && <Loader2 size={13} className="animate-spin" />} Cargar más ejecuciones</button></div>}
    </>
  );
}

// ── DETALLE ──────────────────────────────────────────────────────────────

function ExecutionDetail({ launchId, onBack }: { launchId: string; onBack: () => void }) {
  const [exec, setExec] = useState<ExecutionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const reportPreviewRequestRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getExecution(launchId)
      .then(setExec)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [launchId]);

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

  const closeReportPreview = () => {
    reportPreviewRequestRef.current += 1;
    setReportPreviewOpen(false);
    setReportPreviewUrl(null);
    setReportPreviewLoading(false);
    setReportPreviewError(null);
  };

  const openReportPreview = async () => {
    if (!exec?.jobId || reportPreviewLoading) return;
    const requestId = ++reportPreviewRequestRef.current;
    setReportPreviewOpen(true);
    setReportPreviewUrl(null);
    setReportPreviewError(null);
    setReportPreviewLoading(true);
    try {
      const url = await runsProxy.previewEvidencePdf(exec.jobId);
      if (requestId !== reportPreviewRequestRef.current) {
        window.URL.revokeObjectURL(url);
        return;
      }
      setReportPreviewUrl(url);
    } catch (e) {
      if (requestId === reportPreviewRequestRef.current) {
        setReportPreviewError(e instanceof Error ? e.message : 'No se pudo cargar la vista previa del PDF.');
      }
    } finally {
      if (requestId === reportPreviewRequestRef.current) setReportPreviewLoading(false);
    }
  };

  const handleDownload = () => {
    if (!exec?.jobId) return;
    setDownloading(true);
    setDownloadError(null);
    runsProxy.downloadEvidence(exec.jobId)
      .catch(e => setDownloadError(e.message))
      .finally(() => setDownloading(false));
  };

  const backButton = (
    <button onClick={onBack} className="text-[12px] text-[#58646D] hover:text-[#104B99] flex items-center gap-1 transition mb-4">
      <ChevronLeft size={13} /> Volver a la lista
    </button>
  );

  if (loading) {
    return (
      <>
        {backButton}
        <div className="flex items-center gap-2 text-[13px] text-[#8B999D]">
          <Loader2 size={15} className="animate-spin text-[#104B99]" /> Cargando resumen...
        </div>
      </>
    );
  }

  if (error || !exec) {
    return (
      <>
        {backButton}
        <BentoCard className="!p-8">
          <div className="flex items-center gap-3 text-[#E63946] mb-1">
            <AlertCircle size={18} />
            <span className="text-[14px] font-semibold">No se pudo cargar la ejecución</span>
          </div>
          <p className="text-[12px] text-[#8B999D]">{error ?? 'Respuesta vacía del servidor'}</p>
        </BentoCard>
      </>
    );
  }

  const jiraCount = exec.defects.filter(d => d.registeredInJira).length;
  const evidenceDisabled = !exec.evidenceAvailable || !exec.jobId;
  const testRailLinked = [exec.testRail.projectId, exec.testRail.suiteId, exec.testRail.sectionId, exec.testRail.sectionName, exec.testRail.runId]
    .some(value => value != null && String(value).trim().length > 0);

  return (
    <>
      {backButton}

      {/* Cabecera */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[12px] font-mono font-bold text-[#104B99] bg-[#104B99]/8 px-2 py-0.5 rounded">{exec.hu.key ?? '—'}</span>
            <StatusBadge status={mapStatusToBadge(exec.status)} />
          </div>
          <h2 className="text-[24px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
            {exec.hu.title || exec.hu.key || 'Ejecución'}
          </h2>
          <div className="text-[11px] text-[#8B999D] mt-1">{formatDate(exec.createdAt)}</div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void openReportPreview()}
              disabled={evidenceDisabled || reportPreviewLoading}
              title={evidenceDisabled ? 'Reporte PDF no disponible' : 'Ver reporte PDF'}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#58646D] bg-white border border-[#E8EBEC] hover:border-[#104B99]/40 hover:text-[#104B99] disabled:bg-[#BABEC3] disabled:text-white disabled:cursor-not-allowed px-4 py-2 rounded-full transition"
            >
              {reportPreviewLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Ver reporte
            </button>
            <button
              onClick={handleDownload}
              disabled={evidenceDisabled || downloading}
              title={evidenceDisabled ? 'Evidencia no disponible' : 'Descargar documento de evidencia'}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed px-4 py-2 rounded-full transition"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar documento
            </button>
          </div>
          {downloadError && <span className="text-[10px] text-[#E63946]">{downloadError}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* HU / Proyecto */}
        <BentoCard className="!p-5">
          <SectionTitle icon={<FileText size={14} />} label="Historia de Usuario · Proyecto" />
          <Row label="HU" value={exec.hu.key ?? '—'} mono />
          <Row label="Título" value={exec.hu.title || '—'} />
          <Row label="Proyecto (app)" value={exec.project.appSlug ?? '—'} mono />
        </BentoCard>

        {/* TestRail */}
        <BentoCard className="!p-5">
          <SectionTitle icon={<Database size={14} />} label="TestRail" />
          {!testRailLinked && <div className="mb-3 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] px-3 py-2.5 text-[11px] leading-relaxed text-[#58646D]">
            Esta ejecución no está asociada a TestRail: no se creó un Test Run ni se envió un resultado para esta corrida.
          </div>}
          <Row label="Proyecto" value={String(exec.testRail.projectId ?? (testRailLinked ? 'No informado' : 'No asociado'))} mono />
          <Row label="Suite" value={String(exec.testRail.suiteId ?? (testRailLinked ? 'No informada' : 'No asociada'))} mono />
          <Row label="Sección" value={exec.testRail.sectionName || String(exec.testRail.sectionId ?? (testRailLinked ? 'No informada' : 'No asociada'))} />
          <div className="flex items-center justify-between py-2 border-b border-[#F4F1EA] last:border-b-0">
            <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Test Run</span>
            {exec.testRail.runUrl ? (
              <a href={exec.testRail.runUrl} target="_blank" rel="noreferrer"
                className="text-[13px] font-semibold text-[#104B99] hover:underline inline-flex items-center gap-1">
                #{exec.testRail.runId} <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-[13px] font-semibold text-[#1a1f2e]">{exec.testRail.runId != null ? `#${exec.testRail.runId}` : 'Sin Test Run'}</span>
            )}
          </div>
        </BentoCard>

        {/* Escenarios */}
        <BentoCard className="!p-5 col-span-2">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={<ListChecks size={14} />} label="Escenarios ejecutados" noMargin />
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[#8B999D]">Total <b className="text-[#1a1f2e]">{exec.summary.total}</b></span>
              <span style={{ color: C.green }}>Pasaron <b>{exec.summary.passed}</b></span>
              <span style={{ color: '#E63946' }}>Fallaron <b>{exec.summary.failed}</b></span>
              {typeof exec.summary.synced === 'number' && <span className="text-[#8B999D]">En TestRail <b className="text-[#1a1f2e]">{exec.summary.synced}</b></span>}
            </div>
          </div>
          <div className="divide-y divide-[#F4F1EA]">
            {exec.scenarios.length === 0 ? (
              <div className="text-[12px] text-[#8B999D] py-3">Sin escenarios registrados.</div>
            ) : exec.scenarios.map(sc => (
              <div key={sc.scenarioId} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#1a1f2e] truncate">{sc.title}</div>
                  {sc.caseId != null && <div className="text-[10px] font-mono text-[#8B999D] mt-0.5">C{sc.caseId}</div>}
                </div>
                {sc.syncStatus && <span className="text-[10px] text-[#8B999D] bg-[#F4F1EA] px-1.5 py-0.5 rounded">{sc.syncStatus}</span>}
                <ResultBadge result={sc.result} />
              </div>
            ))}
          </div>
        </BentoCard>

        {/* Defectos */}
        <BentoCard className="!p-5 col-span-2">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={<Bug size={14} />} label="Defectos" noMargin />
            <span className="text-[11px] text-[#8B999D]">
              <b className="text-[#1a1f2e]">{exec.defects.length}</b> defectos · <b className="text-[#104B99]">{jiraCount}</b> en Jira
            </span>
          </div>
          <div className="space-y-2">
            {exec.defects.length === 0 ? (
              <div className="text-[12px] text-[#8B999D] py-2">Sin defectos registrados en esta corrida.</div>
            ) : exec.defects.map(d => {
              const sev = SEVERITY_STYLE[d.severity] ?? SEVERITY_STYLE.medium;
              return (
                <div key={d.id} className="flex items-start gap-3 rounded-xl border border-[#E8EBEC] overflow-hidden">
                  <span className="w-1 self-stretch flex-shrink-0" style={{ background: sev.bg }} />
                  <div className="flex-1 min-w-0 py-2.5 pr-3">
                    <div className="text-[12px] font-medium text-[#1a1f2e] leading-snug">{d.title}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: sev.bg, background: `${sev.bg}14` }}>{sev.label}</span>
                      <span className="text-[10px] text-[#8B999D] bg-[#F4F1EA] px-1.5 py-0.5 rounded">{DEFECT_STATUS_LABEL[d.status] ?? d.status}</span>
                      {d.registeredInJira && d.jiraIssueUrl ? (
                        <a href={d.jiraIssueUrl} target="_blank" rel="noreferrer"
                          className="text-[10px] font-semibold text-[#104B99] hover:underline inline-flex items-center gap-1">
                          En Jira {d.jiraIssueKey ? `· ${d.jiraIssueKey}` : ''} <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-[10px] font-semibold text-[#8B999D] inline-flex items-center gap-1">Pendiente</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </BentoCard>

        {/* Documento */}
        <BentoCard className="!p-5 col-span-2">
          <SectionTitle icon={<FileText size={14} />} label="Documento de evidencia" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] text-[#58646D] leading-relaxed">
              {evidenceDisabled
                ? 'La evidencia no está disponible para esta ejecución (corrida previa al cambio o sin job asociado).'
                : 'Genera y descarga el documento .docx con la evidencia por paso de esta ejecución.'}
            </p>
            <button
              onClick={handleDownload}
              disabled={evidenceDisabled || downloading}
              title={evidenceDisabled ? 'Evidencia no disponible' : undefined}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#48A157] hover:bg-[#357a42] disabled:bg-[#BABEC3] disabled:cursor-not-allowed px-4 py-2 rounded-full transition"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar
            </button>
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
          <section role="dialog" aria-modal="true" aria-labelledby="execution-report-preview-title" className="flex h-[min(92vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-[#E8EBEC] px-5 py-3">
              <div>
                <h2 id="execution-report-preview-title" className="text-sm font-semibold text-[#1a1f2e]">Reporte de ejecución</h2>
                <p className="mt-0.5 text-[11px] text-[#8B999D]">Vista previa del PDF de evidencias</p>
              </div>
              <button type="button" onClick={closeReportPreview} aria-label="Cerrar vista previa del reporte" className="rounded-full p-2 text-[#58646D] transition hover:bg-[#F4F1EA] hover:text-[#1a1f2e]"><X size={17} /></button>
            </header>
            <div className="min-h-0 flex-1 bg-[#F4F1EA]">
              {reportPreviewLoading && <div className="flex h-full items-center justify-center gap-2 text-sm text-[#58646D]"><Loader2 size={16} className="animate-spin" /> Cargando PDF...</div>}
              {reportPreviewError && <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#B4463C]">No se pudo mostrar el PDF: {reportPreviewError}</div>}
              {reportPreviewUrl && !reportPreviewLoading && <iframe title="Vista previa del PDF de evidencias" src={reportPreviewUrl} className="h-full w-full border-0" />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function SectionTitle({ icon, label, noMargin }: { icon: ReactNode; label: string; noMargin?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', !noMargin && 'mb-3')}>
      <span className="text-[#104B99]">{icon}</span>
      <span className="text-[12px] font-semibold text-[#1a1f2e]">{label}</span>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F4F1EA] last:border-b-0 gap-3">
      <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium flex-shrink-0">{label}</span>
      <span className={cn('text-[13px] font-semibold text-[#1a1f2e] truncate text-right', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
