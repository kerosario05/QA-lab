import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ScenarioCard } from './index';
import type { RecordedScenario, RuntimeInputRequirement } from '../../services/recordings/types';
import type { ScenarioServiceView } from '../../services/service-catalog';

/**
 * A field a catalog service fills (OTP) must not ask the QA for a value: the card shows who
 * fills it, counts it as ready, and offers to change, override or drop the binding. A field
 * that only looks like a code gets the engine's suggestion instead.
 */

const OTP_SERVICE = {
  key: 'otp.oracle-local-token',
  name: 'OTP · Token local',
  category: 'otp' as const,
  params: [{ key: 'identity', label: 'Identidad (cédula)', kind: 'field_ref' as const, required: true }],
};

const digits = (): RuntimeInputRequirement[] => Array.from({ length: 6 }, (_, i) => ({
  valueKey: `code_${i + 1}`, semanticField: `OTP digit ${i + 1}`, valueRole: 'secure_input' as const,
  required: true, resolved: false, value: null, source: 'unresolved' as const, stepIndex: i + 4,
}));

const cedula: RuntimeInputRequirement = {
  valueKey: 'cedula', semanticField: 'Cédula', valueRole: 'action_input', required: true,
  resolved: true, value: '00112345678', source: 'RECORDED_CONFIRMED', stepIndex: 1,
};

function scenario(): RecordedScenario {
  const requirements = [cedula, ...digits()];
  return {
    scenarioId: 'REC-A1-01',
    title: 'Login con OTP',
    description: '',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'observed',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: requirements.map((requirement) => ({ content: `Ingresar en ${requirement.semanticField}`, expected: '' })),
    requiredData: [],
    sourceRecordingId: 'recording-test',
    hasUncertainSteps: false,
    runtimeInputRequirements: requirements,
  } as unknown as RecordedScenario;
}

function view(kind: 'bound' | 'suggested'): ScenarioServiceView {
  return {
    scenarioId: 'REC-A1-01',
    missing: [],
    fields: digits().map((digit, index) => ({
      valueKey: digit.valueKey,
      effective: kind === 'bound'
        ? { valueKey: digit.valueKey, origin: 'general', serviceKey: OTP_SERVICE.key, params: { identity: { fromKey: 'cedula' } }, segment: { group: 'code_1', position: index + 1 }, bindingId: `b${index}` }
        : null,
      suggestion: kind === 'suggested'
        ? { serviceKey: OTP_SERVICE.key, params: { identity: { fromKey: 'cedula' } }, reason: 'El campo parece un código OTP o token.' }
        : null,
    })),
  };
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(ui: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function noop() { /* not exercised */ }

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
}

function card(services: Parameters<typeof ScenarioCard>[0]['services']) {
  return (
    <ScenarioCard
      scenario={scenario()}
      checked={false}
      onToggle={noop}
      active={false}
      onActivate={noop}
      expanded={false}
      onToggleExpanded={noop}
      datasetValues={{ cedula: '00112345678' }}
      onDatasetValueChange={noop}
      onDatasetBlur={noop}
      sensitiveDatasetKeys={new Set()}
      services={services}
    />
  );
}

describe('ScenarioCard catalog services', () => {
  it('a code the service fills asks for nothing and does not block the scenario', () => {
    const calls: string[][] = [];
    render(card({
      view: view('bound'),
      enabledServices: [OTP_SERVICE],
      busy: false,
      onApply: noop,
      onTypeByHand: (keys) => calls.push(keys),
      onInherit: noop,
      onRemoveGeneral: noop,
    }));
    const text = container!.textContent ?? '';
    expect(text).toContain('Lo llena el servicio al ejecutar');
    expect(text).toContain('OTP · Token local');
    expect(text).toContain('Formulario general');
    expect(text).toContain('Identidad ← Cédula');
    expect(text).not.toContain('Faltan');
    expect(container!.querySelector('input[aria-label="Código OTP (6 dígitos)"]')).toBeNull();

    act(() => button('Escribir a mano en este escenario')!.click());
    expect(calls).toEqual([digits().map((digit) => digit.valueKey)]);
  });

  it('a field that looks like a code offers the service with the cédula already wired', () => {
    const applied: Array<{ scope: string; keys: string[]; params: unknown }> = [];
    render(card({
      view: view('suggested'),
      enabledServices: [OTP_SERVICE],
      busy: false,
      onApply: (scope, keys, _serviceKey, params) => applied.push({ scope, keys, params }),
      onTypeByHand: noop,
      onInherit: noop,
      onRemoveGeneral: noop,
    }));
    expect(container!.textContent).toContain('¿Lo llena OTP · Token local?');
    expect(container!.textContent).toContain('Faltan');

    act(() => button('Usar servicio')!.click());
    act(() => button('Guardar')!.click());
    expect(applied).toEqual([{ scope: 'general', keys: digits().map((digit) => digit.valueKey), params: { identity: { fromKey: 'cedula' } } }]);
  });

  it('without the catalog the card stays exactly as before', () => {
    render(card(undefined));
    expect(container!.textContent).not.toContain('servicio');
    expect(container!.querySelector('input[aria-label="Código OTP (6 dígitos)"]')).not.toBeNull();
  });
});
