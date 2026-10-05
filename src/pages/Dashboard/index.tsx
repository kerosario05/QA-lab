import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Calendar, Loader2, RefreshCw } from 'lucide-react';
import { C } from '../../constants/theme';
import { DashboardGeneral } from './DashboardGeneral';
import { ProjectDashboard } from '../ProjectDashboard';
import { loadDashboardData, type DashboardData } from '../../services/dashboard';
import type { ActiveRun } from '../../types';

interface DashboardViewProps {
  onOpenRun: (run: ActiveRun) => void;
  onCloseExecution: (execution: any) => void;
}

function DashboardMessage({ title, detail, onRetry, loading = false }: { title: string; detail: string; onRetry?: () => void; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#E8EBEC] bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F1EA] text-[#58646D]">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
      </div>
      <h2 className="text-[15px] font-semibold text-[#1a1f2e]">{title}</h2>
      <p className="mx-auto mt-1 max-w-[560px] text-[12px] text-[#687680]">{detail}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-[#104B99] px-4 py-2 text-[11px] font-semibold text-white">Reintentar</button>}
    </div>
  );
}

export function DashboardView({ onOpenRun, onCloseExecution }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<DashboardData | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial || !dataRef.current) setLoading(true);
    try {
      const next = await loadDashboardData();
      dataRef.current = next;
      setData(next);
      setError(null);
      setSelectedProjectSlug((current) => current && next.projects.some((project) => project.slug === current) ? current : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos del Panorama.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const selectedProject = data?.projects.find((project) => project.slug === selectedProjectSlug) ?? null;
  const updatedLabel = data
    ? new Intl.DateTimeFormat('es-DO', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.loadedAt))
    : '';

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-[#E8EBEC] bg-white p-1">
          <button type="button" onClick={() => setSelectedProjectSlug(null)} className={`rounded-full px-3.5 py-1.5 text-[11px] font-medium ${selectedProjectSlug ? 'text-[#58646D]' : 'bg-[#1a1f2e] text-white'}`}>Todo</button>
          <select
            aria-label="Filtrar Panorama por proyecto"
            onChange={(event) => setSelectedProjectSlug(event.target.value || null)}
            className="cursor-pointer bg-transparent px-3.5 py-1.5 pr-7 text-[11px] font-medium text-[#58646D] outline-none"
            value={selectedProjectSlug ?? ''}
            disabled={!data?.projects.length}
          >
            <option value="">Por proyecto...</option>
            {(data?.projects ?? []).map((project) => <option key={project.slug} value={project.slug}>{project.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8EBEC] bg-white px-3 py-1.5 text-[10px] text-[#58646D]">
            <Calendar size={11} /> Últimos 30 días
          </span>
          {data && <span className="text-[10px] text-[#8B999D]">Actualizado {updatedLabel}</span>}
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar Panorama" className="rounded-full border border-[#E8EBEC] bg-white p-2 text-[#58646D] hover:text-[#104B99] disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && data && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#F1E4BE] bg-[#FBF5E6] px-4 py-3 text-[11px] text-[#8B6A20]"><AlertTriangle size={14} /> No se pudo actualizar; se conservan los últimos datos recibidos. {error}</div>}
      {!data && loading && <DashboardMessage title="Cargando Panorama" detail="Consultando los proyectos y ejecuciones del backend." loading />}
      {!data && !loading && error && <DashboardMessage title="No se cargaron las métricas" detail={error} onRetry={() => void refresh(true)} />}
      {data && selectedProject && (
        <ProjectDashboard
          project={selectedProject}
          executions={data.executions.filter((execution) => execution.appSlug === selectedProject.slug)}
          activeRuns={data.activeRuns.filter((run) => run.project === selectedProject.name)}
          onBack={() => setSelectedProjectSlug(null)}
          onCloseExecution={onCloseExecution}
        />
      )}
      {data && !selectedProject && (
        <>
          {!data.projects.length && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#E8EBEC] bg-white px-4 py-3 text-[11px] text-[#687680]"><Activity size={14} /> No hay proyectos habilitados para mostrar.</div>}
          <DashboardGeneral data={data} onSelectProject={setSelectedProjectSlug} onOpenRun={onOpenRun} />
        </>
      )}
    </div>
  );
}
