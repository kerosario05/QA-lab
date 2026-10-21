import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import type { ActiveRun, View } from '../../types';

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Targets of the inline global search results. */
  onNavigate: (view: View) => void;
  onOpenRun: (run: ActiveRun) => void;
  onOpenExecution: (launchId: string) => void;
}

export function Topbar({ title, subtitle, action, onNavigate, onOpenRun, onOpenExecution }: TopbarProps) {
  const { user, logout } = useAuth();
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-[#E8EBEC] px-8 py-3 flex items-center justify-between sticky top-0 z-10">
      <div>
        <div className="flex items-center gap-2 text-[10px] text-[#8B999D]">
          <span className="w-1 h-1 rounded-full bg-[#48A157] animate-pulse" />
          <span className="uppercase tracking-[0.15em] font-medium">
            En vivo · {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
          </span>
          {subtitle && <span className="text-[#BABEC3]">·</span>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        <h1 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <GlobalSearch onNavigate={onNavigate} onOpenRun={onOpenRun} onOpenExecution={onOpenExecution} />
        <NotificationBell onOpenExecution={onOpenExecution} />
        {action}
        <button
          onClick={() => void logout()}
          title={user ? `Cerrar sesión de ${user.username}` : 'Cerrar sesión'}
          className="p-1.5 hover:bg-[#FEF2F2] rounded-full transition text-[#58646D] hover:text-[#DC2626]"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
