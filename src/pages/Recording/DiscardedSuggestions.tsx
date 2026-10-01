import { useState } from 'react';
import type { SemanticRecordingModel } from '../../services/recordings/types';
import { rejectionReasonLabel } from './derivation-feedback';

type AiGeneration = NonNullable<SemanticRecordingModel['aiGeneration']>;

/**
 * Everything the generation considered and did not keep, with its reason. Before this, a
 * regeneration whose suggestions were all discarded looked exactly like one that never ran
 * (recording 2920301b: 3 proposals, 0 shown, no explanation). A reviewer may keep a discarded
 * suggestion as a draft: documentation of an idea, never executed or published.
 */
export function DiscardedSuggestions({
  aiGeneration,
  keptTitles,
  onKeep,
}: {
  aiGeneration: AiGeneration | undefined;
  keptTitles: ReadonlySet<string>;
  onKeep: (candidateId: string) => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const discarded = (aiGeneration?.candidates ?? []).filter((candidate) => candidate.finalDecision === 'rejected');
  const notProposed = aiGeneration?.providerRejected ?? [];
  if (discarded.length === 0 && notProposed.length === 0) return null;

  const keep = async (candidateId: string) => {
    setPendingId(candidateId);
    setError(null);
    try {
      await onKeep(candidateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <details className="mt-4 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] p-3" data-testid="discarded-suggestions">
      <summary className="cursor-pointer select-none text-[12px] font-medium text-[#104B99]">
        Sugerencias descartadas · {discarded.length}
        {notProposed.length > 0 ? ` · ${notProposed.length} ideas que la IA no propuso` : ''}
      </summary>
      <p className="mt-2 text-[11px] text-[#58646D]">
        El filtro de calidad no las convirtió en escenarios. Puedes guardar una como borrador: queda documentada, pero no se ejecuta ni se publica hasta que se grabe.
      </p>
      {discarded.length > 0 && (
        <ul className="mt-2 space-y-2">
          {discarded.map((candidate) => {
            const kept = keptTitles.has(candidate.title);
            return (
              <li key={candidate.candidateId ?? candidate.title} className="rounded-lg border border-[#E3EAF2] bg-white px-3 py-2">
                <div className="text-[12px] font-medium text-[#1a1f2e]">{candidate.title}</div>
                <div className="mt-0.5 text-[11px] text-[#B4463C]">Descartada: {rejectionReasonLabel(candidate.rejectionReason)}</div>
                {candidate.rationale && <div className="mt-1 text-[11px] text-[#58646D]">{candidate.rationale}</div>}
                {candidate.candidateId && (
                  <button
                    type="button"
                    disabled={kept || pendingId !== null}
                    onClick={() => void keep(candidate.candidateId!)}
                    className="mt-2 rounded-full border border-[#104B99] px-3 py-1 text-[11px] font-semibold text-[#104B99] transition hover:bg-[#EEF3FA] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {kept ? 'Guardada como borrador' : pendingId === candidate.candidateId ? 'Guardando…' : 'Guardar como borrador'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notProposed.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#58646D]">Ideas que la IA no propuso</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-[#58646D]">
            {notProposed.map((entry, index) => <li key={index}>{entry.reason}</li>)}
          </ul>
        </div>
      )}
      {error && <div className="mt-2 text-[11px] text-[#B4463C]">{error}</div>}
    </details>
  );
}
