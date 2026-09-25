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
