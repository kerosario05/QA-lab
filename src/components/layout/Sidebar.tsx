import { LayoutGrid, Rocket, Settings2, Sparkles } from 'lucide-react';
import { C, cn } from '../../constants/theme';

interface SidebarProps {
  active: string;
  onChange: (v: string) => void;
}

const items = [
  { id: 'dashboard', label: 'Panorama', icon: LayoutGrid },
  { id: 'execute', label: 'Lanzar pruebas', icon: Rocket },
  { id: 'settings', label: 'Ajustes', icon: Settings2 },
];

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="w-[240px] bg-white border-r border-[#E8EBEC] flex flex-col">
      {/* BSC brand accent strip */}
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${C.blue} 0%, ${C.green} 100%)` }} />

      {/* Header: BSC logo + tool name */}
      <div className="px-5 pt-4 pb-3">
        <img
          src="/bsc-logo.png"
          alt="Banco Santa Cruz"
          className="h-16 w-auto max-w-[150px] object-contain"
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[15px] font-bold tracking-tight text-[#1a1f2e]">QA Lab</div>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-md inline-flex items-center gap-1.5"
            style={{ background: `${C.blue}12`, color: C.blue }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.green }} />
            Interno
          </div>
        </div>
      </div>

      <div className="mx-5 mb-3 h-px" style={{ background: C.paper }} />

      <nav className="flex-1 px-3 pt-2 space-y-0.5">
        {items.map(it => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all relative group',
                isActive ? 'text-[#1a1f2e] bg-[#F4F1EA]' : 'text-[#58646D] hover:text-[#1a1f2e] hover:bg-[#FAFAF7]'
              )}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ background: C.green }} />}
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.7} />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 mx-3 mb-3 rounded-xl border border-[#E8EBEC] bg-gradient-to-br from-[#F4F1EA] to-white relative overflow-hidden">
        <div className="absolute -right-2 -top-2 w-12 h-12 rounded-full opacity-20" style={{ background: C.green }} />
        <div className="relative">
          <Sparkles size={14} className="text-[#48A157]" />
          <div className="text-[11px] font-semibold text-[#1a1f2e] mt-1.5 leading-tight">Pro tip</div>
          <div className="text-[10px] text-[#58646D] mt-0.5 leading-snug">Programa ejecuciones nocturnas para optimizar recursos.</div>
        </div>
      </div>

      <div className="p-3 mx-3 mb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#104B99] to-[#48A157] flex items-center justify-center text-white text-[11px] font-semibold">CM</div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-[#1a1f2e] truncate">Carlos Martínez</div>
          <div className="text-[10px] text-[#8B999D]">QA Lead</div>
        </div>
      </div>
    </aside>
  );
}
