import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, LayoutGrid, Rocket, Video, History, Settings, Users, Plus, Activity, CircleCheck, CircleX, type LucideIcon } from 'lucide-react';
import { cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import type { PermissionKey } from '../../auth/types';
import { loadDashboardData, type DashboardData } from '../../services/dashboard';
import type { ActiveRun, View } from '../../types';

interface GlobalSearchProps {
  onNavigate: (view: View) => void;
  onOpenRun: (run: ActiveRun) => void;
  onOpenExecution: (launchId: string) => void;
}

interface SearchItem {
  id: string;
  group: 'Ir a' | 'Acciones' | 'En curso' | 'Ejecuciones';
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Lowercase, accent-free text the query is matched against. */
  haystack: string;
  run: () => void;
}

const DATA_TTL_MS = 30_000;
const GROUP_ORDER: SearchItem['group'][] = ['Ir a', 'Acciones', 'En curso', 'Ejecuciones'];
const MAX_PER_GROUP_WITH_QUERY = 6;
const MAX_PER_GROUP_EMPTY = 3;
const SEARCH_SHORTCUT = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(', ', ' ');
};

const SECTIONS: { id: View; label: string; icon: LucideIcon; permissions: PermissionKey[] }[] = [
  { id: 'dashboard', label: 'Panorama', icon: LayoutGrid, permissions: ['dashboard.view'] },
  { id: 'execute', label: 'Lanzar pruebas', icon: Rocket, permissions: ['tests.launch'] },
  { id: 'grabacion', label: 'Grabación', icon: Video, permissions: ['recordings.view', 'recordings.create'] },
  { id: 'ejecuciones', label: 'Ejecuciones', icon: History, permissions: ['executions.view'] },
  { id: 'configuracion', label: 'Configuración', icon: Settings, permissions: ['projects.view'] },
  { id: 'usuarios', label: 'Usuarios', icon: Users, permissions: ['admin.users', 'admin.roles'] },
];

/**
 * Inline global search for the top bar (Ctrl+K / ⌘K focuses it). Sections and actions respect the same
 * permissions as the sidebar; runs and executions come from the dashboard data the Panorama loads.
 * Results drop down under the field itself -- no modal.
 */
export function GlobalSearch({ onNavigate, onOpenRun, onOpenExecution }: GlobalSearchProps) {
  const { canAny } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadedAt = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setQuery(''); inputRef.current?.blur(); };

  // Ctrl/⌘+K focuses the field from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Load runs/executions the first time the field opens, then reuse for DATA_TTL_MS.
  useEffect(() => {
    if (!open || Date.now() - loadedAt.current < DATA_TTL_MS) return;
    let cancelled = false;
    loadDashboardData()
      .then((loaded) => {
        if (cancelled) return;
        loadedAt.current = Date.now();
        setData(loaded);
        setLoadError(false);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [open]);

  const items = useMemo<SearchItem[]>(() => {
    const go = (view: View) => () => { close(); onNavigate(view); };
    const list: SearchItem[] = [];
    for (const section of SECTIONS) {
      if (!canAny(...section.permissions)) continue;
      list.push({ id: `nav:${section.id}`, group: 'Ir a', label: section.label, icon: section.icon, haystack: normalize(section.label), run: go(section.id) });
    }
    if (canAny('tests.launch')) {
      list.push({ id: 'act:launch', group: 'Acciones', label: 'Nueva ejecución', hint: 'Lanzar pruebas', icon: Plus, haystack: normalize('nueva ejecucion lanzar pruebas ejecutar'), run: go('execute') });
    }
    if (canAny('recordings.create')) {
      list.push({ id: 'act:record', group: 'Acciones', label: 'Nueva grabación', hint: 'Grabar un recorrido', icon: Plus, haystack: normalize('nueva grabacion grabar recorrido'), run: go('grabacion') });
    }
    for (const run of data?.activeRuns ?? []) {
      list.push({
        id: `run:${run.id}`,
        group: 'En curso',
        label: run.currentTest || run.project,
        hint: `${run.project} · ${run.progress}%`,
        icon: Activity,
        haystack: normalize(`${run.project} ${run.currentTest} ${run.id} ${run.jobId ?? ''}`),
        run: () => { close(); onOpenRun(run); },
      });
    }
    if (canAny('executions.view')) {
      for (const execution of data?.executions ?? []) {
        const failed = execution.failed > 0;
        list.push({
          id: `exec:${execution.launchId}`,
          group: 'Ejecuciones',
          label: execution.huTitle || execution.huKey || execution.appSlug,
          hint: `${execution.appSlug} · ${execution.passed} ok · ${execution.failed} fallo · ${formatDate(execution.createdAt)}`,
          icon: failed ? CircleX : CircleCheck,
          haystack: normalize(`${execution.huTitle ?? ''} ${execution.huKey ?? ''} ${execution.appSlug} ${execution.launchId} ${execution.status} ${failed ? 'fallida fallo' : 'exitosa paso'}`),
          run: () => { close(); onOpenExecution(execution.launchId); },
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAny, data, onNavigate, onOpenExecution, onOpenRun]);

  const results = useMemo<SearchItem[]>(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    const cap = tokens.length ? MAX_PER_GROUP_WITH_QUERY : MAX_PER_GROUP_EMPTY;
    const out: SearchItem[] = [];
    for (const group of GROUP_ORDER) {
      const matches = items.filter((item) => item.group === group && tokens.every((token) => item.haystack.includes(token)));
      out.push(...matches.slice(0, cap));
    }
    return out;
  }, [items, query]);

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) setOpen(true);
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((index) => Math.min(index + 1, Math.max(results.length - 1, 0))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); results[selected]?.run(); }
  };

  let lastGroup: string | null = null;
  return (
    <div ref={rootRef} className="relative">
      <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
      <input
        ref={inputRef}
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-label="Buscar"
        placeholder="Buscar..."
        autoComplete="off"
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-48 rounded-full border bg-[#FAFAF7] py-1.5 pl-9 pr-14 text-[12px] outline-none transition-all placeholder:text-[#BABEC3] focus:w-72 focus:bg-white',
          open ? 'border-[#104B99]' : 'border-transparent hover:border-[#104B99]/30',
        )}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E8EBEC] bg-white px-1 py-0.5 text-[9px] text-[#BABEC3]">{SEARCH_SHORTCUT}</kbd>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[420px] overflow-hidden rounded-2xl border border-[#E8EBEC] bg-white shadow-[0_18px_44px_-18px_rgba(26,31,46,0.4)]">
          <div ref={listRef} role="listbox" className="max-h-[340px] overflow-y-auto p-2">
            {results.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-[#8B999D]">
                {query ? `Sin resultados para “${query}”.` : 'Escribe para buscar.'}
              </div>
            )}
            {results.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {showGroup && <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">{item.group}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    data-index={index}
                    onMouseMove={() => setSelected(index)}
                    onClick={item.run}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors', index === selected ? 'bg-[#F1F6FD]' : 'hover:bg-[#FAFAF7]')}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', index === selected ? 'bg-[#104B99] text-white' : 'bg-[#F4F1EA] text-[#58646D]')}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#1a1f2e]">{item.label}</span>
                      {item.hint && <span className="block truncate text-[11px] text-[#8B999D]">{item.hint}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
            {loadError && <div className="px-3 py-2 text-[11px] text-[#B4463C]">No se pudieron cargar las ejecuciones; solo se muestran secciones y acciones.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
