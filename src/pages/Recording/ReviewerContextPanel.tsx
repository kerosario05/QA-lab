import { useEffect, useMemo, useState } from 'react';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenario, RecordingReviewerContext, ReviewerContext } from '../../services/recordings/types';

type Draft = { purpose: string; expectedOutcome: string; businessRules: string; testData: string; preconditions: string };

const EMPTY: Draft = { purpose: '', expectedOutcome: '', businessRules: '', testData: '', preconditions: '' };

export function toDraft(context: ReviewerContext | undefined): Draft {
  return {
    purpose: context?.purpose ?? '',
    expectedOutcome: context?.expectedOutcome ?? '',
    businessRules: context?.businessRules ?? '',
    testData: context?.testData ?? '',
    preconditions: (context?.preconditions ?? []).join('\n'),
  };
}

export function fromDraft(draft: Draft): ReviewerContext {
  return {
    purpose: draft.purpose.trim() || undefined,
    expectedOutcome: draft.expectedOutcome.trim() || undefined,
    businessRules: draft.businessRules.trim() || undefined,
    testData: draft.testData.trim() || undefined,
    preconditions: draft.preconditions.split('\n').map((line) => line.trim()).filter(Boolean),
  };
}

/** Values that look like secrets must not travel to TestRail. Advisory: the reviewer decides. */
export function looksLikeSecret(value: string): boolean {
  return /\b(contrase[ñn]a|password|clave|pin|otp|token)\b\s*[:=]/i.test(value);
}

/**
 * Business context for the recording or for one scenario: why the case exists, what the business
 * expects, the rules and data it needs. It leads the TestRail preconditions and guides the AI on
 * the next regeneration; it is never asserted by the replay or the spec.
 */
export function ReviewerContextPanel({
  recordingId,
  projectSlug,
  scenarios,
}: {
  recordingId: string;
  projectSlug: string;
  scenarios: RecordedScenario[];
}) {
  const [all, setAll] = useState<RecordingReviewerContext>({});
  const [scope, setScope] = useState('recording');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    recordingsApi.reviewerContext(recordingId, projectSlug)
      .then((result) => { if (current) setAll(result.context ?? {}); })
      .catch(() => { if (current) setAll({}); });
    return () => { current = false; };
  }, [recordingId, projectSlug]);

  const stored = scope === 'recording' ? all.recording : all.scenarios?.[scope];
  useEffect(() => { setDraft(toDraft(stored)); setInfo(null); setError(null); }, [scope, stored]);

  const withContext = useMemo(
    () => new Set(Object.keys(all.scenarios ?? {})),
    [all.scenarios],
  );
  const filledCount = (all.recording ? 1 : 0) + withContext.size;
  const secretWarning = looksLikeSecret(draft.testData) || looksLikeSecret(draft.preconditions);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await recordingsApi.updateReviewerContext(recordingId, projectSlug, scope, fromDraft(draft));
      setAll(result.context ?? {});
      setInfo('Guardado. Se incluye al publicar en TestRail y la IA lo usará al regenerar los escenarios.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-lg border border-[#E8EBEC] bg-white px-2 py-1.5 text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99]';
  const label = 'mt-2 block text-[11px] font-medium text-[#58646D]';

  return (
    <details className="mt-3 rounded-lg border border-[#E3EAF2] bg-white p-3" data-testid="reviewer-context">
      <summary className="cursor-pointer select-none text-[12px] font-medium text-[#104B99]">
        Contexto para escenarios de calidad{filledCount > 0 ? ` · ${filledCount} con contexto` : ''}
      </summary>
      <p className="mt-2 text-[11px] text-[#58646D]">
        Explica el propósito, las reglas y lo que el negocio espera. Va en las precondiciones de TestRail y orienta a la IA al regenerar. No cambia lo que valida la ejecución.
      </p>

      <label className={label} htmlFor="reviewer-context-scope">Aplica a</label>
      <select id="reviewer-context-scope" value={scope} onChange={(event) => setScope(event.target.value)} className={field}>
        <option value="recording">Toda la grabación{all.recording ? ' ✓' : ''}</option>
        {scenarios.filter((scenario) => scenario.reviewDraft !== true).map((scenario) => (
          <option key={scenario.scenarioId} value={scenario.scenarioId}>
            {scenario.title}{withContext.has(scenario.scenarioId) ? ' ✓' : ''}
          </option>
        ))}
      </select>
      {scope !== 'recording' && (
        <p className="mt-1 text-[10px] text-[#8B999D]">Se suma al contexto de toda la grabación; lo que escribas aquí tiene prioridad.</p>
      )}

      <label className={label} htmlFor="reviewer-context-purpose">Propósito</label>
      <textarea id="reviewer-context-purpose" rows={2} value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })}
        placeholder="Ej. Verificar que el cliente puede consultar el detalle de un préstamo antes de solicitarlo" className={field} />

      <label className={label} htmlFor="reviewer-context-outcome">Resultado esperado de negocio</label>
      <textarea id="reviewer-context-outcome" rows={2} value={draft.expectedOutcome} onChange={(event) => setDraft({ ...draft, expectedOutcome: event.target.value })}
        placeholder="Ej. Se muestran la tasa, el plazo y el botón Solicitar" className={field} />

      <label className={label} htmlFor="reviewer-context-rules">Reglas de negocio</label>
      <textarea id="reviewer-context-rules" rows={2} value={draft.businessRules} onChange={(event) => setDraft({ ...draft, businessRules: event.target.value })}
        placeholder="Ej. Solo clientes con cuenta activa pueden solicitar" className={field} />

      <label className={label} htmlFor="reviewer-context-data">Datos de prueba</label>
      <textarea id="reviewer-context-data" rows={2} value={draft.testData} onChange={(event) => setDraft({ ...draft, testData: event.target.value })}
        placeholder="Ej. Cliente persona física con préstamo preaprobado (sin contraseñas)" className={field} />

      <label className={label} htmlFor="reviewer-context-preconditions">Precondiciones (una por línea)</label>
      <textarea id="reviewer-context-preconditions" rows={3} value={draft.preconditions} onChange={(event) => setDraft({ ...draft, preconditions: event.target.value })}
        placeholder={'Ej. Kiosko en sucursal con conexión\nCatálogo de préstamos publicado'} className={field} />

      {secretWarning && (
        <p className="mt-2 text-[11px] text-[#B4463C]">Parece que hay una contraseña o clave: TestRail no es un lugar seguro para secretos. Quítala antes de guardar.</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void save()}
          className="rounded-full bg-[#104B99] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar contexto'}
        </button>
        {stored && (
          <button type="button" disabled={busy} onClick={() => setDraft(EMPTY)} className="text-[11px] font-medium text-[#58646D] hover:underline">
            Vaciar campos
          </button>
        )}
      </div>
      {info && <div className="mt-2 text-[11px] text-[#34773D]">{info}</div>}
      {error && <div className="mt-2 text-[11px] text-[#B4463C]">{error}</div>}
    </details>
  );
}
