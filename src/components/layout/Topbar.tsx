import { useState, useEffect } from 'react';
import { Search, Bell } from 'lucide-react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
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
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
          <input
            placeholder="Buscar..."
            className="bg-[#FAFAF7] border border-transparent focus:border-[#104B99] focus:bg-white rounded-full pl-9 pr-4 py-1.5 text-[12px] w-48 outline-none transition-all placeholder:text-[#BABEC3]"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#BABEC3] border border-[#E8EBEC] rounded px-1 py-0.5 bg-white">⌘K</kbd>
        </div>
        <button className="relative p-1.5 hover:bg-[#FAFAF7] rounded-full transition">
          <Bell size={15} className="text-[#58646D]" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#48A157] rounded-full" />
        </button>
        {action}
      </div>
    </header>
  );
}
