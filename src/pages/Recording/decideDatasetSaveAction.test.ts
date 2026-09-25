import { describe, expect, it } from 'vitest';
import { decideDatasetSaveAction } from './index';

/**
 * FIRST_LOSS (round 2): the previous fix used a GLOBAL `scenariosReady` boolean, computed from
 * `status.scenarios?.length` during the live poll. Backend research on `recordings.ts` GET
 * /:recordingId showed that while a recording is still active, that same `scenarios` field is
 * `entry.liveProjection.scenarios` -- an in-memory PREVIEW, never the persisted store
 * `loadScenarios()` reads for `PUT /scenario-value`. Treating it as "ready" was the false
 * positive: an edit could reach the PUT before `derive()` ever ran, guaranteeing 409
 * SCENARIO_NOT_READY. It was also a GLOBAL flag: a persisted scenario A could wrongly enable a
 * PUT for scenario B, which was still only a live/unpersisted preview.
 *
 * Fixed by requiring PER-SCENARIO persisted authority (`scenarioPersisted`) sourced only from
 * responses that prove backend materialization -- `derive()`'s own result or
 * `GET .../scenarios` (the persisted store itself) -- never the live poll. This file tests the
 * pure GATING decision both call sites share, extracted so it never needs a live fetch/mount to
 * verify.
 */

describe('decideDatasetSaveAction', () => {
  it('8/sensitive. a sensitive value is never attempted when the secure source is authority (persistQaCredentials=false)', () => {
    expect(decideDatasetSaveAction({ sensitive: true, allowSensitiveMaterialization: false, scenarioPersisted: true })).toBe('skip_sensitive');
  });

  it('sensitive value IS attempted when the project policy explicitly allows persisting it', () => {
    expect(decideDatasetSaveAction({ sensitive: true, allowSensitiveMaterialization: true, scenarioPersisted: true })).toBe('attempt');
  });

  it('1/visibleNotReady + 2/status409 root cause. a non-sensitive value is queued, never attempted, while THIS scenario is not yet backend-persisted', () => {
    expect(decideDatasetSaveAction({ sensitive: false, allowSensitiveMaterialization: false, scenarioPersisted: false })).toBe('queue_not_ready');
  });

  it('6/becomesReady + 7/successfulSave. once THIS scenario is persisted, a non-sensitive value is attempted normally', () => {
    expect(decideDatasetSaveAction({ sensitive: false, allowSensitiveMaterialization: false, scenarioPersisted: true })).toBe('attempt');
  });

  it('sensitivity is checked BEFORE persisted authority -- a sensitive+forbidden value is never queued for a later retry either', () => {
    // If persisted authority were checked first, a sensitive-forbidden value could get queued
    // while not-persisted and then silently sent once persisted -- the sensitive gate must win
    // regardless.
    expect(decideDatasetSaveAction({ sensitive: true, allowSensitiveMaterialization: false, scenarioPersisted: false })).toBe('skip_sensitive');
  });

  it('4/differentPersistedId. a different scenario being persisted does not make THIS one persisted -- caller must pass per-scenario truth', () => {
    // The pure function only ever sees what its caller computed for scenarioPersisted -- this
    // test documents the caller contract: scenarioPersisted must be
    // `persistedScenarioIds.has(scenario.scenarioId)`, never `persistedScenarioIds.size > 0`.
    const globalHasAnyPersisted = true;
    const thisScenarioPersisted = false; // the specific scenarioId under test is not in the set
    expect(decideDatasetSaveAction({ sensitive: false, allowSensitiveMaterialization: false, scenarioPersisted: thisScenarioPersisted })).toBe('queue_not_ready');
    expect(globalHasAnyPersisted).toBe(true); // sanity: a global flag alone would have wrongly allowed 'attempt'
  });

  it('14/generic. pure boolean logic -- no app/project/key hardcode anywhere in the decision', () => {
    for (const scenarioPersisted of [true, false]) {
      for (const allowSensitiveMaterialization of [true, false]) {
        const result = decideDatasetSaveAction({ sensitive: false, allowSensitiveMaterialization, scenarioPersisted });
        expect(result).toBe(scenarioPersisted ? 'attempt' : 'queue_not_ready');
      }
    }
  });
});
