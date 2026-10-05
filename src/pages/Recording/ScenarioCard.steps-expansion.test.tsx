import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ScenarioCard } from './index';
import type { RecordedScenario } from '../../services/recordings/types';
import { encodeSelectionRule } from '../../services/recordings/dynamic-selection-rule';

/**
 * FIRST_LOSS: the "Ver pasos"/"Ocultar pasos" panel's open/closed state was local component
 * state (`useState(false)` inside `ScenarioCard`), tied to the component INSTANCE's mount
 * lifecycle rather than to the scenario's own stable `scenarioId`. The primary-scenario slot in
 * particular is rendered from `{primaryScenario && <ScenarioCard .../>}` with no key -- if
 * `primaryScenario` (`session.scenarios.find(s => s.primary) ?? session.scenarios[0]`) is ever
 * transiently falsy across a render (an empty/mid-refresh `scenarios` array from any of the
 * several `setScenarios([])`/refetch call sites), that block unmounts and remounts `ScenarioCard`
 * on the next render, resetting `open` back to `false` even though nothing about the SCENARIO
 * itself actually disappeared -- exactly the intermittent "expands then immediately collapses,
 * and stops reopening reliably" symptom.
 *
 * Fixed by lifting the expanded/collapsed state to the PARENT (`Recording`), keyed by the same
 * stable `scenarioId` the parent already uses for `selected`/`executionSelected`, and passing it
 * down as `expanded`/`onToggleExpanded` props. A remount of `ScenarioCard` no longer loses
 * anything: on remount it simply re-reads `expanded` from the parent's keyed state, which never
 * went away. These tests exercise `ScenarioCard` directly (now exported) with a minimal harness
 * that reproduces exactly that parent-state pattern, including a simulated remount.
 */

