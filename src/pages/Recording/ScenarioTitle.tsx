import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import type { RecordedScenario, ScenarioTitleReview } from '../../services/recordings/types';

export const MIN_SCENARIO_TITLE_LENGTH = 5;

/**
 * A scenario's title with an inline rename, plus what the engine found about it: another
 * scenario or promoted case with the same name, or a title that is only the text typed before
 * recording. It never renames by itself — two recordings of the same flow share a title on
 * purpose, and only the reviewer knows whether one of them is a repeat.
 */
export function ScenarioTitle({
  scenario,
  review,
  onActivate,
  onRename,
}: {
  scenario: RecordedScenario;
  review?: ScenarioTitleReview;
  onActivate: () => void;
  /** Resolves with an error message, or null when the rename was saved. */
  onRename?: (title: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scenario.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(scenario.title);
  }, [scenario.title, editing]);

  const cancel = () => {
    setEditing(false);
    setDraft(scenario.title);
    setError(null);
  };

  const save = async () => {
    const title = draft.trim().replace(/\s+/g, ' ');
    if (title === scenario.title) {
      cancel();
      return;
    }
    if (title.length < MIN_SCENARIO_TITLE_LENGTH) {
      setError(`El título debe tener al menos ${MIN_SCENARIO_TITLE_LENGTH} caracteres`);
      return;
    }
    if (!onRename) return;
    setSaving(true);
    const failure = await onRename(title);
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <div className="flex-1 min-w-[240px]">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancel();
            }}
            disabled={saving}
            maxLength={250}
            aria-label="Título del escenario"
            className="flex-1 px-2 py-1 rounded-md border border-[#104B99] text-[13px] outline-none"
          />
          <button type="button" onClick={() => void save()} disabled={saving} title="Guardar título" className="p-1 rounded text-[#48A157] hover:bg-[#EEF7F0] disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button type="button" onClick={cancel} disabled={saving} title="Cancelar" className="p-1 rounded text-[#58646D] hover:bg-[#F2F4F5] disabled:opacity-50">
            <X size={13} />
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] text-[#B4463C]">{error}</p>}
      </div>
    );
  }

  const duplicates = review?.conflicts ?? [];
  return (
    <>
      <button type="button" onClick={onActivate} className="text-[13px] font-medium text-[#1a1f2e] text-left">
        {scenario.title}
      </button>
      {onRename && (
        <button type="button" onClick={() => setEditing(true)} title="Renombrar escenario" aria-label="Renombrar escenario" className="p-0.5 rounded text-[#8B999D] hover:text-[#104B99] hover:bg-[#EEF2F8]">
          <Pencil size={11} />
        </button>
      )}
      {scenario.titleEditedByUser && (
        <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#58646D]">Renombrado</span>
      )}
      {duplicates.length > 0 && (
        <span
          title={`Mismo título que:\n${duplicates.map((conflict) => `• ${conflict.source === 'case' ? 'Caso' : 'Escenario'} ${conflict.id}: ${conflict.title}`).join('\n')}`}
          className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FFF6E5] text-[#A36A00]"
        >
          Título repetido ({duplicates.length})
        </span>
      )}
      {review?.weak && (
        <span
          title="El título es solo el texto escrito antes de grabar y no describe el caso. Renómbralo."
          className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FFF6E5] text-[#A36A00]"
        >
          Título genérico
        </span>
      )}
    </>
  );
}
