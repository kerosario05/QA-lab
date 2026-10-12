import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, ClipboardList, Loader2, Plus } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import { testDesignApi, type TestDesignDraftSummary, type TestDesignProject } from '../../services/test-design';
import { initialProjectFilter } from './scenario-utils';
import { ProjectFilter } from './ProjectFilter';

interface DraftsListProps {
  onOpen: (draftId: string) => void;
  /** Opens a new design, preselecting the project currently filtered (if any). */
  onNew: (projectSlug?: string) => void;
}

/** Remembered per browser: a convenience, never required (private windows and blocked storage just forget it). */
const FILTER_STORAGE_KEY = 'qa-lab.test-design.project-filter';

function readStoredFilter(): string {
  try {
    return localStorage.getItem(FILTER_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeFilter(value: string): void {
  try {
    if (value) localStorage.setItem(FILTER_STORAGE_KEY, value);
    else localStorage.removeItem(FILTER_STORAGE_KEY);
  } catch {
    // storage unavailable: the filter simply is not remembered
  }
}


const STATUS_LABELS: Record<TestDesignDraftSummary['status'], { text: string; className: string }> = {
  draft: { text: 'Borrador', className: 'bg-[#F4F1EA] text-[#58646D]' },
  partially_published: { text: 'Publicado en parte', className: 'bg-[#EEF3FA] text-[#104B99]' },
  published: { text: 'Publicado', className: 'bg-[#E9F5EB] text-[#2F7A3B]' },
  archived: { text: 'Archivado', className: 'bg-[#F0F1F2] text-[#8B999D]' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function DraftsList({ onOpen, onNew }: DraftsListProps) {
  const { can } = useAuth();
  const [drafts, setDrafts] = useState<TestDesignDraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [projects, setProjects] = useState<TestDesignProject[] | null>(null);
  /** '' = every project the user may see. null until the projects are known. */
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    testDesignApi
      .listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectFilter(initialProjectFilter(list, readStoredFilter()));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setProjects([]);
        setProjectFilter('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drafts load once the filter is settled, so a single-project user never fetches everything first.
  useEffect(() => {
    if (projectFilter === null) return;
    let cancelled = false;
    testDesignApi
      .listDrafts({ mine, projectSlug: projectFilter || undefined })
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [mine, projectFilter]);

  function chooseProject(value: string) {
    if (value === projectFilter) return;
    setDrafts(null);
    setProjectFilter(value);
    storeFilter(value);
  }

  const projectName = (slug: string | null) => projects?.find((p) => p.slug === slug)?.name ?? slug ?? '—';

  async function archive(draft: TestDesignDraftSummary) {
    if (!window.confirm(`¿Archivar el borrador de ${draft.issueKeys.join(', ')}? Lo publicado no se toca.`)) return;
    setBusyId(draft.id);
    try {
      await testDesignApi.archiveDraft(draft.id);
      setDrafts((list) => list?.filter((d) => d.id !== draft.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-3">
          {/* Project filter: fixed when the user has one project, a menu when several. */}
          {projects && <ProjectFilter projects={projects} value={projectFilter ?? ''} onChange={chooseProject} />}
          <div className="flex items-center gap-1 bg-white border border-[#E8EBEC] rounded-full p-1">
            {[
              { value: false, label: 'Todos' },
              { value: true, label: 'Míos' },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => {
                  if (option.value === mine) return;
                  setDrafts(null);
                  setMine(option.value);
                }}
                className={cn(
                  'px-4 py-1.5 rounded-full text-[12px] font-medium transition',
                  mine === option.value ? 'bg-[#1a1f2e] text-white' : 'text-[#58646D] hover:text-[#1a1f2e]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          </div>
          {can('testdesign.generate') && (
            <button
              onClick={() => onNew(projectFilter || undefined)}
              className="bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5"
            >
              <Plus size={13} /> Nuevo diseño
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C] flex items-center gap-2">
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {drafts === null && !error && (
          <div className="py-16 flex items-center justify-center gap-2 text-[13px] text-[#8B999D]">
            <Loader2 size={14} className="animate-spin" /> Cargando borradores…
          </div>
        )}

        {drafts && drafts.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E8EBEC] py-16 flex flex-col items-center gap-3 text-center">
            <ClipboardList size={28} className="text-[#BABEC3]" />
            <div className="text-[14px] font-medium text-[#1a1f2e]">
              {projects?.length === 0
                ? 'No tienes proyectos asignados'
                : projectFilter
                  ? `Todavía no hay diseños de prueba en ${projectName(projectFilter)}`
                  : 'Todavía no hay diseños de prueba'}
            </div>
            <div className="text-[12px] text-[#8B999D] max-w-sm">
              {projects?.length === 0
                ? 'Pide a un administrador que te asigne un proyecto para diseñar pruebas.'
                : 'Elige historias de Jira, genera los casos con IA, edítalos y publícalos en TestRail.'}
            </div>
            {can('testdesign.generate') && projects?.length !== 0 && (
              <button
                onClick={() => onNew(projectFilter || undefined)}
                className="mt-2 bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5"
              >
                <Plus size={13} /> Nuevo diseño
              </button>
            )}
          </div>
        )}

        {drafts && drafts.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8EBEC] divide-y divide-[#F0F1F2] overflow-hidden">
            {drafts.map((draft) => {
              const status = STATUS_LABELS[draft.status];
              return (
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(draft.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(draft.id)}
                  className="group px-5 py-4 flex items-center gap-4 hover:bg-[#FAFAF7] cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#1a1f2e] truncate">
                        {draft.title || draft.issueKeys.join(', ')}
                      </span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', status.className)}>
                        {status.text}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8B999D] mt-0.5">
                      {!projectFilter && draft.projectSlug ? `${projectName(draft.projectSlug)} · ` : ''}Jira {draft.jiraProjectKey} · {draft.storyCount} {draft.storyCount === 1 ? 'historia' : 'historias'} ·{' '}
                      {draft.scenarioCount} casos · {draft.createdByName ?? '—'} · {formatDate(draft.updatedAt)}
                    </div>
                  </div>
                  {can('testdesign.generate') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void archive(draft);
                      }}
                      disabled={busyId === draft.id}
                      title="Archivar"
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center text-[#8B999D] hover:bg-[#F4F1EA] hover:text-[#1a1f2e]"
                    >
                      {busyId === draft.id ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
