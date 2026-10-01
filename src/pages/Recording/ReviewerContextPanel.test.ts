import { describe, expect, it } from 'vitest';
import { fromDraft, looksLikeSecret, toDraft } from './ReviewerContextPanel';

describe('reviewer context draft', () => {
  it('round-trips a stored context, preconditions one per line', () => {
    const context = { purpose: 'Consultar préstamo', preconditions: ['Kiosko en sucursal', 'Catálogo publicado'] };
    const draft = toDraft(context);
    expect(draft.preconditions).toBe('Kiosko en sucursal\nCatálogo publicado');
    expect(fromDraft(draft)).toEqual({ purpose: 'Consultar préstamo', expectedOutcome: undefined, businessRules: undefined, testData: undefined, preconditions: ['Kiosko en sucursal', 'Catálogo publicado'] });
  });

  it('turns blank fields and lines into nothing, so an empty save removes the scope', () => {
    expect(fromDraft({ purpose: '  ', expectedOutcome: '', businessRules: '', testData: '', preconditions: '\n  \n' }))
      .toEqual({ purpose: undefined, expectedOutcome: undefined, businessRules: undefined, testData: undefined, preconditions: [] });
  });
});

describe('looksLikeSecret', () => {
  it('flags labelled secrets and leaves ordinary data alone', () => {
    expect(looksLikeSecret('usuario qa1, contraseña: Abc123')).toBe(true);
    expect(looksLikeSecret('OTP=123456')).toBe(true);
    expect(looksLikeSecret('Cliente con préstamo preaprobado')).toBe(false);
  });
});
