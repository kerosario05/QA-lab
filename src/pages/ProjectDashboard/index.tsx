import { ChevronLeft, CircleHelp, Play, Radio } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { DashboardExecution, DashboardProject } from '../../services/dashboard';
import type { ActiveRun } from '../../types';

interface ProjectDashboardProps {
  project: DashboardProject;
  executions: DashboardExecution[];
  activeRuns: ActiveRun[];
  onBack: () => void;
  onCloseExecution?: (execution: any) => void;
}

function displayStatus(execution: DashboardExecution) {
  if (execution.failed > 0 && execution.passed > 0) return 'partial';
  if (execution.failed > 0) return 'failed';
  if (execution.passed > 0) return 'success';
  if (/fail|error/i.test(execution.status)) return 'failed';
  if (/pass|success|complete|promot|done/i.test(execution.status)) return 'success';
  return 'partial';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ProjectDashboard({ project, executions, activeRuns, onBack }: ProjectDashboardProps) {
  const totals = executions.reduce((result, execution) => ({
    launches: result.launches + 1,
    scenarios: result.scenarios + execution.scenarioCount,
    passed: result.passed + execution.passed,
    failed: result.failed + execution.failed,
  }), { launches: 0, scenarios: 0, passed: 0, failed: 0 });
  return <div className="space-y-4">
    <button type="button" onClick={onBack} className="flex items-center gap-1 text-[11px] text-[#58646D] transition hover:text-[#104B99]"><ChevronLeft size={12} /> Panorama general</button>
    <BentoCard className="!p-0 overflow-hidden">
      <div className="bg-gradient-to-r from-[#0a2547] to-[#104B99] p-7 text-white">
        <div className="mb-3 flex items-center gap-2"><span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px]">{project.enabled ? 'Habilitado' : 'Deshabilitado'}</span><span className="text-[10px] text-white/70">Proyecto · {project.slug}</span></div>
        <h2 className="text-[34px] font-medium leading-tight">{project.name}</h2>
        <p className="mt-2 text-[11px] text-white/70">Actividad histórica recibida del backend · últimos 30 días</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#E8EBEC] md:grid-cols-4">
        <ProjectMetric label="Ejecuciones" value={totals.launches} />
        <ProjectMetric label="Escenarios reportados" value={totals.scenarios} />
        <ProjectMetric label="Aprobados" value={totals.passed} />
        <ProjectMetric label="Fallidos" value={totals.failed} />
      </div>
    </BentoCard>

    <BentoCard>
      <div className="mb-4 flex items-center gap-2"><Radio size={14} className="text-[#48A157]" /><h3 className="text-[17px] font-medium text-[#1a1f2e]">Jobs activos</h3><span className="ml-auto text-[10px] text-[#8B999D]">{activeRuns.length}</span></div>
      {activeRuns.length ? <div className="space-y-2">{activeRuns.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8EBEC] p-3"><div><div className="text-[12px] font-medium text-[#1a1f2e]">{run.currentTest}</div><div className="mt-0.5 text-[10px] text-[#8B999D]">{run.id} · {run.startedAt}</div></div><div className="flex items-center gap-3 text-[10px] text-[#58646D]"><span>{run.completed}/{run.total || '—'} procesados</span><StatusBadge status="running" /></div></div>)}</div>
        : <p className="rounded-xl bg-[#F7F8F8] p-4 text-[11px] text-[#687680]">No hay jobs activos de este proyecto.</p>}
    </BentoCard>

    <BentoCard>
      <div className="mb-4 flex items-center gap-2"><Play size={13} className="text-[#104B99]" /><h3 className="text-[17px] font-medium text-[#1a1f2e]">Historial de ejecuciones</h3><span className="ml-auto text-[10px] text-[#8B999D]">{executions.length}</span></div>
      {executions.length ? <div className="divide-y divide-[#F0F1EF]">{executions.map((execution) => {
        const count = execution.passed + execution.failed;
        return <div key={execution.launchId} className="grid grid-cols-1 items-center gap-2 py-3 md:grid-cols-12 md:gap-3">
          <div className="text-[10px] text-[#687680] md:col-span-3">{formatDate(execution.createdAt)}</div>
          <div className="min-w-0 md:col-span-4"><div className="truncate text-[12px] font-medium text-[#1a1f2e]">{execution.huTitle || execution.huKey || execution.launchId}</div><div className="text-[9px] text-[#8B999D]">{execution.scenarioCount} escenarios</div></div>
          <div className="text-[10px] text-[#58646D] md:col-span-3"><span className="text-[#48A157]">{execution.passed} aprobados</span> · <span className="text-[#E63946]">{execution.failed} fallidos</span>{count === 0 && ' · sin resultado por caso'}</div>
          <div className="md:col-span-2"><StatusBadge status={displayStatus(execution)} /></div>
        </div>;
      })}</div> : <div className="flex items-start gap-2 rounded-xl bg-[#F7F8F8] p-4 text-[11px] text-[#687680]"><CircleHelp size={14} className="mt-0.5 shrink-0" />No hay ejecuciones reportadas para este proyecto durante los últimos 30 días.</div>}
    </BentoCard>
  </div>;
}

function ProjectMetric({ label, value }: { label: string; value: number }) { return <div className="bg-white p-5"><div className="text-[9px] uppercase tracking-wide text-[#8B999D]">{label}</div><div className="mt-1 text-[26px] font-medium text-[#1a1f2e]">{value.toLocaleString('es-DO')}</div></div>; }
