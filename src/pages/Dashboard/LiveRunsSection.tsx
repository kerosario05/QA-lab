import { Radio, ArrowRight } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { LiveRunCard } from './LiveRunCard';
import { activeRuns } from '../../data/mockData';
import type { ActiveRun } from '../../types';

interface LiveRunsSectionProps {
  onOpenRun: (run: ActiveRun) => void;
}

export function LiveRunsSection({ onOpenRun }: LiveRunsSectionProps) {
  if (activeRuns.length === 0) return null;
  return (
    <BentoCard className="!p-5 bg-gradient-to-br from-white to-[#FAFAF7] border-[#E8EBEC]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 rounded-full bg-[#48A157]/10 flex items-center justify-center">
            <Radio size={13} className="text-[#48A157]" />
            <div className="absolute inset-0 rounded-full border border-[#48A157]/30 animate-ping" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#48A157] font-semibold">En ejecución ahora</div>
            <h3 className="text-[18px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
              {activeRuns.length} {activeRuns.length === 1 ? 'corrida activa' : 'corridas activas'}
            </h3>
          </div>
        </div>
        <button className="text-[11px] text-[#104B99] font-medium hover:underline flex items-center gap-1">
          Ver todas <ArrowRight size={11} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {activeRuns.map(run => (
          <LiveRunCard key={run.id} run={run} onClick={() => onOpenRun(run)} />
        ))}
      </div>
    </BentoCard>
  );
}
