import type { DerivationMetadata } from '../../services/recordings/types';

export function derivationFeedback(metadata: DerivationMetadata): string {
  const primary = `${metadata.primaryCount} escenario principal`;
  if (metadata.suggestionCount === 0) {
    const diagnostic = metadata.opportunitiesDetected !== undefined
      ? ` Oportunidades detectadas: ${metadata.opportunitiesDetected}; candidatos generados: ${metadata.candidatesGenerated ?? 0}; rechazados: ${metadata.rejectedBecause?.join(', ') || 'ninguno'}.`
      : '';
    return `${primary} generado. No se encontraron sugerencias adicionales relacionadas con este objetivo.${diagnostic}`;
  }
  return `${primary} y ${metadata.suggestionCount} sugerencias relacionadas generados.`;
}
