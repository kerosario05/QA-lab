import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CircleCheck, CircleX, CircleSlash } from 'lucide-react';
import { cn } from '../../constants/theme';

interface NotificationBellProps {
  /** Opens the finished execution's detail (launch id). */
  onOpenExecution: (launchId: string) => void;
}

interface JobRecord {
  id: string;
  type: string;
  status: string;
  params?: Record<string, unknown>;
  createdAt?: string;
  completedAt?: string;
  summary?: Record<string, unknown>;
  currentCaseTitle?: string | null;
}

interface AppNotification {
  id: string;
  launchId: string;
  kind: 'passed' | 'failed' | 'cancelled';
  title: string;
  detail: string;
  at: string;
  read: boolean;
}

interface StoredState {
  seen: string[];
  items: AppNotification[];
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const STORAGE_KEY = 'qalab.notifications.v1';
const POLL_MS = 10_000;
const MAX_ITEMS = 30;
const MAX_SEEN = 300;
/** Same job types the Panorama lists as executions. */
const EXECUTION_JOB_TYPES = new Set(['discovery-batch', 'scenario-preview', 'sprint', 'mobile-test-run', 'mobile-launch-execution']);
const TYPE_TITLES: Record<string, string> = {
  'discovery-batch': 'Descubrimiento de casos',
  'scenario-preview': 'Ejecución de escenarios',
  sprint: 'Ejecución de sprint',
  'mobile-test-run': 'Ejecución móvil',
  'mobile-launch-execution': 'Ejecución móvil',
};

const asCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const isTerminal = (job: JobRecord): boolean => job.status !== 'queued' && job.status !== 'running' && EXECUTION_JOB_TYPES.has(job.type);

function toNotification(job: JobRecord): AppNotification {
  const params = job.params ?? {};
  const summary = job.summary ?? {};
  const passed = asCount(summary.passed);
  const failed = asCount(summary.failed);
  const status = job.status.toLowerCase();
  const kind: AppNotification['kind'] = /cancel|stop/.test(status) ? 'cancelled' : failed > 0 || /fail|error/.test(status) ? 'failed' : 'passed';
  const title = [job.currentCaseTitle, params.huTitle, params.scenarioTitle, params.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? TYPE_TITLES[job.type] ?? 'Ejecución';
  const project = typeof (params.appSlug ?? params.projectSlug) === 'string' ? String(params.appSlug ?? params.projectSlug) : '';
  const verdict = kind === 'cancelled' ? 'Cancelada' : kind === 'failed' ? 'Falló' : 'Terminó bien';
  return {
    id: job.id,
    launchId: typeof params.launchId === 'string' ? params.launchId : job.id,
    kind,
    title,
    detail: [verdict, project, `${passed} ok · ${failed} fallo`].filter(Boolean).join(' · '),
    at: job.completedAt ?? job.createdAt ?? new Date().toISOString(),
    read: false,
  };
}

function ago(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

function readStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    return Array.isArray(parsed.seen) && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seen: state.seen.slice(-MAX_SEEN), items: state.items.slice(0, MAX_ITEMS) }));
  } catch { /* storage unavailable: notifications just last for this session */ }
}

const KIND_ICON = { passed: CircleCheck, failed: CircleX, cancelled: CircleSlash } as const;
const KIND_COLOR = { passed: 'text-[#48A157]', failed: 'text-[#DC2626]', cancelled: 'text-[#8B999D]' } as const;

/**
 * Bell for finished executions. There is no notifications endpoint, so it watches the jobs list: the
 * first load only records what already finished (no flood), and every job that reaches a terminal
 * state afterwards becomes an unread notification, kept in localStorage.
 */
export function NotificationBell({ onOpenExecution }: NotificationBellProps) {
  const [state, setState] = useState<StoredState>(() => readStored() ?? { seen: [], items: [] });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(readStored() !== null);

  const poll = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const response = await fetch(`${API_BASE}/api/runs`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as { jobs?: JobRecord[] };
      const finished = (body.jobs ?? []).filter(isTerminal);
      setState((current) => {
        const seen = new Set(current.seen);
        const fresh = finished.filter((job) => !seen.has(job.id));
        if (fresh.length === 0 && initialized.current) return current;
        // First run ever: only baseline what already finished.
        const created = initialized.current ? fresh.map(toNotification) : [];
        initialized.current = true;
        const next: StoredState = {
          seen: [...current.seen, ...fresh.map((job) => job.id)],
          items: [...created.sort((a, b) => b.at.localeCompare(a.at)), ...current.items].slice(0, MAX_ITEMS),
        };
        writeStored(next);
        return next;
      });
    } catch { /* backend unreachable: try again next tick */ }
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const update = (mutate: (items: AppNotification[]) => AppNotification[]) =>
    setState((current) => {
      const next = { ...current, items: mutate(current.items) };
      writeStored(next);
      return next;
    });

  const unread = state.items.filter((item) => !item.read).length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-full p-1.5 transition hover:bg-[#FAFAF7]"
      >
        <Bell size={15} className="text-[#58646D]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#48A157] px-1 text-[8px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[360px] overflow-hidden rounded-2xl border border-[#E8EBEC] bg-white shadow-[0_18px_44px_-18px_rgba(26,31,46,0.4)]">
          <div className="flex items-center justify-between border-b border-[#E8EBEC] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[#1a1f2e]">Notificaciones</span>
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => update((items) => items.map((item) => ({ ...item, read: true })))}
              className="text-[11px] text-[#104B99] hover:underline disabled:cursor-default disabled:text-[#BABEC3] disabled:no-underline"
            >
              Marcar todo como leído
            </button>
          </div>
          <div className="max-h-[340px] overflow-y-auto p-1.5">
            {state.items.length === 0 && (
              <div className="px-3 py-8 text-center text-[12px] text-[#8B999D]">Sin notificaciones. Te avisaremos cuando termine una ejecución.</div>
            )}
            {state.items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    update((items) => items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
                    setOpen(false);
                    onOpenExecution(item.launchId);
                  }}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#FAFAF7]', !item.read && 'bg-[#F7FBF8]')}
                >
                  <Icon size={16} className={cn('mt-0.5 shrink-0', KIND_COLOR[item.kind])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#1a1f2e]">{item.title}</span>
                    <span className="block truncate text-[11px] text-[#8B999D]">{item.detail}</span>
                    <span className="block text-[10px] text-[#BABEC3]">{ago(item.at)}</span>
                  </span>
                  {!item.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#48A157]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
