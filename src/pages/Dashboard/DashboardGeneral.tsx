import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import {
  ArrowUpRight, ArrowDownRight, ArrowRight, Filter, Bug,
  Gauge, Radio, Sparkles, Flame, Hourglass,
} from 'lucide-react';
import { C } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { Sparkline } from '../../components/ui/Sparkline';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LiveRunsSection } from './LiveRunsSection';
import {
  projects, executionHistory, weekData, severityData,
  monthlyDefects,
} from '../../data/mockData';
import type { ActiveRun } from '../../types';

interface DashboardGeneralProps {
  onSelectProject: (id: string) => void;
  onOpenRun: (run: ActiveRun) => void;
}

export function DashboardGeneral({ onSelectProject, onOpenRun }: DashboardGeneralProps) {
  return (
    <div className="space-y-4">
      <LiveRunsSection onOpenRun={onOpenRun} />

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-5 bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] border-0 text-white !p-0">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `radial-gradient(circle at 20% 50%, ${C.green}40 0%, transparent 50%), radial-gradient(circle at 80% 80%, #ffffff20 0%, transparent 50%)` }} />
          <div className="absolute top-4 right-4 w-32 h-32 rounded-full border border-white/10" />
          <div className="absolute top-12 right-12 w-16 h-16 rounded-full border border-white/10" />
          <div className="relative p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium mb-3">
              <Radio size={11} className="text-[#5EC470]" />
              Resumen ejecutivo
            </div>
            <div className="text-[64px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>9,570</div>
            <div className="text-[12px] text-white/70 mt-1">ejecuciones en mayo · todos los proyectos</div>
            <div className="flex items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#5EC470]/20 text-[#5EC470] px-2 py-1 rounded-full">
                <ArrowUpRight size={11} /> +18% vs abril
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-white/60 px-2 py-1">
                <Flame size={11} /> Récord histórico
              </span>
            </div>
            <div className="mt-auto pt-5 grid grid-cols-3 gap-4 border-t border-white/10">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/50">Proyectos</div>
                <div className="text-[20px] font-medium mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>24</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/50">Equipos</div>
                <div className="text-[20px] font-medium mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>8</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/50">Test Cases</div>
                <div className="text-[20px] font-medium mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>1,064</div>
              </div>
            </div>
          </div>
        </BentoCard>

        <BentoCard className="col-span-3 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium">Tasa de éxito</div>
            <Gauge size={14} className="text-[#48A157]" />
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height={140}>
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: 'pass', value: 91.4, fill: C.green }]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background={{ fill: '#F4F1EA' } as any} dataKey="value" cornerRadius={20} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[32px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>91.4<span className="text-[16px] text-[#8B999D]">%</span></div>
              <div className="text-[10px] text-[#48A157] font-medium mt-1 flex items-center gap-0.5"><ArrowUpRight size={10} />+2.1%</div>
            </div>
          </div>
        </BentoCard>

        <BentoCard className="col-span-2 flex flex-col justify-between" accent="#E63946">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium">Defectos</div>
              <Bug size={14} className="text-[#E63946]" />
            </div>
            <div className="text-[40px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>100</div>
            <div className="text-[11px] text-[#58646D] mt-1">encontrados este mes</div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] mt-3">
            <span className="text-[#48A157] font-semibold flex items-center"><ArrowDownRight size={10} />-5%</span>
            <span className="text-[#8B999D]">vs anterior</span>
          </div>
        </BentoCard>

        <BentoCard className="col-span-2 bg-[#F4F1EA] border-[#E8E0CC]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#58646D] font-medium">ROI</div>
            <Hourglass size={14} className="text-[#104B99]" />
          </div>
          <div className="text-[40px] font-medium leading-none text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>847h</div>
          <div className="text-[11px] text-[#58646D] mt-1">ahorradas en mayo</div>
          <div className="mt-3 text-[10px] text-[#58646D] flex items-center gap-1">
            <Sparkles size={10} className="text-[#48A157]" />
            ~RD$2.1M en costo evitado
          </div>
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-7">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Pulso de la semana</div>
              <h3 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Ejecuciones diarias</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1.5 text-[#58646D]"><span className="w-2 h-2 rounded-full bg-[#104B99]" /> Total</span>
              <span className="flex items-center gap-1.5 text-[#58646D]"><span className="w-2 h-2 rounded-full bg-[#48A157]" /> Exitosas</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weekData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8EBEC" vertical={false} />
              <XAxis dataKey="d" stroke="#8B999D" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #E8EBEC', borderRadius: 10, fontSize: 11, padding: '6px 10px' }} />
              <Area type="monotone" dataKey="val" stroke={C.blue} fill="url(#gBlue)" strokeWidth={2} />
              <Area type="monotone" dataKey="ok" stroke={C.green} fill="url(#gGreen)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </BentoCard>

        <BentoCard className="col-span-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Defectos abiertos</div>
          <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight mb-4" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Por severidad</h3>
          <div className="space-y-3">
            {severityData.map(s => {
              const total = severityData.reduce((a, b) => a + b.value, 0);
              const pct = (s.value / total) * 100;
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#58646D] font-medium">{s.name}</span>
                    <span className="text-[11px] font-semibold text-[#1a1f2e]">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.fill }} />
                  </div>
                </div>
              );
            })}
          </div>
        </BentoCard>

        <BentoCard className="col-span-2 bg-gradient-to-br from-[#48A157] to-[#357a42] text-white border-0 flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/70 font-medium mb-2">Cobertura</div>
            <div className="text-[44px] font-medium leading-none" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>76<span className="text-[20px]">%</span></div>
          </div>
          <div>
            <div className="text-[10px] text-white/70 mb-1.5">Automatizado vs manual</div>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i < 7.6 ? 'bg-white' : 'bg-white/20'}`} />
              ))}
            </div>
          </div>
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BentoCard className="col-span-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Tu portafolio</div>
              <h3 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Proyectos automatizados</h3>
            </div>
            <button className="text-[11px] text-[#104B99] font-medium hover:underline flex items-center gap-1">
              Ver todos <ArrowRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {projects.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className="text-left p-4 rounded-xl border border-[#E8EBEC] hover:border-[#104B99]/30 hover:bg-[#FAFAF7] transition-all group relative overflow-hidden"
              >
                <div className="absolute right-0 top-0 w-20 h-20 rounded-full opacity-[0.04] group-hover:opacity-10 transition" style={{ background: p.status === 'failed' ? '#E63946' : p.status === 'running' ? C.blue : C.green, transform: 'translate(30%, -30%)' }} />
                <div className="flex items-start justify-between mb-3 relative">
                  <div>
                    <div className="text-[13px] font-semibold text-[#1a1f2e]">{p.name}</div>
                    <div className="text-[10px] text-[#8B999D] mt-0.5">{p.team} · {p.stack}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex items-end justify-between relative">
                  <div className="flex gap-4">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-[#8B999D]">Pass</div>
                      <div className={`text-[16px] font-medium ${p.passRate >= 90 ? 'text-[#48A157]' : p.passRate >= 85 ? 'text-[#F4A261]' : 'text-[#E63946]'}`} style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{p.passRate}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-[#8B999D]">Runs</div>
                      <div className="text-[16px] font-medium text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{p.runs.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-[#8B999D]">Bugs</div>
                      <div className="text-[16px] font-medium text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{p.defects}</div>
                    </div>
                  </div>
                  <Sparkline data={p.trend} color={p.passRate >= 90 ? C.green : p.passRate >= 85 ? '#F4A261' : '#E63946'} />
                </div>
              </button>
            ))}
          </div>
        </BentoCard>

        <BentoCard className="col-span-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Tendencia mensual</div>
          <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight mb-4" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Defectos: hallados vs resueltos</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyDefects} margin={{ top: 5, right: 5, left: -28, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8EBEC" vertical={false} />
              <XAxis dataKey="mes" stroke="#8B999D" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#8B999D" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #E8EBEC', borderRadius: 10, fontSize: 11 }} />
              <Bar dataKey="encontrados" fill={C.blue} radius={[6, 6, 0, 0]} maxBarSize={18} />
              <Bar dataKey="resueltos" fill={C.green} radius={[6, 6, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </BentoCard>
      </div>

      <BentoCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#8B999D] font-medium mb-1">Actividad reciente</div>
            <h3 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Últimas ejecuciones</h3>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-[11px] border border-[#E8EBEC] px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D]">
              <Filter size={11} /> Filtrar
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {executionHistory.map(e => (
            <div key={e.id} className="grid grid-cols-12 gap-4 items-center px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-all group cursor-pointer">
              <div className="col-span-2 text-[11px] font-mono text-[#58646D]">{e.date}</div>
              <div className="col-span-3 text-[13px] font-medium text-[#1a1f2e]">{e.project}</div>
              <div className="col-span-2 text-[11px] text-[#58646D] flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[#F4F1EA] flex items-center justify-center text-[9px] font-semibold text-[#58646D]">
                  {e.triggered.split(' ')[0][0]}
                </div>
                {e.triggered}
              </div>
              <div className="col-span-2 text-[11px] text-[#58646D] font-mono">{e.duration}</div>
              <div className="col-span-2 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden flex">
                  <div className="bg-[#48A157] h-full" style={{ width: `${(e.passed / e.total) * 100}%` }} />
                  <div className="bg-[#E63946] h-full" style={{ width: `${(e.failed / e.total) * 100}%` }} />
                </div>
                <span className="text-[10px] text-[#58646D] font-mono">{e.passed}/{e.total}</span>
              </div>
              <div className="col-span-1 flex justify-end">
                <StatusBadge status={e.status} />
              </div>
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}
