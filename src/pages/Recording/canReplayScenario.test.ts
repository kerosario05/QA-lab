import { describe, expect, it } from 'vitest';
import { canReplayScenario, isExecutionSelectionBlocked } from './index';

/**
 * FIRST_LOSS: the "Reproducir y subir a TestRail" gate (`executionBlockedWithLifecycle` in
 * index.tsx) only ever consulted `resolveScenarioReadiness(...).executionReadiness` -- whether
 * the recorded ACTIONS can technically be attempted -- and never
 * `session.persistedScenarioIds`, whether THIS scenarioId is actually in the backend's own
 * persisted store. A scenario shown from the live/unpersisted preview (visible before
 * "Generar escenarios" ever ran) could be `executionReadiness: true` while
 * `loadScenarios(...)` on the backend was still empty for it, letting the button enable and the
 * eventual `POST /execute` land on `409 SCENARIO_NOT_READY`. Fixed with a small, explicit,
 * per-scenarioId AND-gate (`canReplayScenario`) that both call sites (web replay and mobile
 * execute) now share, extracted so it never needs a live fetch/mount to verify.
 */

describe('canReplayScenario', () => {
  it('1/liveReady. a live/unpersisted scenario with executionReadiness=true is NOT replayable', () => {
    expect(canReplayScenario({ executionReadiness: true, scenarioPersisted: false })).toBe(false);
  });

  it('2/persistedReady. the SAME scenarioId once persisted, with executionReadiness=true, IS replayable', () => {
    expect(canReplayScenario({ executionReadiness: true, scenarioPersisted: true })).toBe(true);
  });

  it('4/notExecutionReady. persisted but not execution-ready is NOT replayable', () => {
    expect(canReplayScenario({ executionReadiness: false, scenarioPersisted: true })).toBe(false);
  });

  it('neither persisted nor execution-ready is NOT replayable', () => {
    expect(canReplayScenario({ executionReadiness: false, scenarioPersisted: false })).toBe(false);
  });

  it('11/generic. pure boolean AND -- no app/project/scenario hardcode anywhere in the decision', () => {
    for (const executionReadiness of [true, false]) {
      for (const scenarioPersisted of [true, false]) {
        expect(canReplayScenario({ executionReadiness, scenarioPersisted })).toBe(executionReadiness && scenarioPersisted);
      }
    }
  });
});

describe('isExecutionSelectionBlocked', () => {
  it('an empty selection is never blocked (nothing to gate yet)', () => {
    expect(isExecutionSelectionBlocked([])).toBe(false);
  });

  it('all-persisted-and-ready selection is not blocked', () => {
    expect(isExecutionSelectionBlocked([
      { executionReadiness: true, scenarioPersisted: true },
      { executionReadiness: true, scenarioPersisted: true },
    ])).toBe(false);
  });

  it('7/executeIds + SELECTED SCENARIOS invariant. a mixed selection (scenario A persisted, scenario B only live) is blocked entirely -- never a partial execute', () => {
    expect(isExecutionSelectionBlocked([
      { executionReadiness: true, scenarioPersisted: true },
      { executionReadiness: true, scenarioPersisted: false },
    ])).toBe(true);
  });

  it('3/wrongId. a single not-yet-persisted scenario (as if the persisted set only contains a DIFFERENT scenarioId) blocks the whole action', () => {
    expect(isExecutionSelectionBlocked([{ executionReadiness: true, scenarioPersisted: false }])).toBe(true);
  });

  it('9/runtimeResolution. a runtime-resolution-required scenario that IS persisted, with executionReadiness already true, is not blocked', () => {
    // `resolveScenarioReadiness` already carves runtime_resolution_required actions into
    // executionReadiness=true (a prior ticket) -- this test documents that once persisted, it
    // reaches the same "replayable" outcome as any other execution-ready scenario.
    expect(isExecutionSelectionBlocked([{ executionReadiness: true, scenarioPersisted: true }])).toBe(false);
  });
});
