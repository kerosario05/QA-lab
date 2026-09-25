import { describe, expect, it } from 'vitest';
import { resolveScenarioReadiness } from './recording-readiness';
import type { RecordedScenario } from '../../services/recordings/types';

/**
 * FIRST_LOSS (recordingId a1282e09-65a1-45cc-b4e0-62832a5a7985, scenario "Creacion Cuenta
 * Efectivo"): the backend correctly excludes a functional selection's display-only "select"
 * projection row from execution authority via `executionAuthority: false` (it carries no
 * locator/technical target -- its real technical authority is the raw owner+option clicks,
 * which ARE included, marked `technicalOnly: true, executionAuthority: true`). The backend's
 * own `hasExecutionAuthority` reads BOTH fields: `interaction.executionAuthority ?? !interaction.technicalOnly`.
 *
 * `resolveScenarioReadiness`'s `canonicalActions` filter only checked `!technicalOnly` --
 * never `executionAuthority` -- so the select projection row (never itself `technicalOnly`,
 * only its source clicks are) passed the filter, was then judged on ITS OWN nonexistent
 * technical target, and failed both `hasCertifiedTarget` and the
 * `resolutionState === 'runtime_resolution_required'` carve-out (a select projection is
 * `resolutionState: 'certified'` by design, never runtime-resolution-eligible itself -- its
 * technical authority lives entirely on the owner/option clicks it summarizes). This wrongly
 * blocked `executionReadiness` for EVERY scenario containing at least one combobox selection,
 * even after the backend fix that made the underlying owner/option clicks correctly
 * `runtime_resolution_required` (recordingId e5c8ac51-1dff-4c56-9a55-dcd941203a32, previous
 * ticket) -- the backend's own fresh `evaluateRecordedScenarioExecutionReadiness` already
 * reported `executionReady=true` for this exact recording; only this frontend recomputation
 * disagreed.
 */

function selectionOwnerClick(id: string, field: string): Record<string, unknown> {
  return {
    id,
    action: 'click',
    associatedField: field,
    resolutionState: 'runtime_resolution_required',
    technicalOnly: true,
    executionAuthority: true,
    technicalTargetRefs: [],
    technicalTargetCandidates: [{ locatorCandidates: [], structuralContext: { stableDirectAttributes: { role: 'combobox' } } }],
  };
}

function selectionOptionClick(id: string): Record<string, unknown> {
  return {
    id,
    action: 'click',
    resolutionState: 'certified',
    technicalOnly: true,
    executionAuthority: true,
    technicalTargetRefs: [`role:option|${id}`],
  };
}

function selectionProjectionRow(id: string, field: string): Record<string, unknown> {
  return {
    id,
    action: 'select',
    associatedField: field,
    resolutionState: 'certified',
    // Never technicalOnly (it IS the human-facing step) -- its real authority is
    // executionAuthority: false, the field the old filter never consulted.
    executionAuthority: false,
    technicalTargetRefs: [],
  };
}

function certifiedClick(id: string): Record<string, unknown> {
  return { id, action: 'click', resolutionState: 'certified', technicalTargetRefs: [`ref-${id}`] };
}

function scenarioWithInteractions(interactions: Array<Record<string, unknown>>, overrides: Partial<RecordedScenario> = {}): RecordedScenario {
  return {
    scenarioId: 'scenario-1',
    title: 'Creacion Cuenta Efectivo',
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

describe('resolveScenarioReadiness — execution authority (select projection exclusion)', () => {
  it('1/selectionScenario. a scenario with a functional selection (owner+option+display projection) is execution-ready -- the display row is never judged on its own', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([
        certifiedClick('login'),
        selectionOwnerClick('combo-1', 'Categoría de producto'),
        selectionOptionClick('opt-1'),
        selectionProjectionRow('sel-1', 'Categoría de producto'),
        certifiedClick('crear-cuenta'),
      ]),
      {},
    );
    expect(readiness.executionReadiness).toBe(true);
  });

  it('2/multipleSelections. four combobox selections in one scenario (physical shape of "Creacion Cuenta Efectivo") all resolve to execution-ready', () => {
    const fields = ['Categoría de producto', 'Producto', 'Propósito', 'Instrumento'];
    const interactions: Array<Record<string, unknown>> = [certifiedClick('login')];
    fields.forEach((field, i) => {
      interactions.push(selectionOwnerClick(`combo-${i}`, field), selectionOptionClick(`opt-${i}`), selectionProjectionRow(`sel-${i}`, field));
    });
    interactions.push(certifiedClick('crear-cuenta'));
    const readiness = resolveScenarioReadiness(scenarioWithInteractions(interactions), {});
    expect(readiness.executionReadiness).toBe(true);
    expect(readiness.technicalReadiness).toBe(false); // runtime_resolution_required owners keep this honestly false
    expect(readiness.promotionReadiness).toBe(false);
  });

  it('3/selectProjectionNeverCountsAsBlocker. removing the display row entirely changes nothing -- it was never meant to be judged on its own technical target', () => {
    const withProjection = resolveScenarioReadiness(
      scenarioWithInteractions([selectionOwnerClick('combo-1', 'Categoría'), selectionOptionClick('opt-1'), selectionProjectionRow('sel-1', 'Categoría')]),
      {},
    );
    const withoutProjection = resolveScenarioReadiness(
      scenarioWithInteractions([selectionOwnerClick('combo-1', 'Categoría'), selectionOptionClick('opt-1')]),
      {},
    );
    expect(withProjection.executionReadiness).toBe(withoutProjection.executionReadiness);
    expect(withProjection.executionReadiness).toBe(true);
  });

  it('4/technicalOnlyStillHonored. a truly technicalOnly, non-selection interaction (executionAuthority absent) is still excluded exactly as before', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([
        certifiedClick('a'),
        { id: 'nav', action: 'click', resolutionState: 'certified', technicalOnly: true, technicalTargetRefs: [] },
      ]),
      {},
    );
    // The technicalOnly (no executionAuthority override) interaction with no refs would have
    // blocked readiness if wrongly included -- confirms it is still excluded (regression guard).
    expect(readiness.executionReadiness).toBe(true);
  });

  it('5/realBlockStillFailsClosed. an interaction with real execution authority and no certified/runtime-eligible target still blocks -- this fix never masks a genuine gap', () => {
    const readiness = resolveScenarioReadiness(
      scenarioWithInteractions([
        selectionOwnerClick('combo-1', 'Categoría'),
        selectionOptionClick('opt-1'),
        selectionProjectionRow('sel-1', 'Categoría'),
        { id: 'orphan', action: 'click', resolutionState: 'unresolved_unrecoverable', technicalTargetRefs: [], technicalTargetCandidates: [] },
      ]),
      {},
    );
    expect(readiness.executionReadiness).toBe(false);
  });
});
