import { describe, expect, it } from 'vitest';
import { resolveScenarioReadiness } from './recording-readiness';
import type { RecordedScenario } from '../../services/recordings/types';

/**
 * FIRST_LOSS: the backend's `evaluateRecordedScenarioExecutionReadiness` already treats an
 * action whose `resolutionState === 'runtime_resolution_required'` as execution-ready (the
 * runtime will attempt live structural discovery/materialization) while honestly keeping
 * `technicalReady=false` and `promotionReady=false` -- see
 * `canonical-recording-contract.runtime-resolution-required.test.ts` (backend repo) tests 1-2.
 * But `resolveScenarioReadiness` here RECOMPUTED its own `technicalReadiness` from raw
 * `technicalTargetRefs`/`technicalTargetCandidates` counts alone, ignoring `resolutionState`
 * entirely, and then used that same flag to gate `executionReadiness` -- so a scenario with a
 * single runtime-resolution-eligible action was reported not executable, disabling "Reproducir
 * y subir a TestRail" and showing "falta cobertura técnica para una acción ejecutable" as if it
 * were a hard block. Fixed by adding a separate execution-facing per-action check that carves
 * out `runtime_resolution_required`, mirroring the backend's own `allActionsReady`.
 */

function certifiedFill(id: string): Record<string, unknown> {
  return {
    id,
    action: 'fill',
    resolutionState: 'certified',
    technicalTargetRefs: [`ref-${id}`],
    technicalTargetCandidates: [{ locatorCandidates: [{ strategy: 'css', value: `#${id}` }], structuralContext: 'form' }],
  };
}

function runtimeResolutionRequiredFill(id: string): Record<string, unknown> {
  return {
    id,
    action: 'fill',
    associatedField: 'Campo real',
    resolutionState: 'runtime_resolution_required',
    technicalTargetRefs: [],
    technicalTargetCandidates: [],
  };
}

function trulyMissingTarget(id: string): Record<string, unknown> {
  return {
    id,
    action: 'fill',
    resolutionState: 'unresolved_unrecoverable',
    technicalTargetRefs: [],
    technicalTargetCandidates: [],
  };
}

function scenarioWithInteractions(interactions: Array<Record<string, unknown>>, overrides: Partial<RecordedScenario> = {}): RecordedScenario {
  return {
    scenarioId: 'scenario-1',
    title: 'Escenario',
    description: 'Escenario',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'derived',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: [{ content: 'final', expected: 'ok' }],
    requiredData: [],
    sourceRecordingId: 'recording-test',
    hasUncertainSteps: false,
    canonicalInteractions: interactions,
    runtimeInputRequirements: [],
    stateSequenceValid: true,
    ...overrides,
  };
}

describe('resolveScenarioReadiness — runtime-resolution-required execution carve-out', () => {
  it('1/allCertified. all-certified actions: execution ready', () => {
    const readiness = resolveScenarioReadiness(scenarioWithInteractions([certifiedFill('a'), certifiedFill('b')]), {});
    expect(readiness.technicalReadiness).toBe(true);
    expect(readiness.executionReadiness).toBe(true);
    expect(readiness.promotionReadiness).toBe(true);
  });

  it('2/runtimeResolution + 3/technicalFalse + 4/executionTrue + 5/promotionFalse. 5 certified + 1 runtime_resolution_required (physical fixture)', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([
        certifiedFill('6'), certifiedFill('7'), certifiedFill('8'), certifiedFill('10'),
        runtimeResolutionRequiredFill('13'),
        certifiedFill('15'),
      ]),
      {},
    );
    expect(readiness.technicalReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(true);
    expect(readiness.promotionReadiness).toBe(false);
  });

  it('6/missingTarget. a truly missing target (unresolved_unrecoverable) still blocks execution', () => {
    const readiness = resolveScenarioReadiness(scenarioWithInteractions([certifiedFill('a'), trulyMissingTarget('b')]), {});
    expect(readiness.technicalReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(false);
  });

  it('7/ambiguous. an action with no certified target and no runtime-resolution eligibility blocks execution the same way as ambiguous/rejected', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([{ id: 'x', action: 'click', resolutionState: 'unresolved_unrecoverable', technicalTargetRefs: [], technicalTargetCandidates: [] }]),
      {},
    );
    expect(readiness.executionReadiness).toBe(false);
  });

  it('8/missingData. a runtime-resolution-required action alone does not bypass a real missing-data block', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([runtimeResolutionRequiredFill('13')], {
        runtimeInputRequirements: [{ valueKey: 'entity_1.campo', semanticField: 'Campo', valueRole: 'action_input', required: true, value: null, source: 'unresolved', resolved: false }],
      }),
      {},
    );
    expect(readiness.dataReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(false);
  });

  it('9/stateSequence. an invalid recorded state sequence still blocks execution even with all-certified targets', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([certifiedFill('a')], { stateSequenceValid: false }),
      {},
    );
    expect(readiness.executionReadiness).toBe(false);
  });

  it('11/frontendGate. does not recompute executionReadiness purely from technicalTargetCount -- two scenarios with the SAME target count (0) differ only by resolutionState', () => {
    const runtimeResolvable = resolveScenarioReadiness(scenarioWithInteractions([runtimeResolutionRequiredFill('a')]), {});
    const trulyMissing = resolveScenarioReadiness(scenarioWithInteractions([trulyMissingTarget('a')]), {});
    expect(runtimeResolvable.executionReadiness).toBe(true);
    expect(trulyMissing.executionReadiness).toBe(false);
  });

  it('12/generic. no app/project/field-name hardcode drives the carve-out -- an arbitrary associatedField/id still works', () => {
    for (const [id, field] of [['zzz', 'Cualquier campo'], ['q1', 'Otro dato distinto']] as const) {
      const readiness = resolveScenarioReadiness(
        scenarioWithInteractions([{ id, action: 'fill', associatedField: field, resolutionState: 'runtime_resolution_required', technicalTargetRefs: [], technicalTargetCandidates: [] }]),
        {},
      );
      expect(readiness.executionReadiness).toBe(true);
    }
  });
});
