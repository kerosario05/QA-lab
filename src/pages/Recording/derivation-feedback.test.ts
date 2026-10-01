import { describe, expect, it } from 'vitest';
import { derivationFeedback } from './derivation-feedback';

describe('derivationFeedback', () => {
  it('makes the primary and zero-suggestion result explicit', () => {
    expect(derivationFeedback({ version: 1, generatedAt: 'now', executed: true, primaryCount: 1, suggestionCount: 0 }))
      .toContain('No se encontraron sugerencias adicionales relacionadas con este objetivo.');
  });

  it('does not mix the primary with suggestion count', () => {
    expect(derivationFeedback({ version: 2, generatedAt: 'now', executed: true, primaryCount: 1, suggestionCount: 2 }))
      .toBe('1 escenario principal y 2 sugerencias relacionadas generados.');
  });
});

import { derivationChangesSummary, rejectionReasonLabel } from './derivation-feedback';

describe('derivationChangesSummary', () => {
  it('says a regeneration changed nothing instead of looking dead (recording 2920301b)', () => {
    const summary = derivationChangesSummary({ added: [], updated: [], removed: [], unchanged: ['A', 'B', 'C', 'D'] });
    expect(summary?.unchanged).toBe(true);
    expect(summary?.headline).toContain('Sin cambios: se regeneraron los mismos 4 escenarios');
  });

  it('counts what was added, updated and removed', () => {
    const summary = derivationChangesSummary({ added: ['N'], updated: ['U1', 'U2'], removed: ['R'], unchanged: ['A'] });
    expect(summary).toEqual({ headline: 'Escenarios: 1 nuevo, 2 actualizados, 1 eliminado; 1 sin cambios.', unchanged: false });
  });

  it('is absent for a derivation from an engine that does not report changes', () => {
    expect(derivationChangesSummary(undefined)).toBeNull();
  });
});

describe('rejectionReasonLabel', () => {
  it('translates the quality-gate codes a reviewer sees', () => {
    expect(rejectionReasonLabel('goal_coherence_failed')).toBe('no encaja con el objetivo declarado de la grabación');
    expect(rejectionReasonLabel('some_new_code')).toBe('some new code');
  });
});
