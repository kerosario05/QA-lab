import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';
import {
  ChevronLeft, Play, Calendar, FileText, Users, Layers, ListChecks,
  ArrowUpRight, ArrowDownRight, Activity, CheckCircle2, Bug, Hourglass,
  Repeat, ShieldAlert, Flame, Network, GitCommit, Lock, CircleDot,
  Eye, FileCheck,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { Sparkline } from '../../components/ui/Sparkline';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  projects, executionHistory, severityData, sprintCycles,
  pendingDefects, efficiencyData, complexityData,
} from '../../data/mockData';

interface ProjectDashboardProps {
  projectId: string;
  onBack: () => void;
  onCloseExecution?: (execution: any) => void;
}

export function ProjectDashboard({ projectId, onBack, onCloseExecution }: ProjectDashboardProps) {
  const project = projects.find(p => p.id === projectId)!;
  const projectExecutions = executionHistory.filter(e => e.project === project.name);
  const sparkData = Array.from({ length: 14 }, (_, i) => ({ x: i, val: 85 + Math.random() * 12 }));

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[11px] text-[#58646D] hover:text-[#104B99] flex items-center gap-1 transition">
        <ChevronLeft size={12} /> Panorama general
      </button>

      <BentoCard className="!p-0 overflow-hidden">
        <div className="grid grid-cols-12">
          <div className="col-span-7 p-7 relative">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status={project.status} />
              <span className="text-[10px] text-[#8B999D]">·</span>
              <span className="text-[10px] text-[#8B999D]">Última corrida hace {project.lastRun}</span>
            </div>
            <h2 className="text-[44px] font-medium text-[#1a1f2e] leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
              {project.name}
            </h2>
            <div className="flex items-center gap-4 mt-3 text-[12px] text-[#58646D]">
              <span className="flex items-center gap-1.5"><Users size={12} /> {project.team}</span>
              <span className="flex items-center gap-1.5"><Layers size={12} /> {project.stack}</span>
              <span className="flex items-center gap-1.5"><ListChecks size={12} /> {project.automated} TCs</span>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button className="bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2.5 rounded-full transition flex items-center gap-1.5 group">
                <Play size={12} fill="white" className="group-hover:scale-110 transition" /> Ejecutar ahora
              </button>
              <button className="border border-[#E8EBEC] hover:bg-[#FAFAF7] text-[#1a1f2e] text-[12px] font-medium px-4 py-2.5 rounded-full transition flex items-center gap-1.5">
                <Calendar size={12} /> Programar
              </button>
              <button className="border border-[#E8EBEC] hover:bg-[#FAFAF7] text-[#1a1f2e] text-[12px] font-medium px-4 py-2.5 rounded-full transition flex items-center gap-1.5">
                <FileText size={12} /> Reporte
              </button>
            </div>
          </div>
          <div className="col-span-5 bg-[#F4F1EA] p-7 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: C.green }} />
            <div className="absolute right-12 top-12 w-20 h-20 rounded-full opacity-10" style={{ background: C.blue }} />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#58646D] font-medium mb-2">Sprint activo</div>
              <div className="text-[16px] font-medium text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Sprint 24 · Estabilización</div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                  <span className="text-[#58646D] uppercase tracking-wider">Avance testing</span>
                  <span className="font-semibold text-[#1a1f2e]">68%</span>
                </div>
                <div className="h-2 bg-white rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#104B99] to-[#48A157] rounded-full" style={{ width: '68%' }} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px]">
                <div>
                  <div className="text-[#8B999D]">Termina en</div>
                  <div className="font-semibold text-[#1a1f2e] mt-0.5">8 días</div>
                </div>
                <div>
                  <div className="text-[#8B999D]">Historias</div>
                  <div className="font-semibold text-[#1a1f2e] mt-0.5">12 / 18</div>
                </div>
                <div>
                  <div className="text-[#8B999D]">Story points</div>
                  <div className="font-semibold text-[#1a1f2e] mt-0.5">34 / 50</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </BentoCard>

      <BentoCard className="!p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#104B99]/10 flex items-center justify-center">
              <Repeat size={13} className="text-[#104B99]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">Sprint 24 · 4 ciclos</div>
              <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                Casos ejecutados por ciclo
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1.5 text-[#58646D]"><span className="w-2 h-2 rounded-full bg-[#48A157]" /> Pass</span>
            <span className="flex items-center gap-1.5 text-[#58646D]"><span className="w-2 h-2 rounded-full bg-[#E63946]" /> Fail</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {sprintCycles.map(c => {
            const passPct = (c.passed / c.total) * 100;
            return (
              <div key={c.id} className={cn(
                'rounded-2xl border p-4 relative overflow-hidden transition-all',
                c.status === 'running' ? 'border-[#104B99]/30 bg-[#104B99]/3' : 'border-[#E8EBEC] bg-white'
              )}>
                {c.status === 'running' && (
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#48A157] animate-pulse" />
                    <span className="text-[8px] uppercase tracking-wider font-bold text-[#48A157]">Activo</span>
                  </div>
                )}
                <div className="text-[9px] text-[#8B999D] uppercase tracking-wider font-mono">{c.date}</div>
                <div className="text-[12px] font-semibold text-[#1a1f2e] mt-1 leading-tight">{c.name}</div>
                <div className="mt-3 h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden flex">
                  <div className="bg-[#48A157] h-full transition-all" style={{ width: `${passPct}%` }} />
                  <div className="bg-[#E63946] h-full transition-all" style={{ width: `${100 - passPct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono text-[#48A157] font-semibold">{c.passed}</span>
                    <span className="text-[#BABEC3]">/</span>
                    <span className="font-mono text-[#E63946] font-semibold">{c.failed}</span>
                    <span className="text-[#BABEC3]">/</span>
                    <span className="font-mono text-[#58646D]">{c.total}</span>
                  </div>
                  <span className="text-[10px] text-[#8B999D] font-mono">{c.duration}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-[#F4F1EA] flex items-center justify-between">
                  <span className="text-[10px] text-[#8B999D] flex items-center gap-1"><Bug size={9} /> {c.defects} bugs</span>
                  <span className={cn('text-[10px] font-semibold', passPct >= 90 ? 'text-[#48A157]' : passPct >= 80 ? 'text-[#F4A261]' : 'text-[#E63946]')}>
                    {passPct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </BentoCard>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium">Ejecuciones</div>
            <Activity size={14} className="text-[#104B99]" />
          </div>
          <div className="text-[36px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{project.runs.toLocaleString()}</div>
          <div className="flex items-center gap-1 text-[10px] mt-2">
            <span className="text-[#48A157] font-semibold flex items-center"><ArrowUpRight size={10} />+24</span>
            <span className="text-[#8B999D]">esta semana</span>
          </div>
        </BentoCard>
        <BentoCard className="col-span-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium">Pass rate</div>
            <CheckCircle2 size={14} className="text-[#48A157]" />
          </div>
          <div className="text-[36px] font-medium leading-none text-[#48A157]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{project.passRate}%</div>
          <div className="mt-2">
            <Sparkline data={project.trend} color={C.green} width={140} height={24} />
          </div>
        </BentoCard>
        <BentoCard className="col-span-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium">Defectos reportados</div>
            <Bug size={14} className="text-[#E63946]" />
          </div>
          <div className="text-[36px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{project.defects}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <span className="px-1.5 py-0.5 rounded-full bg-[#48A157]/10 text-[#48A157] font-semibold">9 resueltos</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#E63946]/10 text-[#E63946] font-semibold">3 abiertos</span>
          </div>
        </BentoCard>
        <BentoCard className="col-span-3 bg-[#1a1f2e] text-white border-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">Próxima ejecución</div>
            <Hourglass size={14} className="text-[#5EC470]" />
          </div>
          <div className="text-[20px] font-medium leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Hoy · 22:00</div>
          <div className="text-[10px] text-white/60 mt-1">Programada · regresión nocturna</div>
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-[#5EC470]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5EC470] animate-pulse" />
            En cola · 248 casos
          </div>
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-2">Duración promedio</div>
          <div className="flex items-baseline gap-1">
            <div className="text-[32px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>12</div>
            <div className="text-[14px] text-[#58646D]">min</div>
          </div>
          <div className="text-[10px] text-[#8B999D] mt-1">por corrida completa</div>
        </BentoCard>
        <BentoCard className="col-span-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-2">Flaky tests</div>
          <div className="flex items-baseline gap-1">
            <div className="text-[32px] font-medium leading-none text-[#F4A261]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>6</div>
            <div className="text-[12px] text-[#48A157] flex items-center"><ArrowDownRight size={11} />-2</div>
          </div>
          <div className="text-[10px] text-[#8B999D] mt-1">requieren atención</div>
        </BentoCard>
        <BentoCard className="col-span-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-2">MTTR defectos</div>
          <div className="flex items-baseline gap-1">
            <div className="text-[32px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>2.4</div>
            <div className="text-[14px] text-[#58646D]">días</div>
          </div>
          <div className="text-[10px] text-[#48A157] mt-1 flex items-center gap-0.5"><ArrowDownRight size={10} />0.8 días menos</div>
        </BentoCard>
        <BentoCard className="col-span-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-2">Top ejecutor</div>
          <div className="flex items-center gap-2.5 mt-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#104B99] to-[#48A157] flex items-center justify-center text-white text-[12px] font-semibold">MR</div>
            <div>
              <div className="text-[13px] font-semibold text-[#1a1f2e]">María Rodríguez</div>
              <div className="text-[10px] text-[#8B999D]">42 ejecuciones · 30 días</div>
            </div>
          </div>
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Estabilidad</div>
              <h3 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Pass rate · últimas 14 corridas</h3>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Promedio</div>
              <div className="text-[24px] font-medium text-[#48A157]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>91.4%</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sparkData} margin={{ top: 5, right: 10, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8EBEC" vertical={false} />
              <XAxis dataKey="x" stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} domain={[70, 100]} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #E8EBEC', borderRadius: 10, fontSize: 11 }} />
              <Line type="monotone" dataKey="val" stroke={C.green} strokeWidth={2.5} dot={{ fill: C.green, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </BentoCard>
        <BentoCard className="col-span-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Defectos</div>
          <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight mb-4" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Por severidad</h3>
          <div className="space-y-3">
            {severityData.map(s => {
              const projVal = Math.floor(s.value / 3);
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#58646D] font-medium">{s.name}</span>
                    <span className="text-[11px] font-semibold text-[#1a1f2e]">{projVal}</span>
                  </div>
                  <div className="h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(projVal / 15) * 100}%`, background: s.fill }} />
                  </div>
                </div>
              );
            })}
          </div>
        </BentoCard>
      </div>

      <BentoCard className="!p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#E63946]/10 flex items-center justify-center">
              <ShieldAlert size={13} className="text-[#E63946]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">Ready for QA · Jira</div>
              <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                Defectos pendientes por probar
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-[#E63946]/10 text-[#E63946] px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-pulse" />
              {pendingDefects.filter(d => d.severity === 'Bloqueante').length} bloqueantes
            </span>
            <span className="text-[10px] text-[#58646D]">·</span>
            <span className="text-[10px] text-[#58646D] font-medium">{pendingDefects.length} total</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {pendingDefects.map(d => {
            const isBlocker = d.severity === 'Bloqueante';
            const sevColors: Record<string, { bg: string }> = {
              'Bloqueante': { bg: '#E63946' },
              'Crítico': { bg: '#F4A261' },
              'Alto': { bg: '#F4A261' },
              'Medio': { bg: C.blue },
              'Bajo': { bg: C.mute },
            };
            const sev = sevColors[d.severity];
            return (
              <div
                key={d.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:bg-[#FAFAF7] cursor-pointer relative overflow-hidden',
                  isBlocker ? 'border-[#E63946]/30 bg-[#E63946]/3' : 'border-[#F4F1EA]'
                )}
              >
                {isBlocker && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E63946]" />}
                <span className="inline-flex items-center justify-center text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white whitespace-nowrap min-w-[80px]" style={{ background: sev.bg }}>
                  {isBlocker && <Flame size={9} className="mr-0.5" />}
                  {d.severity}
                </span>
                <span className="text-[10px] font-mono text-[#8B999D] font-semibold w-16">{d.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[#1a1f2e] truncate">{d.title}</div>
                  <div className="text-[10px] text-[#8B999D] mt-0.5 flex items-center gap-2">
                    <span>{d.component}</span>
                    <span className="text-[#BABEC3]">·</span>
                    <span>Resuelto por {d.resolvedBy}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn('text-[10px] font-semibold', d.daysWaiting >= 4 ? 'text-[#E63946]' : d.daysWaiting >= 2 ? 'text-[#F4A261]' : 'text-[#58646D]')}>
                    {d.daysWaiting}d esperando
                  </div>
                  <div className="text-[9px] text-[#8B999D]">en cola QA</div>
                </div>
                <button className="text-[10px] font-semibold bg-[#1a1f2e] text-white px-3 py-1.5 rounded-full hover:bg-black flex items-center gap-1 whitespace-nowrap">
                  <Play size={9} fill="white" /> Validar
                </button>
              </div>
            );
          })}
        </div>
      </BentoCard>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-7">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#48A157]/10 flex items-center justify-center">
                <Network size={13} className="text-[#48A157]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">Eficiencia</div>
                <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  Tiempo promedio vs cantidad de casos
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="text-[9px] text-[#8B999D] uppercase tracking-wider">Ratio</div>
                <div className="text-[16px] font-medium text-[#48A157] font-mono">5.2s<span className="text-[10px] text-[#8B999D]">/caso</span></div>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8EBEC" />
              <XAxis type="number" dataKey="casos" name="Casos" stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Cantidad de casos', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#8B999D' }} />
              <YAxis type="number" dataKey="tiempo" name="Tiempo" unit="min" stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} />
              <ZAxis range={[80, 80]} />
              <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#BABEC3' }} contentStyle={{ background: 'white', border: '1px solid #E8EBEC', borderRadius: 10, fontSize: 11 }} formatter={(value: any, name: any) => [value + (name === 'Tiempo' ? ' min' : ''), name]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 320, y: 24 }]} stroke="#48A157" strokeDasharray="4 4" strokeOpacity={0.4} />
              <Scatter data={efficiencyData} fill={C.blue} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#8B999D]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#48A157]" /> Eficiente</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#104B99]" /> Estándar</span>
            <span className="italic">Línea: tendencia esperada</span>
          </div>
        </BentoCard>

        <BentoCard className="col-span-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#F4A261]/15 flex items-center justify-center">
              <GitCommit size={13} className="text-[#C97623]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-semibold">Test cases</div>
              <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Complejidad</h3>
            </div>
          </div>
          <div className="space-y-3 mt-5">
            {complexityData.map(c => {
              const total = complexityData.reduce((a, b) => a + b.count, 0);
              const pct = (c.count / total) * 100;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-[#58646D] font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: c.fill }} />
                      {c.name}
                    </span>
                    <span className="text-[11px] text-[#1a1f2e]">
                      <span className="font-semibold font-mono">{c.count}</span>
                      <span className="text-[#8B999D] ml-1">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-[#F4F1EA] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: c.fill }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-[#F4F1EA] grid grid-cols-2 gap-3">
            <div className="bg-[#FAFAF7] rounded-xl p-3">
              <div className="text-[9px] text-[#8B999D] uppercase tracking-wider">Steps promedio</div>
              <div className="text-[20px] font-medium text-[#1a1f2e] mt-0.5 font-mono">9.2</div>
            </div>
            <div className="bg-[#FAFAF7] rounded-xl p-3">
              <div className="text-[9px] text-[#8B999D] uppercase tracking-wider">Mantenimiento</div>
              <div className="text-[20px] font-medium text-[#F4A261] mt-0.5">Medio</div>
            </div>
          </div>
        </BentoCard>
      </div>

      <BentoCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Historial</div>
            <h3 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Ejecuciones de este proyecto</h3>
          </div>
          <button className="text-[11px] bg-[#1a1f2e] text-white px-3 py-1.5 rounded-full hover:bg-black flex items-center gap-1.5">
            <FileText size={11} /> Exportar
          </button>
        </div>
        <div className="space-y-1">
          {(projectExecutions.length > 0 ? projectExecutions : executionHistory.slice(0, 4)).map((e, idx) => {
            const isClosed = idx >= 2;
            const isClosable = e.status !== 'running' && !isClosed;
            return (
              <div key={e.id} className="grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition group cursor-pointer">
                <div className="col-span-2 text-[11px] font-mono text-[#58646D]">{e.date}</div>
                <div className="col-span-2 text-[11px] text-[#58646D]">{e.triggered}</div>
                <div className="col-span-1 text-[11px] text-[#58646D] font-mono">{e.duration}</div>
                <div className="col-span-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden flex">
                    <div className="bg-[#48A157] h-full" style={{ width: `${(e.passed / e.total) * 100}%` }} />
                    <div className="bg-[#E63946] h-full" style={{ width: `${(e.failed / e.total) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-[#58646D] font-mono whitespace-nowrap">{e.passed}/{e.total}</span>
                </div>
                <div className="col-span-1"><StatusBadge status={e.status} /></div>
                <div className="col-span-2">
                  {isClosed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#48A157] bg-[#48A157]/10 px-2 py-1 rounded-full">
                      <Lock size={9} /> Cerrada · Ana P.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#F4A261] bg-[#F4A261]/10 px-2 py-1 rounded-full">
                      <CircleDot size={9} /> Sin cerrar
                    </span>
                  )}
                </div>
                <div className="col-span-1 flex items-center justify-end gap-1">
                  {isClosable ? (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onCloseExecution?.(e); }}
                      className="text-[10px] font-semibold bg-[#1a1f2e] text-white px-2.5 py-1 rounded-full hover:bg-black flex items-center gap-1 whitespace-nowrap"
                    >
                      <FileCheck size={10} /> Cerrar
                    </button>
                  ) : (
                    <button className="text-[10px] text-[#104B99] font-medium opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                      Ver <Eye size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </BentoCard>
    </div>
  );
}
