import { useEffect, useRef, useState } from 'react';
import { Boxes, Check, ChevronDown, Layers } from 'lucide-react';
import { cn } from '../../constants/theme';
import type { TestDesignProject } from '../../services/test-design';

/**
 * Project filter for the drafts list.
 *
 * A pill that opens a small menu: "Todos mis proyectos" first, then each project
 * with its type and how many designs it has (as a badge, not in the label). With a
 * single project there is nothing to choose, so it renders as a fixed pill.
 */

interface ProjectFilterProps {
  projects: TestDesignProject[];
  /** '' = all of them. */
  value: string;
  onChange: (slug: string) => void;
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        'min-w-[22px] text-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
        active ? 'bg-[#48A157] text-white' : 'bg-[#F0F1F2] text-[#58646D]',
      )}
    >
      {count}
    </span>
  );
}

export function ProjectFilter({ projects, value, onChange }: ProjectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (projects.length === 0) return null;

  if (projects.length === 1) {
    return (
      <span className="flex items-center gap-2 bg-white border border-[#E8EBEC] rounded-full pl-3 pr-3.5 py-2 text-[12px] font-semibold text-[#1a1f2e]">
        <span className="w-5 h-5 rounded-md bg-[#1a1f2e] flex items-center justify-center">
          <Boxes size={11} className="text-white" />
        </span>
        {projects[0].name}
      </span>
    );
  }

  const selected = projects.find((p) => p.slug === value) ?? null;
  const total = projects.reduce((sum, p) => sum + p.draftCount, 0);
  const choose = (slug: string) => {
    onChange(slug);
    setOpen(false);
  };

  const option = (key: string, label: string, sub: string | null, count: number, active: boolean, icon: React.ReactNode) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => choose(key === '__all__' ? '' : key)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition',
        active ? 'bg-[#F1F8F2]' : 'hover:bg-[#FAFAF7]',
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          active ? 'bg-[#48A157] text-white' : 'bg-[#F4F1EA] text-[#58646D]',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-semibold text-[#1a1f2e] truncate">{label}</span>
        {sub && <span className="block text-[10px] text-[#8B999D]">{sub}</span>}
      </span>
      <CountBadge count={count} active={active} />
      <Check size={13} className={cn('shrink-0', active ? 'text-[#48A157]' : 'text-transparent')} />
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 bg-white border rounded-full pl-1.5 pr-3 py-1.5 text-[12px] font-semibold text-[#1a1f2e] transition',
          open ? 'border-[#1a1f2e] shadow-[0_2px_16px_-8px_rgba(16,75,153,0.35)]' : 'border-[#E8EBEC] hover:border-[#BABEC3]',
        )}
      >
        <span className="w-6 h-6 rounded-full bg-[#1a1f2e] flex items-center justify-center">
          {selected ? <Boxes size={12} className="text-white" /> : <Layers size={12} className="text-white" />}
        </span>
        <span className="max-w-[220px] truncate">{selected ? selected.name : 'Todos mis proyectos'}</span>
        <CountBadge count={selected ? selected.draftCount : total} active={false} />
        <ChevronDown size={13} className={cn('text-[#8B999D] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-12px_rgba(26,31,46,0.25)] p-1.5"
        >
          {option('__all__', 'Todos mis proyectos', `${projects.length} proyectos`, total, value === '', <Layers size={13} />)}
          <div className="my-1 mx-2 h-px bg-[#F0F1F2]" />
          <div className="max-h-[300px] overflow-y-auto">
            {projects.map((p) =>
              option(
                p.slug,
                p.name,
                p.projectType === 2 ? 'Aplicación móvil' : 'Aplicación web',
                p.draftCount,
                value === p.slug,
                <Boxes size={13} />,
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
