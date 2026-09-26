import { describe, expect, it } from 'vitest';
import { resolveScenarioReadiness } from './recording-readiness';
import type { RecordedScenario } from '../../services/recordings/types';

/**
 * FIRST_LOSS (recording 58fb8166-1f85-4b30-b19c-6953de7b75ff, app kiosko): a single incoherent
 * route transition set `stateSequenceValid=false`, and BOTH `technicalReadiness` (line 131) and
 * `executionActionReadiness` (line 133) multiply by that same flag. The Recording panel then
 * raised two blocking reasons for one cause -- "falta cobertura técnica para una acción
 * ejecutable" AND "secuencia de estados incompatible" -- the first of which was simply untrue:
 * all 15 actions were covered (13 certified, 2 `runtime_resolution_required`).
 *
 * Fixed by reporting the per-action verdict on its own as `actionCoverageReadiness`, which the
 * panel now reads for that message instead of reconstructing it from two flags that carry the
 * state-sequence verdict inside them.
 *
 * Deliberately NOT changed here: whether `stateSequenceValid=false` should block replay at all.
 * It still does. This only stops one cause from being reported as two.
 */

function certifiedClick(id: string): Record<string, unknown> {
  return {
    id,
    action: 'click',
    resolutionState: 'certified',
    technicalTargetRefs: [`ref-${id}`],
    technicalTargetCandidates: [{ locatorCandidates: [{ strategy: 'css', value: `#${id}` }], structuralContext: 'form' }],
  };
}

function runtimeResolutionRequiredClick(id: string): Record<string, unknown> {
  return {
    id,
    action: 'click',
    associatedField: 'Generar Turno',
    resolutionState: 'runtime_resolution_required',
    technicalTargetRefs: [],
    technicalTargetCandidates: [],
  };
}

function uncoveredClick(id: string): Record<string, unknown> {
  return {
    id,
    action: 'click',
    resolutionState: 'unresolved_unrecoverable',
    technicalTargetRefs: [],
    technicalTargetCandidates: [],
  };
}

function scenario(interactions: Array<Record<string, unknown>>, overrides: Partial<RecordedScenario> = {}): RecordedScenario {
  return {
    scenarioId: 'REC-58FB8166-01',
    title: 'Prueba kiosko',
    description: 'Prueba kiosko',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'observed',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: [{ content: 'final', expected: 'ok' }],
    requiredData: [],
    sourceRecordingId: '58fb8166-1f85-4b30-b19c-6953de7b75ff',
    hasUncertainSteps: false,
    canonicalInteractions: interactions,
    runtimeInputRequirements: [],
    stateSequenceValid: true,
    ...overrides,
  } as RecordedScenario;
}

/** The real shape: every action covered, but the scenario-wide state sequence is incoherent. */
const KIOSK_ACTIONS = [
  certifiedClick('5'), certifiedClick('8'), certifiedClick('11'),
  runtimeResolutionRequiredClick('14'),
  certifiedClick('17'),
  runtimeResolutionRequiredClick('19'),
  certifiedClick('21'), certifiedClick('34'), certifiedClick('37'),
];

describe('resolveScenarioReadiness — a state-sequence problem is not a coverage problem', () => {
  it('1/covered. with a coherent sequence, covered actions report coverage and execution ready', () => {
    const readiness = resolveScenarioReadiness(scenario(KIOSK_ACTIONS), {});
    expect(readiness.actionCoverageReadiness).toBe(true);
    expect(readiness.executionReadiness).toBe(true);
  });

  it('2/physicalFixture. an incoherent sequence blocks execution but never claims coverage is missing', () => {
    const readiness = resolveScenarioReadiness(scenario(KIOSK_ACTIONS, { stateSequenceValid: false }), {});
    // Still blocked -- that gate is unchanged and belongs to the state-sequence reason.
    expect(readiness.executionReadiness).toBe(false);
    expect(readiness.technicalReadiness).toBe(false);
    // ...but the actions ARE all covered, so the coverage message must not fire.
    expect(readiness.actionCoverageReadiness).toBe(true);
  });

  it('3/genuinelyUncovered. a truly uncovered action does report missing coverage', () => {
    const readiness = resolveScenarioReadiness(scenario([certifiedClick('a'), uncoveredClick('b')]), {});
    expect(readiness.actionCoverageReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(false);
  });

  it('4/both. an uncovered action AND an incoherent sequence are two real, independent causes', () => {
    const readiness = resolveScenarioReadiness(
      scenario([certifiedClick('a'), uncoveredClick('b')], { stateSequenceValid: false }),
      {},
    );
    expect(readiness.actionCoverageReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(false);
  });
});
