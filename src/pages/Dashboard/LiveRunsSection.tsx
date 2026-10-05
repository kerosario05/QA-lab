import { Radio } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { LiveRunCard } from './LiveRunCard';
import type { ActiveRun } from '../../types';

interface LiveRunsSectionProps {
  runs: ActiveRun[];
  available: boolean;
  onOpenRun: (run: ActiveRun) => void;
}

export function LiveRunsSection({ runs, available, onOpenRun }: LiveRunsSectionProps) {
  return (
    <BentoCard className="!p-5 border-[#E8EBEC] bg-gradient-to-br from-white to-[#FAFAF7]">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#48A157]/10"><Radio size={13} className="text-[#48A157]" />{available && runs.length > 0 && <div className="absolute inset-0 animate-ping rounded-full border border-[#48A157]/30" />}</div>
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#48A157]">En ejecución ahora</div><h3 className="text-[18px] font-medium leading-tight text-[#1a1f2e]">{available ? `${runs.length} ${runs.length === 1 ? 'job activo' : 'jobs activos'}` : 'Estado no disponible'}</h3></div>
      </div>
      {!available ? <p className="rounded-xl bg-[#FBF5E6] p-4 text-[11px] text-[#8B6A20]">No se pudo consultar el estado de los jobs en el backend.</p>
        : runs.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">{runs.map((run) => <LiveRunCard key={run.id} run={run} onClick={() => onOpenRun(run)} />)}</div>
          : <p className="rounded-xl bg-[#F7F8F8] p-4 text-[11px] text-[#687680]">El backend no reporta jobs en cola o en ejecución ahora mismo.</p>}
    </BentoCard>
  );
}
