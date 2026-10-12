import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, ClipboardList, Loader2, Plus } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import { testDesignApi, type TestDesignDraftSummary } from '../../services/test-design';

interface DraftsListProps {
  onOpen: (draftId: string) => void;
  onNew: () => void;
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

  useEffect(() => {
    let cancelled = false;
    testDesignApi
      .listDrafts({ mine })
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [mine]);

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
        <div className="flex items-center justify-between mb-5">
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
          {can('testdesign.generate') && (
            <button
              onClick={onNew}
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
            <div className="text-[14px] font-medium text-[#1a1f2e]">Todavía no hay diseños de prueba</div>
            <div className="text-[12px] text-[#8B999D] max-w-sm">
              Elige historias de Jira, genera los casos con IA, edítalos y publícalos en TestRail y Jira.
            </div>
            {can('testdesign.generate') && (
              <button
                onClick={onNew}
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
                      Jira {draft.jiraProjectKey} · {draft.storyCount} {draft.storyCount === 1 ? 'historia' : 'historias'} ·{' '}
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
