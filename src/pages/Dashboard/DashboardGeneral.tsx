import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowRight, Check, CheckCircle2, CircleHelp, Radio, XCircle } from 'lucide-react';
import { C } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LiveRunsSection } from './LiveRunsSection';
import { lastThirtyDays, type DashboardData, type DashboardExecution } from '../../services/dashboard';
import type { ActiveRun } from '../../types';

interface DashboardGeneralProps {
  data: DashboardData;
  onSelectProject: (slug: string) => void;
  onOpenRun: (run: ActiveRun) => void;
}

function inWindow(execution: DashboardExecution, from: Date, to: Date) {
  const timestamp = Date.parse(execution.createdAt);
  return Number.isFinite(timestamp) && timestamp >= from.getTime() && timestamp <= to.getTime();
}

function resultStatus(execution: DashboardExecution): string {
  if (execution.failed > 0 && execution.passed > 0) return 'partial';
  if (execution.failed > 0 || /fail|error/i.test(execution.status)) return 'failed';
  if (execution.passed > 0 || /pass|success|complete|promot/i.test(execution.status)) return 'success';
  return 'partial';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function DashboardGeneral({ data, onSelectProject, onOpenRun }: DashboardGeneralProps) {
  const { from, to } = lastThirtyDays();
  const executions = useMemo(() => data.executions.filter((execution) => inWindow(execution, from, to)), [data.executions, from.getTime(), to.getTime()]);
  const totals = executions.reduce((summary, execution) => ({
    launches: summary.launches + 1,
    scenarios: summary.scenarios + execution.scenarioCount,
    passed: summary.passed + execution.passed,
    failed: summary.failed + execution.failed,
  }), { launches: 0, scenarios: 0, passed: 0, failed: 0 });
  const decidedCases = totals.passed + totals.failed;
  const passRate = decidedCases ? Math.round((totals.passed / decidedCases) * 100) : null;
  const projectsWithActivity = new Set(executions.map((execution) => execution.appSlug)).size;
  const daily = useMemo(() => {
    const rows = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(to);
      date.setDate(date.getDate() - (6 - offset));
      date.setHours(0, 0, 0, 0);
      return { date, label: new Intl.DateTimeFormat('es-DO', { weekday: 'short' }).format(date), launches: 0, passed: 0 };
    });
    for (const execution of executions) {
      const date = new Date(execution.createdAt);
      const row = rows.find((item) => item.date.toDateString() === date.toDateString());
      if (row) { row.launches += 1; row.passed += execution.passed; }
    }
    return rows;
  }, [executions, to.getTime()]);
  const byProject = data.projects.map((project) => {
    const rows = executions.filter((execution) => execution.appSlug === project.slug);
    const passed = rows.reduce((sum, execution) => sum + execution.passed, 0);
    const failed = rows.reduce((sum, execution) => sum + execution.failed, 0);
    const count = passed + failed;
    return { project, rows, passed, failed, rate: count ? Math.round((passed / count) * 100) : null, latest: rows[0], latestPass: rows.find((execution) => execution.passed > 0 && execution.failed === 0) };
  });
  const recent = executions.slice(0, 8);

  return (
    <div className="space-y-4">
      <LiveRunsSection runs={data.activeRuns} available={data.activeRunsAvailable} onOpenRun={onOpenRun} />

      {/* QA Lab executive summary: original navy, success, failure and compact KPI panels. */}
      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-12 min-h-[245px] border-0 bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] !p-0 text-white shadow-[0_14px_36px_-22px_rgba(10,37,71,0.8)] sm:col-span-6 lg:col-span-5">
          <div className="absolute -right-2 top-4 h-36 w-36 rounded-full border border-white/10" />
          <div className="absolute right-8 top-12 h-20 w-20 rounded-full border border-white/10" />
          <div className="relative flex h-full flex-col p-6">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60"><Radio size={12} className="text-[#5EC470]" />Resumen ejecutivo</div>
            <div className="text-[60px] font-medium leading-none tracking-tight">{totals.launches.toLocaleString('es-DO')}</div>
            <div className="mt-2 text-[11px] text-white/65">ejecuciones completadas · últimos 30 días</div>
            <div className="mt-5 flex items-center gap-2 border-b border-white/15 pb-4 text-[10px] text-white/65">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80">{data.projects.length} proyectos habilitados</span>
              <span>Resultados recibidos desde QA Lab</span>
            </div>
            <div className="mt-auto grid grid-cols-3 gap-3 pt-4">
              <HeroStat label="Proyectos" value={data.projects.length} />
              <HeroStat label="Escenarios" value={totals.scenarios} />
              <HeroStat label="Casos" value={decidedCases} />
            </div>
          </div>
        </BentoCard>

        <BentoCard className="col-span-12 min-h-[245px] !p-5 sm:col-span-6 lg:col-span-3">
          <div className="flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Tasa de éxito</div><Activity size={15} className="text-[#48A157]" /></div>
          <div className="flex h-[178px] items-center justify-center">
            <div className="relative flex h-[138px] w-[138px] items-center justify-center rounded-full" style={{ background: passRate === null ? '#F4F1EA' : `conic-gradient(${C.green} ${passRate * 3.6}deg, #F4F1EA ${passRate * 3.6}deg)` }}>
              <div className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full bg-white"><span className="text-[31px] font-medium leading-none text-[#1a1f2e]">{passRate === null ? '—' : `${passRate}%`}</span><span className="mt-1 text-[8px] uppercase tracking-wider text-[#8B999D]">Pass rate</span></div>
            </div>
          </div>
          <div className="text-center text-[10px] text-[#8B999D]">{decidedCases ? `${totals.passed} aprobados de ${decidedCases} resultados` : 'Sin resultados para calcular'}</div>
        </BentoCard>

        <BentoCard className="col-span-12 min-h-[245px] !p-5 sm:col-span-6 lg:col-span-2">
          <div className="flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Fallos</div><XCircle size={15} className="text-[#E63946]" /></div>
          <div className="mt-5 text-[42px] font-medium leading-none text-[#1a1f2e]">{totals.failed.toLocaleString('es-DO')}</div>
          <div className="mt-2 text-[10px] text-[#687680]">casos fallidos reportados</div>
          <div className="mt-auto flex items-center gap-1.5 pt-8 text-[9px] text-[#8B999D]"><span className="h-1.5 w-1.5 rounded-full bg-[#E63946]" />Últimos 30 días</div>
        </BentoCard>

        <BentoCard className="col-span-12 min-h-[245px] !p-5 sm:col-span-6 lg:col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Jobs activos</div>
          <div className="mt-5 text-[42px] font-medium leading-none text-[#104B99]">{data.activeRunsAvailable ? data.activeRuns.length : '—'}</div>
          <div className="mt-2 text-[10px] text-[#687680]">{data.activeRunsAvailable ? 'en cola o ejecutándose' : 'estado no disponible'}</div>
          <div className="mt-auto flex items-center gap-1.5 pt-8 text-[9px] text-[#8B999D]"><span className={`h-1.5 w-1.5 rounded-full ${data.activeRunsAvailable ? 'bg-[#48A157]' : 'bg-[#F4A261]'}`} />{data.activeRunsAvailable ? 'Estado del motor' : 'No se pudo consultar'}</div>
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard accent={C.blue} className="col-span-12 bg-gradient-to-br from-white via-white to-[#EEF4FB] lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div><div className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-[#8B999D]">Pulso de la semana</div><h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Ejecuciones diarias</h3></div>
            <div className="flex gap-3 text-[9px] text-[#687680]"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#104B99]" />Ejecuciones</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#48A157]" />Aprobadas</span></div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs><linearGradient id="qaBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.24} /><stop offset="100%" stopColor={C.blue} stopOpacity={0} /></linearGradient><linearGradient id="qaGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.2} /><stop offset="100%" stopColor={C.green} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8EBEC" vertical={false} /><XAxis dataKey="label" stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: 'white', border: '1px solid #E8EBEC', borderRadius: 10, fontSize: 11 }} />
              <Area type="monotone" dataKey="launches" name="Ejecuciones" stroke={C.blue} fill="url(#qaBlue)" strokeWidth={2.5} /><Area type="monotone" dataKey="passed" name="Aprobadas" stroke={C.green} fill="url(#qaGreen)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </BentoCard>

        <BentoCard className="col-span-12 lg:col-span-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-[#8B999D]">Resultados reportados</div><h3 className="mb-5 text-[18px] font-medium leading-tight text-[#1a1f2e]">Aprobados y fallidos</h3>
          <ResultBar label="Aprobados" count={totals.passed} total={decidedCases} color={C.green} icon={<Check size={12} />} />
          <ResultBar label="Fallidos" count={totals.failed} total={decidedCases} color="#E63946" icon={<XCircle size={12} />} />
          <div className="mt-6 border-t border-[#F0F1EF] pt-4 text-[10px] text-[#8B999D]">{decidedCases ? `${decidedCases} resultados agregados de las ejecuciones` : 'No hay resultados de casos en este período.'}</div>
        </BentoCard>

        <BentoCard className="col-span-12 bg-gradient-to-br from-[#48A157] to-[#357a42] text-white lg:col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">Proyectos</div>
          <div className="mt-4 text-[43px] font-medium leading-none">{projectsWithActivity}<span className="text-[20px] text-white/65">/{data.projects.length}</span></div>
          <div className="mt-2 text-[10px] text-white/75">con ejecuciones recientes</div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${data.projects.length ? projectsWithActivity / data.projects.length * 100 : 0}%` }} /></div>
          <div className="mt-2 text-[9px] text-white/70">{data.projects.length} habilitados</div>
        </BentoCard>
      </div>

      <BentoCard>
        <div className="mb-4 flex items-center justify-between"><div><div className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-[#8B999D]">Tu portafolio</div><h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Actividad por proyecto · últimos 30 días</h3></div><span className="text-[10px] text-[#8B999D]">{data.projects.length} habilitados</span></div>
        {byProject.length ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{byProject.map(({ project, rows, passed, failed, rate, latest }) => (
          <button type="button" key={project.slug} onClick={() => onSelectProject(project.slug)} className="group relative overflow-hidden rounded-xl border border-[#E3E8EC] bg-gradient-to-br from-white to-[#FAFAF7] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#104B99]/40 hover:shadow-[0_8px_24px_-16px_rgba(16,75,153,0.45)]">
            <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b from-[#104B99] to-[#48A157]" />
            <div className="mb-3 flex items-start justify-between gap-2 pl-1"><div><h4 className="text-[13px] font-semibold text-[#1a1f2e]">{project.name}</h4><p className="mt-0.5 text-[10px] text-[#8B999D]">{project.enabled ? 'Habilitado' : 'Deshabilitado'} · {project.projectType === 1 ? 'Web' : `Tipo ${project.projectType}`}</p></div><ArrowRight size={14} className="text-[#8B999D] transition group-hover:translate-x-0.5 group-hover:text-[#104B99]" /></div>
            <div className="grid grid-cols-3 gap-2 text-[10px]"><TinyMetric label="Ejecuciones" value={rows.length} /><TinyMetric label="Aprobados" value={passed} /><TinyMetric label="Fallidos" value={failed} /></div>
            <div className="mt-3 flex items-center justify-between border-t border-[#F0F1EF] pt-2 text-[10px]"><span className="text-[#687680]">Tasa de aprobación</span><strong className={rate === null ? 'text-[#8B999D]' : rate >= 90 ? 'text-[#48A157]' : 'text-[#C97623]'}>{rate === null ? 'Sin datos' : `${rate}%`}</strong></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#E9ECEA]"><div className="h-full rounded-full bg-gradient-to-r from-[#104B99] to-[#48A157] transition-all" style={{ width: `${rate ?? 0}%` }} /></div>
            <div className="mt-1 truncate text-[9px] text-[#8B999D]">Última actividad: {latest ? formatDate(latest.createdAt) : 'Sin ejecuciones en el período'}</div>
          </button>))}</div> : <EmptyState message="El backend no devolvió proyectos habilitados." />}
      </BentoCard>

      <BentoCard accent={C.green} className="bg-gradient-to-br from-white to-[#F1F8F2]">
        <div className="mb-4 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#48A157]/10"><CheckCircle2 size={15} className="text-[#48A157]" /></div><div><div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#48A157]">Éxitos recientes</div><h3 className="text-[19px] font-medium leading-tight text-[#1a1f2e]">Último caso aprobado por proyecto</h3></div></div>
        {byProject.some((entry) => entry.latestPass) ? <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">{byProject.filter((entry) => entry.latestPass).map(({ project, latestPass }) => (
          <button type="button" key={project.slug} onClick={() => onSelectProject(project.slug)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#DDEBE0] bg-white/90 p-3.5 text-left transition hover:border-[#48A157]/50 hover:shadow-[0_7px_20px_-14px_rgba(72,161,87,0.55)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#48A157]/10 text-[#48A157]"><CheckCircle2 size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-[#1a1f2e]">{latestPass?.huTitle || latestPass?.huKey || 'Caso aprobado'}</span><span className="mt-1 block truncate text-[9px] text-[#687680]">{project.name} · {latestPass ? formatDate(latestPass.createdAt) : ''}</span></span>
            <ArrowRight size={13} className="shrink-0 text-[#8B999D] transition group-hover:translate-x-0.5 group-hover:text-[#48A157]" />
          </button>))}</div> : <EmptyState message="No hay casos aprobados en los últimos 30 días." />}
      </BentoCard>

      <BentoCard>
        <div className="mb-4 flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#104B99]/10"><Radio size={13} className="text-[#104B99]" /></div><div><div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Actividad reciente</div><h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Últimas ejecuciones</h3></div></div>
        {recent.length ? <div className="divide-y divide-[#F0F1EF]">{recent.map((execution) => {
          const project = data.projects.find((item) => item.slug === execution.appSlug);
          const total = execution.passed + execution.failed;
          return <div key={execution.launchId} className="grid grid-cols-1 items-center gap-2 rounded-lg py-3 transition hover:bg-[#FAFAF7] md:grid-cols-12 md:gap-4">
            <div className="text-[10px] font-mono text-[#687680] md:col-span-3">{formatDate(execution.createdAt)}</div>
            <div className="min-w-0 md:col-span-3"><div className="truncate text-[12px] font-medium text-[#1a1f2e]">{execution.huTitle || project?.name || execution.appSlug}</div><div className="truncate text-[9px] text-[#8B999D]">{project?.name ?? execution.appSlug} · {execution.launchId}</div></div>
            <div className="flex items-center gap-3 text-[10px] md:col-span-3"><span className="text-[#48A157]">{execution.passed} aprobados</span><span className="text-[#E63946]">{execution.failed} fallidos</span></div>
            <div className="md:col-span-2"><div className="h-1.5 overflow-hidden rounded-full bg-[#F4F1EA]"><div className="h-full bg-[#48A157]" style={{ width: `${total ? execution.passed / total * 100 : 0}%` }} /></div><div className="mt-1 text-[9px] text-[#8B999D]">{total} resultados · {execution.scenarioCount} escenarios</div></div>
            <div className="md:col-span-1"><StatusBadge status={resultStatus(execution)} /></div>
          </div>;
        })}</div> : <EmptyState message="No hay ejecuciones completadas en los últimos 30 días." />}
      </BentoCard>
      {!data.activeRunsAvailable && <div className="flex items-center gap-2 rounded-xl border border-[#F1E4BE] bg-[#FBF5E6] px-4 py-3 text-[10px] text-[#8B6A20]"><CircleHelp size={14} />La sección de jobs activos no está disponible; las estadísticas históricas sí provienen del backend.</div>}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) { return <div className="border-r border-white/15 last:border-0"><div className="text-[9px] uppercase tracking-wider text-white/55">{label}</div><div className="mt-1 text-[19px] font-semibold">{value.toLocaleString('es-DO')}</div></div>; }
function ResultBar({ label, count, total, color, icon }: { label: string; count: number; total: number; color: string; icon: React.ReactNode }) { const percent = total ? count / total * 100 : 0; return <div className="mb-5"><div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] text-[#58646D]"><span style={{ color }}>{icon}</span>{label}</span><strong className="text-[12px] text-[#1a1f2e]">{count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#F4F1EA]"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: color }} /></div><div className="mt-1 text-right text-[9px] text-[#8B999D]">{total ? `${Math.round(percent)}%` : 'Sin resultados'}</div></div>; }
function TinyMetric({ label, value }: { label: string; value: number }) { return <div><div className="text-[9px] uppercase tracking-wide text-[#8B999D]">{label}</div><div className="mt-0.5 text-[15px] font-medium text-[#1a1f2e]">{value.toLocaleString('es-DO')}</div></div>; }
function EmptyState({ message }: { message: string }) { return <div className="rounded-xl border border-dashed border-[#D9DEDF] p-8 text-center text-[11px] text-[#8B999D]">{message}</div>; }
