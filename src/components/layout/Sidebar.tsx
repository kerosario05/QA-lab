import { LayoutGrid, Rocket, History, Settings, Sparkles } from 'lucide-react';
import { C, cn } from '../../constants/theme';

interface SidebarProps {
  active: string;
  onChange: (v: string) => void;
}

const items = [
  { id: 'dashboard', label: 'Panorama', icon: LayoutGrid },
  { id: 'execute', label: 'Lanzar pruebas', icon: Rocket },
  { id: 'ejecuciones', label: 'Ejecuciones', icon: History },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="w-[240px] bg-white border-r border-[#E8EBEC] flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 rounded-[10px] rotate-6" style={{ background: C.green }} />
          <div className="absolute inset-0 rounded-[10px] -rotate-3 flex items-center justify-center text-white font-bold text-[14px]" style={{ background: C.blue, fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
            Q
          </div>
        </div>
        <div>
          <div className="text-[14px] font-semibold tracking-tight text-[#1a1f2e] leading-tight">QA Lab</div>
          <div className="text-[10px] text-[#8B999D] uppercase tracking-[0.15em] mt-0.5">Santa Cruz</div>
        </div>
      </div>

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
