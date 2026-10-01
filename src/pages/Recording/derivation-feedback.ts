import type { DerivationChanges, DerivationMetadata } from '../../services/recordings/types';

export function derivationFeedback(metadata: DerivationMetadata): string {
  const primary = `${metadata.primaryCount} escenario principal`;
  if (metadata.suggestionCount === 0) {
    const diagnostic = metadata.opportunitiesDetected !== undefined
      ? ` Oportunidades detectadas: ${metadata.opportunitiesDetected}; candidatos generados: ${metadata.candidatesGenerated ?? 0}; rechazados: ${metadata.rejectedBecause?.map(rejectionReasonLabel).join(', ') || 'ninguno'}.`
      : '';
    return `${primary} generado. No se encontraron sugerencias adicionales relacionadas con este objetivo.${diagnostic}`;
  }
  return `${primary} y ${metadata.suggestionCount} sugerencias relacionadas generados.`;
}

/**
 * What a regeneration changed, in one line. A regeneration that reproduces the same scenarios
 * must say so: the button used to look dead because an identical list gave no sign it ran
 * (recording 2920301b).
 */
export function derivationChangesSummary(changes: DerivationChanges | undefined): { headline: string; unchanged: boolean } | null {
  if (!changes) return null;
  const parts = [
    changes.added.length > 0 ? `${changes.added.length} ${changes.added.length === 1 ? 'nuevo' : 'nuevos'}` : '',
    changes.updated.length > 0 ? `${changes.updated.length} ${changes.updated.length === 1 ? 'actualizado' : 'actualizados'}` : '',
    changes.removed.length > 0 ? `${changes.removed.length} ${changes.removed.length === 1 ? 'eliminado' : 'eliminados'}` : '',
  ].filter(Boolean);
  if (parts.length === 0) {
    const total = changes.unchanged.length;
    return {
      headline: `Sin cambios: se regeneraron los mismos ${total} ${total === 1 ? 'escenario' : 'escenarios'}. La grabación no aporta información nueva; para escenarios distintos, graba el paso que falta o revisa las sugerencias descartadas.`,
      unchanged: true,
    };
  }
  return { headline: `Escenarios: ${parts.join(', ')}${changes.unchanged.length > 0 ? `; ${changes.unchanged.length} sin cambios` : ''}.`, unchanged: false };
}

const REJECTION_REASON_LABELS: Record<string, string> = {
  goal_coherence_failed: 'no encaja con el objetivo declarado de la grabación',
  goal_relevance_gate: 'poca relación con el objetivo declarado',
  duplicate_suggestion: 'repite otro escenario',
  suggestion_not_materialized_from_primary_setup: 'no parte del recorrido grabado',
  vague_or_incomplete_scenario_specific_steps: 'sus pasos propios son vagos o incompletos',
  missing_observed_evidence_refs: 'no se apoya en eventos observados',
  control_not_observed_in_recording: 'usa un control que no aparece en la grabación',
  generic_negative_without_constraint_or_validation_evidence: 'negativo genérico sin una validación observada',
  unsupported_authoritative_expected_result: 'afirma un resultado que la grabación no vio',
  MUTATION_NO_EFFECT: 'la variante no cambia el recorrido',
};

/** A reviewer-readable reason for a code the engine's quality gate reports. */
export function rejectionReasonLabel(code: string | undefined): string {
  if (!code) return 'sin motivo informado';
  return REJECTION_REASON_LABELS[code] ?? code.replace(/_/g, ' ');
}
