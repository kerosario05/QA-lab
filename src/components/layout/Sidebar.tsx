import { useEffect, useState } from 'react';
import { LayoutGrid, Rocket, History, Settings, Sparkles, Video, Users, ClipboardList, KeyRound, GitBranch } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import type { PermissionKey } from '../../auth/types';

interface SidebarProps {
  active: string;
  onChange: (v: string) => void;
}

/**
 * Navigation entries, each gated by the permissions its module needs.
 *
 * Hiding an entry the user cannot open is the honest counterpart to the API's
 * 403 — not a replacement for it: the engine enforces the same permissions on
 * every request.
 */
const items: { id: string; label: string; icon: typeof LayoutGrid; permissions: PermissionKey[] }[] = [
  { id: 'dashboard', label: 'Panorama', icon: LayoutGrid, permissions: ['dashboard.view'] },
  { id: 'execute', label: 'Lanzar pruebas', icon: Rocket, permissions: ['tests.launch'] },
  { id: 'grabacion', label: 'Grabación', icon: Video, permissions: ['recordings.view', 'recordings.create'] },
  { id: 'diseno', label: 'Diseño de pruebas', icon: ClipboardList, permissions: ['testdesign.view'] },
  { id: 'planificacion', label: 'Planificación de pruebas', icon: GitBranch, permissions: ['testplanning.view'] },
  { id: 'ejecuciones', label: 'Ejecuciones', icon: History, permissions: ['executions.view'] },
  { id: 'configuracion', label: 'Configuración', icon: Settings, permissions: ['projects.view'] },
  { id: 'servicios', label: 'Catálogo de servicios', icon: KeyRound, permissions: ['services.view'] },
  { id: 'usuarios', label: 'Usuarios', icon: Users, permissions: ['admin.users', 'admin.roles'] },
];

const TIPS: { view: string; title: string; text: string }[] = [
  { view: 'grabacion', title: 'Limpia tu grabación', text: 'Desplega los pasos y usa «Editar pasos» para quitar los que sobren antes de lanzar.' },
  { view: 'grabacion', title: 'Revisa los datos', text: 'Los campos pendientes bloquean la ejecución: complétalos antes de reproducir.' },
  { view: 'diseno', title: 'Casos desde Jira', text: 'Genera casos con IA desde una historia de Jira, edítalos y publícalos.' },
  { view: 'execute', title: 'Lanza con contexto', text: 'Asocia la ejecución a su historia de Jira para que el checklist quede trazable.' },
  { view: 'ejecuciones', title: 'Aprende de los fallos', text: 'Abre el checklist de defectos de cada corrida y reporta los bugs con su evidencia.' },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const { canAny, user, roles } = useAuth();
  // The engine enforces these permissions on API calls as well.
  const visible = items.filter(
    item => canAny(...item.permissions),
  );
  // Carousel over the tips for modules this user can open; pauses while the pointer is over it.
  const [tipIndex, setTipIndex] = useState(0);
  const [tipPaused, setTipPaused] = useState(false);
  const tips = TIPS.filter(candidate => visible.some(item => item.id === candidate.view));
  useEffect(() => {
    if (tipPaused || tips.length < 2) return;
    const timer = setInterval(() => setTipIndex(index => index + 1), 8000);
    return () => clearInterval(timer);
  }, [tipPaused, tips.length]);
  const tip = tips.length ? tips[tipIndex % tips.length] : undefined;

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
        {visible.map(it => {
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

      {tip && (
        <div
          onMouseEnter={() => setTipPaused(true)}
          onMouseLeave={() => setTipPaused(false)}
          className="p-3 mx-3 mb-3 rounded-xl border border-[#E8EBEC] bg-gradient-to-br from-[#F4F1EA] to-white relative overflow-hidden"
        >
          <div className="absolute -right-2 -top-2 w-12 h-12 rounded-full opacity-20" style={{ background: C.green }} />
          <div className="relative">
            <Sparkles size={14} className="text-[#48A157]" />
            <div className="text-[11px] font-semibold text-[#1a1f2e] mt-1.5 leading-tight">{tip.title}</div>
            <div className="text-[10px] text-[#58646D] mt-0.5 leading-snug">{tip.text}</div>
            <button type="button" onClick={() => onChange(tip.view)} className="mt-2 text-[10px] font-medium text-[#104B99] hover:underline">Ir ahora</button>
          </div>
        </div>
      )}

      <div className="p-3 mx-3 mb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#104B99] to-[#48A157] flex items-center justify-center text-white text-[11px] font-semibold shrink-0">{initials(user?.fullName ?? '')}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-[#1a1f2e] truncate">{user?.fullName ?? 'Invitado'}</div>
          <div className="text-[10px] text-[#8B999D] truncate">{roles[0]?.name ?? 'Sin rol'}</div>
        </div>
      </div>
    </aside>
  );
}
