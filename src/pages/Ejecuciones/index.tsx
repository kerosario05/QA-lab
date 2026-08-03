import { useState, useEffect, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, AlertCircle, ExternalLink,
  FileText, Download, Boxes, Database, ListChecks, Bug, CheckCircle2, XCircle, Clock,
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
  if (status === 'completed') return 'success';
  if (status === 'completed_with_failures') return 'failed';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listExecutions()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-[76px] rounded-2xl bg-white border border-[#E8EBEC] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <BentoCard className="!p-8">
        <div className="flex items-center gap-3 text-[#E63946] mb-1">
          <AlertCircle size={18} />
          <span className="text-[14px] font-semibold">No se pudieron cargar las ejecuciones</span>
        </div>
        <p className="text-[12px] text-[#8B999D]">{error}</p>
      </BentoCard>
    );
  }

  if (items.length === 0) {
    return (
      <BentoCard className="text-center !p-12 max-w-md mx-auto">
        <ListChecks size={28} className="text-[#BABEC3] mx-auto mb-3" />
        <div className="text-[18px] font-medium text-[#1a1f2e] mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Aún no hay ejecuciones</div>
        <div className="text-[11px] text-[#8B999D]">Cuando corras una prueba aparecerá aquí su resumen.</div>
      </BentoCard>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(it => {
        const failed = it.failed > 0;
        return (
          <button
            key={it.launchId}
            onClick={() => onOpen(it.launchId)}
            className="w-full text-left bg-white border border-[#E8EBEC] rounded-2xl px-5 py-4 flex items-center gap-5 hover:border-[#104B99]/40 hover:shadow-[0_8px_24px_-12px_rgba(16,75,153,0.25)] transition-all group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-[11px] font-mono font-bold text-[#104B99] bg-[#104B99]/8 px-2 py-0.5 rounded">{it.huKey ?? '—'}</span>
                <StatusBadge status={mapStatusToBadge(it.status)} />
              </div>
              <div className="text-[14px] font-medium text-[#1a1f2e] truncate">{it.huTitle || it.huKey || 'Ejecución'}</div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-[#8B999D]">
                <span className="inline-flex items-center gap-1"><Boxes size={11} /> {it.appSlug ?? '—'}</span>
                <span className="inline-flex items-center gap-1"><Database size={11} /> Run {it.testRunId ?? '—'}</span>
                <span>{formatDate(it.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Resultado</div>
                <div className="text-[15px] font-semibold mt-0.5">
                  <span style={{ color: C.green }}>{it.passed}</span>
                  <span className="text-[#BABEC3] mx-0.5">/</span>
                  <span style={{ color: failed ? '#E63946' : C.mute }}>{it.failed}</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#BABEC3] group-hover:text-[#104B99] transition" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── DETALLE ──────────────────────────────────────────────────────────────

function ExecutionDetail({ launchId, onBack }: { launchId: string; onBack: () => void }) {
  const [exec, setExec] = useState<ExecutionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getExecution(launchId)
      .then(setExec)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [launchId]);

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
          <button
            onClick={handleDownload}
            disabled={evidenceDisabled || downloading}
            title={evidenceDisabled ? 'Evidencia no disponible' : 'Descargar documento de evidencia'}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed px-4 py-2 rounded-full transition"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar documento
          </button>
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
          <Row label="Proyecto" value={String(exec.testRail.projectId ?? '—')} mono />
          <Row label="Suite" value={String(exec.testRail.suiteId ?? '—')} mono />
          <Row label="Sección" value={exec.testRail.sectionName || String(exec.testRail.sectionId ?? '—')} />
          <div className="flex items-center justify-between py-2 border-b border-[#F4F1EA] last:border-b-0">
            <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Test Run</span>
            {exec.testRail.runUrl ? (
              <a href={exec.testRail.runUrl} target="_blank" rel="noreferrer"
                className="text-[13px] font-semibold text-[#104B99] hover:underline inline-flex items-center gap-1">
                #{exec.testRail.runId} <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-[13px] font-semibold text-[#1a1f2e]">#{exec.testRail.runId ?? '—'}</span>
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
