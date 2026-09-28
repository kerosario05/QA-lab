import { describe, expect, it } from 'vitest';
import { describeGenerationProgress, isProxyTimeout } from './generation-progress';

describe('describeGenerationProgress', () => {
  it('while Stop drains, shows how many captures are still pending', () => {
    const view = describeGenerationProgress({ kind: 'stopping', pendingCaptures: 7, events: 56 });
    expect(view.title).toBe('Cerrando la grabación…');
    expect(view.detail).toBe('Procesando 7 capturas pendientes');
  });

  it('once nothing is pending, Stop is saving what was captured', () => {
    const view = describeGenerationProgress({ kind: 'stopping', pendingCaptures: 0, events: 1 });
    expect(view.detail).toBe('Guardando 1 evento capturado');
  });

  it('shows the generation stage out of the total, with steps and actions', () => {
    const view = describeGenerationProgress({
      kind: 'deriving',
      derivation: { recordingId: 'r', status: 'deriving', stage: 'ai_enrichment', stageIndex: 3, stageCount: 4, actionCount: 18, stepCount: 19 },
    });
    expect(view.title).toBe('Generando pasos… (etapa 3 de 4)');
    expect(view.detail).toBe('Enriqueciendo con IA · 19 pasos a partir de 18 acciones');
    expect(view.percent).toBe(75);
  });

  it('before the first stage, reads as queued and never as 0% (stuck)', () => {
    const view = describeGenerationProgress({ kind: 'deriving', derivation: { recordingId: 'r', status: 'deriving', stageIndex: 0, stageCount: 4 } });
    expect(view.title).toBe('Generando pasos… (etapa 0 de 4)');
    expect(view.detail).toBe('En cola');
    expect(view.percent).toBe(5);
  });

  it('never shows 100% while still generating', () => {
    const view = describeGenerationProgress({
      kind: 'deriving',
      derivation: { recordingId: 'r', status: 'deriving', stage: 'saving', stageIndex: 4, stageCount: 4, actionCount: 1, stepCount: 1 },
    });
    expect(view.percent).toBe(95);
    expect(view.detail).toBe('Guardando escenarios · 1 paso a partir de 1 acción');
  });
});

describe('isProxyTimeout', () => {
  it('is true only for the BFF timeout code', () => {
    expect(isProxyTimeout({ errorCode: 'TIMEOUT' })).toBe(true);
    expect(isProxyTimeout({ errorCode: 'RECORDING_NOT_FOUND' })).toBe(false);
    expect(isProxyTimeout(new Error('boom'))).toBe(false);
    expect(isProxyTimeout(null)).toBe(false);
  });
});