function scenario(overrides: Partial<RecordedScenario> = {}): RecordedScenario {
  return {
    scenarioId: 'REC-A1-01',
    title: 'Escenario de prueba',
    description: 'Descripción de prueba',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'observed',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: [{ content: 'Ingresar valor', expected: '', stepNumber: 1 }],
    requiredData: [],
    sourceRecordingId: 'recording-test',
    hasUncertainSteps: false,
    readiness: {
      functionalReadiness: true,
      dataReadiness: true,
      technicalReadiness: true,
      oracleReadiness: true,
      executionReadiness: true,
      publicationReadiness: true,
      missingInputs: [],
    },
    runtimeInputRequirements: [],
    ...overrides,
  } as RecordedScenario;
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(ui: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

/** Re-renders onto the SAME root/container -- the real React re-render path, not a fresh mount. */
function rerender(ui: ReactNode) {
  act(() => root?.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function noop() { /* not exercised by these tests */ }

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from((container ?? document).querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
}

function cardProps(s: RecordedScenario, expanded: boolean, onToggleExpanded: () => void) {
  return {
    scenario: s,
    checked: false,
    onToggle: noop,
    executionChecked: false,
    onExecutionToggle: noop,
    active: false,
    onActivate: noop,
    expanded,
    onToggleExpanded,
    datasetValues: {},
    onDatasetValueChange: noop,
    onDatasetBlur: noop,
    sensitiveDatasetKeys: new Set<string>(),
    allowSensitiveMaterialization: false,
  };
}

/** Reproduces the real parent pattern: expansion keyed by scenarioId, survives remounts. */
function Harness({ present, s }: { present: boolean; s: RecordedScenario }) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  return present ? (
    <ScenarioCard
      {...cardProps(s, Boolean(expandedIds[s.scenarioId]), () => setExpandedIds((prev) => ({ ...prev, [s.scenarioId]: !prev[s.scenarioId] })))}
    />
  ) : null;
}

describe('ScenarioCard steps expansion', () => {
  it('1/expand. clicking "Ver pasos" expands the steps panel', () => {
    render(<Harness present s={scenario()} />);
    act(() => findButton('Ver')?.click());
    expect(container?.textContent).toContain('Ingresar valor');
    expect(container?.textContent).toContain('Ocultar pasos');
  });

  it('2/collapse. clicking "Ocultar pasos" collapses it again', () => {
    render(<Harness present s={scenario()} />);
    act(() => findButton('Ver')?.click());
    act(() => findButton('Ocultar pasos')?.click());
    expect(container?.textContent).not.toContain('Ingresar valor');
    expect(container?.textContent).toContain('Ver 1 pasos');
  });

  it('3/sameIdRefresh + 6/polling. scenario object replaced with a NEW reference but the SAME scenarioId: stays expanded', () => {
    const first = scenario();
    render(<Harness present s={first} />);
    act(() => findButton('Ver')?.click());
    expect(container?.textContent).toContain('Ingresar valor');

    const replaced = scenario({ description: 'Descripción actualizada por refetch' });
    rerender(<Harness present s={replaced} />);
    expect(container?.textContent).toContain('Ingresar valor');
    expect(container?.textContent).toContain('Ocultar pasos');
  });

  it('4/readinessRefresh. readiness changes on the same scenarioId: stays expanded', () => {
    const first = scenario();
    render(<Harness present s={first} />);
    act(() => findButton('Ver')?.click());

    const withDifferentReadiness = scenario({
      readiness: { functionalReadiness: true, dataReadiness: false, technicalReadiness: false, oracleReadiness: true, executionReadiness: false, publicationReadiness: false, missingInputs: [] },
    });
    rerender(<Harness present s={withDifferentReadiness} />);
    expect(container?.textContent).toContain('Ingresar valor');
  });

  it('5/missingDataRefresh. missing runtime data changes on the same scenarioId: stays expanded', () => {
    const first = scenario();
    render(<Harness present s={first} />);
    act(() => findButton('Ver')?.click());

    const withMissingData = scenario({
      readiness: { functionalReadiness: true, dataReadiness: false, technicalReadiness: true, oracleReadiness: true, executionReadiness: false, publicationReadiness: false, missingInputs: [{ valueKey: 'required_field', semanticField: 'Campo requerido', valueRole: 'action_input', required: true, value: null, source: 'unresolved', resolved: false }] },
    });
    rerender(<Harness present s={withMissingData} />);
    expect(container?.textContent).toContain('Ingresar valor');
  });

  it('8/blocked. a blocked (not execution-ready) scenario still shows its steps when expanded', () => {
    const blocked = scenario({
      readiness: { functionalReadiness: true, dataReadiness: false, technicalReadiness: false, oracleReadiness: false, executionReadiness: false, publicationReadiness: false, missingInputs: [{ valueKey: 'required_field', semanticField: 'x', valueRole: 'action_input', required: true, value: null, source: 'unresolved', resolved: false }] },
    });
    render(<Harness present s={blocked} />);
    act(() => findButton('Ver')?.click());
    expect(container?.textContent).toContain('Ingresar valor');
  });

  it('9/removed. a scenario that genuinely disappears from the list renders nothing -- no stale panel left behind', () => {
    const s = scenario();
    render(<Harness present s={s} />);
    act(() => findButton('Ver')?.click());
    expect(container?.textContent).toContain('Ingresar valor');

    rerender(<Harness present={false} s={s} />);
    expect(container?.textContent).toBe('');
  });

  it('7/otherScenario. a DIFFERENT scenario updating never affects this one\'s expanded state (independent, keyed by its own id)', () => {
    function TwoCards() {
      const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
      const a = scenario({ scenarioId: 'REC-A', title: 'A' });
      const b = scenario({ scenarioId: 'REC-B', title: 'B', testRailSteps: [{ content: 'Paso de B', expected: '', stepNumber: 1 }] });
      const toggle = (id: string) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
      return (
        <>
          <ScenarioCard {...cardProps(a, Boolean(expandedIds[a.scenarioId]), () => toggle(a.scenarioId))} />
          <ScenarioCard {...cardProps(b, Boolean(expandedIds[b.scenarioId]), () => toggle(b.scenarioId))} />
        </>
      );
    }
    render(<TwoCards />);
    const [firstToggle] = Array.from((container ?? document).querySelectorAll('button')).filter((b) => b.textContent?.includes('Ver'));
    act(() => firstToggle?.click());
    expect(container?.textContent).toContain('Ingresar valor');
    expect(container?.textContent).not.toContain('Paso de B');
  });

  it('renders an applied dynamic selection rule in the matching recorded step and masks captured account details', () => {
    const valueKey = 'account_from_select_input_seleccion';
    const oldCapturedLabel = 'Cuenta Corrientes / 11311000003156 / RD$168,967.94';
    const currentRule = encodeSelectionRule({ terms: ['Cuenta Corrientes'], matchIndex: 0 });
    const s = scenario({
      testRailSteps: [{ content: 'Seleccionar [account_from_select_input_seleccion] en "account-from-select-input"',
        stepTemplate: 'Seleccionar [account_from_select_input_seleccion] en "account-from-select-input"',
        valueKey, interactionId: 'interaction-17', expected: '', stepNumber: 17 }],
      requiredData: [{ key: valueKey, label: 'account-from-select-input', semanticField: 'account-from-select-input',
        stepIndex: 17, exampleValue: oldCapturedLabel, sensitive: false, valueRole: 'action_input',
        source: 'RECORDED_CONFIRMED', allowedValues: [oldCapturedLabel] } as any],
      canonicalInteractions: [{ id: 'interaction-17', action: 'select', valueKey,
        semanticField: 'account-from-select-input' }],
      runtimeInputRequirements: [{ valueKey, semanticField: 'account-from-select-input', valueRole: 'action_input',
        required: true, value: oldCapturedLabel, source: 'RECORDED_CONFIRMED', resolved: true, editable: true,
        allowedValues: [oldCapturedLabel] }],
    });
    render(<ScenarioCard {...cardProps(s, true, noop)} datasetValues={{ [valueKey]: currentRule }} />);
    expect(container?.textContent).toContain('opción que contiene \"Cuenta Corrientes\" (coincidencia 1)');
    expect(container?.textContent).not.toContain('11311000003156');
    expect(container?.textContent).not.toContain('168,967.94');
  });

});
