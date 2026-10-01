import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { recordingsApi } from '../../services/recordings';
import type { GoalCoverage } from '../../services/recordings/types';
import { goalCoverageMessage } from './goal-coverage-message';

/**
 * Says whether the recording completes its declared goal and, when it does not, offers the three
 * honest ways out: adjust the goal to what was done, record what is missing, or accept it as is.
 */
export function GoalCoverageNotice({
  recordingId,
  projectSlug,
  refreshKey,
  onRecordMissing,
}: {
  recordingId: string;
  projectSlug: string;
  /** Changes whenever the recording may have changed (stop, regeneration). */
  refreshKey: string;
  /** Prepares a new recording with this goal; `missingSteps` says what it has to include. */
  onRecordMissing: (goal: string, missingSteps: string[]) => void;
}) {
  const [coverage, setCoverage] = useState<GoalCoverage | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    recordingsApi.goalCoverage(recordingId, projectSlug)
      .then((result) => { if (current) setCoverage(result.coverage); })
      // The notice is advisory: an engine without the endpoint simply shows nothing.
      .catch(() => { if (current) setCoverage(null); });
    return () => { current = false; };
  }, [recordingId, projectSlug, refreshKey]);

  const update = useCallback(async (change: { goal?: string; acknowledgeCoverage?: boolean }, done: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await recordingsApi.updateGoal(recordingId, projectSlug, change);
      setCoverage(result.coverage);
      setEditing(false);
      setInfo(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [recordingId, projectSlug]);

  const message = goalCoverageMessage(coverage);
  if (!message || !coverage?.goal) return null;
  const goal = coverage.goal;

  const box = message.tone === 'warning'
    ? 'border-[#F0D9A8] bg-[#FDF7EA] text-[#8A5A00]'
    : message.tone === 'ok'
      ? 'border-[#CFE7D2] bg-[#F3F9F4] text-[#34773D]'
      : 'border-[#E3EAF2] bg-white text-[#58646D]';

  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-[12px] ${box}`} data-testid="goal-coverage-notice" aria-live="polite">
      <div className="flex items-start gap-2">
        {message.tone === 'warning' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{message.headline}</div>
          {message.details.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
              {message.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          )}

          {editing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={draftGoal}
                onChange={(event) => setDraftGoal(event.target.value)}
                aria-label="Nuevo objetivo"
                className="min-w-[220px] flex-1 rounded-lg border border-[#E8EBEC] bg-white px-2 py-1 text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99]"
              />
              <button
                type="button"
                disabled={busy || draftGoal.trim().length < 5 || draftGoal.trim() === goal}
                onClick={() => void update({ goal: draftGoal.trim() }, 'Objetivo actualizado. Regenera los escenarios para aplicarlo.')}
                className="rounded-full bg-[#104B99] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                Guardar
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-medium text-[#58646D] hover:underline">
                Cancelar
              </button>
            </div>
          ) : message.tone === 'warning' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setDraftGoal(goal); setEditing(true); setInfo(null); }}
                className="rounded-full border border-[#104B99] bg-white px-3 py-1 text-[11px] font-semibold text-[#104B99] hover:bg-[#EEF3FA]"
              >
                Ajustar objetivo
              </button>
              <button
                type="button"
                onClick={() => {
                  onRecordMissing(goal, message.missingSteps);
                  setInfo(message.missingSteps.length > 0
                    ? `Inicia una grabación nueva y esta vez recuerda ${message.missingSteps.join('; ')}.`
                    : 'Inicia una grabación nueva que complete el objetivo.');
                }}
                className="rounded-full border border-[#104B99] bg-white px-3 py-1 text-[11px] font-semibold text-[#104B99] hover:bg-[#EEF3FA]"
              >
                Grabar lo que falta
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void update({ acknowledgeCoverage: true }, 'Aceptado. Los escenarios se quedan como documentación de lo que se hizo.')}
                className="rounded-full border border-[#8B999D] bg-white px-3 py-1 text-[11px] font-semibold text-[#58646D] hover:bg-[#F4F5F5] disabled:opacity-50"
              >
                Aceptar como está
              </button>
            </div>
          ) : message.tone === 'acknowledged' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void update({ acknowledgeCoverage: false }, 'Aviso restaurado.')}
              className="mt-1 text-[11px] font-medium text-[#104B99] hover:underline disabled:opacity-50"
            >
              Deshacer
            </button>
          ) : null}

          {info && <div className="mt-2 text-[11px] text-[#58646D]">{info}</div>}
          {error && <div className="mt-2 text-[11px] text-[#B4463C]">{error}</div>}
        </div>
      </div>
    </div>
  );
}
