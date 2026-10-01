import type { RecordingDerivationProgress, RecordingDerivationStage } from '../../services/recordings/types';

/**
 * What the "generating" indicator shows after Stop.
 *
 * Two waits exist: Stop finishing the captures still queued (`stopping`), and the engine building
 * the steps in the background (`deriving`). Both used to be a single silent request; a long flow
 * looked frozen, or was cut by a 504 and read as an error while the engine kept working.
 */
export type GenerationProgress =
  | { kind: 'stopping'; pendingCaptures: number; events: number }
  | { kind: 'deriving'; derivation: RecordingDerivationProgress };

export type GenerationProgressView = {
  title: string;
  detail?: string;
  /** 0-100, for the progress bar. */
  percent?: number;
};

const STAGE_LABELS: Record<RecordingDerivationStage, string> = {
  normalizing: 'Procesando acciones capturadas',
  building_steps: 'Construyendo pasos',
  ai_enrichment: 'Enriqueciendo con IA',
  saving: 'Guardando escenarios',
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function describeGenerationProgress(progress: GenerationProgress): GenerationProgressView {
  if (progress.kind === 'stopping') {
    const pending = Math.max(0, progress.pendingCaptures);
    return {
      title: 'Cerrando la grabación…',
      detail: pending > 0
        ? `Procesando ${plural(pending, 'captura pendiente', 'capturas pendientes')}`
        : `Guardando ${plural(progress.events, 'evento capturado', 'eventos capturados')}`,
      percent: pending > 0 ? 10 : 90,
    };
  }

  const { stage, stageIndex = 0, stageCount = 4, actionCount, stepCount } = progress.derivation;
  const total = stageCount > 0 ? stageCount : 4;
  const current = Math.min(Math.max(stageIndex, 0), total);
  const stageLabel = stage ? STAGE_LABELS[stage] : 'Procesando la grabación';
  const counts = stepCount !== undefined && actionCount !== undefined
    ? `${plural(stepCount, 'paso', 'pasos')} a partir de ${plural(actionCount, 'acción', 'acciones')}`
    : actionCount !== undefined
      ? plural(actionCount, 'acción capturada', 'acciones capturadas')
      : undefined;
  return {
    title: stage ? `Generando pasos… (etapa ${current} de ${total})` : 'Generando pasos…',
    detail: counts ? `${stageLabel} · ${counts}` : stageLabel,
    // Never show 0% or 100% while still working: 0 reads as "stuck", 100 as "done".
    percent: stage ? Math.min(95, Math.max(5, Math.round((current / total) * 100))) : undefined,
  };
}

/** Engine answer that means "the proxy gave up waiting", not "the engine failed". */
export function isProxyTimeout(err: unknown): boolean {
  const code = (err as { errorCode?: unknown } | null)?.errorCode;
  return code === 'TIMEOUT';
}
