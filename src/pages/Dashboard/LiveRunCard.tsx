import { useState, useEffect } from 'react';
import { Check, XCircle } from 'lucide-react';
import { C } from '../../constants/theme';
import type { ActiveRun } from '../../types';

interface LiveRunCardProps {
  run: ActiveRun;
  onClick: () => void;
}

export function LiveRunCard({ run, onClick }: LiveRunCardProps) {
  const [livePct, setLivePct] = useState(run.progress);
  const [completed, setCompleted] = useState(run.completed);

  useEffect(() => {
    const interval = setInterval(() => {
      setLivePct(p => Math.min(p + Math.random() * 0.8, 100));
      setCompleted(c => Math.min(c + (Math.random() > 0.6 ? 1 : 0), run.total));
    }, 1500);
    return () => clearInterval(interval);
  }, [run.total]);

  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white rounded-2xl border border-[#E8EBEC] p-4 hover:border-[#104B99]/40 transition-all relative overflow-hidden group"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#104B99] via-[#48A157] to-[#104B99]" style={{ backgroundSize: '100% 200%', animation: 'liveGlow 2s ease-in-out infinite' }} />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-[#48A157]" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#48A157] animate-ping" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-[#1a1f2e]">{run.project}</div>
            <div className="text-[9px] text-[#8B999D] font-mono mt-0.5">{run.id} · {run.startedAt}</div>
          </div>
        </div>
        <span className="text-[9px] uppercase tracking-wider font-semibold text-[#48A157] bg-[#48A157]/10 px-2 py-0.5 rounded-full">En vivo</span>
      </div>

      <div className="relative mb-2.5">
        <div className="h-1.5 bg-[#F4F1EA] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
            style={{ width: `${livePct}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.green})` }}
          >
            <div className="absolute inset-0 opacity-50" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', animation: 'shimmer 1.5s linear infinite' }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-[#1a1f2e] font-semibold">{Math.round(livePct)}%</span>
          <span className="text-[#8B999D] font-mono">{completed}/{run.total}</span>
          <span className="flex items-center gap-1 text-[#48A157] font-medium"><Check size={9} strokeWidth={3} />{run.passed}</span>
          {run.failed > 0 && <span className="flex items-center gap-1 text-[#E63946] font-medium"><XCircle size={9} />{run.failed}</span>}
        </div>
        <span className="text-[#58646D] font-mono">ETA {run.eta}</span>
      </div>

      <div className="text-[10px] text-[#8B999D] mt-2 truncate font-mono">
        <span className="text-[#48A157]">▸</span> {run.currentTest}
      </div>
    </button>
  );
}
