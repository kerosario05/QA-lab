import { describe, expect, it } from 'vitest';
import type { RecordedScenario } from '../../services/recordings/types';
import { readinessBadge, resolveScenarioReadiness } from './recording-readiness';

function scenario(extra: Partial<RecordedScenario> = {}): RecordedScenario {
  return {
    scenarioId: 'REC-01-DRAFT-1',
    title: 'Desde "Más detalles del producto": volver con "Volver"',
    description: '',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'derived',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: [{ content: 'Presionar "Volver"', expected: 'Resultado por confirmar' }],
    requiredData: [],
    stepTargets: [],
    sourceRecordingId: 'rec',
    hasUncertainSteps: true,
    readiness: { functionalReadiness: true, dataReadiness: true, technicalReadiness: true, oracleReadiness: true, executionReadiness: true, missingInputs: [] },
    ...extra,
  } as unknown as RecordedScenario;
}

describe('a kept suggestion draft', () => {
  it('is never executable, promotable or publishable, whatever its stored projection says', () => {
    const readiness = resolveScenarioReadiness(scenario({ reviewDraft: true }), {});
    expect(readiness.reviewDraft).toBe(true);
    expect(readiness.executionReadiness).toBe(false);
    expect(readiness.promotionReadiness).toBe(false);
    expect(readiness.publicationReadiness).toBe(false);
    expect(readinessBadge(readiness)).toBe('BORRADOR SUGERIDO');
  });

  it('leaves recorded scenarios exactly as before', () => {
    const readiness = resolveScenarioReadiness(scenario(), {});
    expect(readiness.reviewDraft).toBe(false);
    expect(readiness.executionReadiness).toBe(true);
  });
});
