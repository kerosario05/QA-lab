import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineInputRequirements } from './InputRequirementsPanel';

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
  vi.restoreAllMocks();
});

describe('inline TestRail input requirements', () => {
  it('renders descriptive fields vertically inside the case block', () => {
    render(
      <InlineInputRequirements
        caseId={44757}
        requirements={[
          { key: 'company.rnc', label: 'RNC de la empresa', controlType: 'text', required: true },
          { key: 'auth.user', label: 'Nombre de usuario', controlType: 'text' },
          { key: 'auth.password', label: 'Contraseña', controlType: 'password', sensitive: true },
        ]}
      />,
    );

    const labels = [...(container?.querySelectorAll('label') ?? [])].map((label) => label.textContent?.trim());
    expect(labels).toEqual(['RNC de la empresa*', 'Nombre de usuario', 'Contraseña']);
    expect(container?.querySelector('input[type="password"]')).not.toBeNull();
    expect(container?.querySelector('.flex.flex-col.gap-3')).not.toBeNull();
  });

  it('renders field capabilities and constraints instead of legacy controlType', () => {
    render(
      <InlineInputRequirements
        caseId={44757}
        requirements={[
          { key: 'amount', fieldCapability: { kind: 'number', constraints: { min: 1, max: 9 } } } as any,
          { key: 'code', fieldCapability: { kind: 'text', constraints: { minLength: 2, maxLength: 8, pattern: '[A-Z]+' } } } as any,
          { key: 'birthDate', fieldCapability: { kind: 'date' } } as any,
          { key: 'email', fieldCapability: { kind: 'email' } } as any,
          { key: 'secret', fieldCapability: { kind: 'password' } } as any,
          { key: 'status', fieldCapability: { kind: 'select', allowedValues: ['A', 'B'] } } as any,
          { key: 'pending', fieldCapability: { kind: 'select', allowedValues: [], optionSource: 'unknown' } } as any,
          { key: 'enabled', fieldCapability: { kind: 'checkbox' } } as any,
        ]}
      />,
    );

    expect(container?.querySelector('input[type="number"]')?.getAttribute('min')).toBe('1');
    expect(container?.querySelector('input[type="number"]')?.getAttribute('max')).toBe('9');
    expect(container?.querySelector('input[pattern="[A-Z]+"]')?.getAttribute('minlength')).toBe('2');
    expect(container?.querySelector('input[pattern="[A-Z]+"]')?.getAttribute('maxlength')).toBe('8');
    expect(container?.querySelector('input[type="date"]')).not.toBeNull();
    expect(container?.querySelector('input[type="email"]')).not.toBeNull();
    expect(container?.querySelector('input[type="password"]')).not.toBeNull();
    expect([...container?.querySelectorAll('select option') ?? []].map((option) => option.textContent)).toEqual(['', 'A', 'B']);
    expect(container?.querySelectorAll('select')).toHaveLength(1);
    expect(container?.textContent).toContain('Opciones pendientes de resolución');
    expect(container?.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it('falls back to legacy controlType when fieldCapability is absent', () => {
    render(
      <InlineInputRequirements
        caseId={44757}
        requirements={[{ key: 'legacy', controlType: 'email' }]}
      />,
    );

    expect(container?.querySelector('input[type="email"]')).not.toBeNull();
  });

  it('does not request manual values for supporting synthetic requirements', () => {
    render(
      <InlineInputRequirements
        caseId={44757}
        requirements={[{ key: 'supporting', required: true, inputRole: 'supporting', valuePolicy: 'safe_synthetic' }]}
      />,
    );

    expect(container?.querySelector('input')).toBeNull();
    expect(container?.textContent).toContain('Se resolverá en ejecución');
  });

  it('uses a manual text fallback for required scenario choices without options', () => {
    const onRuntimeInput = (caseId: number, key: string, value: string) => {
      expect([caseId, key, value]).toEqual([44757, 'choice', 'functional-value']);
    };
    render(
      <InlineInputRequirements
        caseId={44757}
        onRuntimeInput={onRuntimeInput}
        requirements={[{
          key: 'choice',
          required: true,
          valuePolicy: 'scenario_controlled',
          fieldCapability: { kind: 'select', allowedValues: [], optionSource: 'unknown' },
        }]}
      />,
    );

    const fallback = container?.querySelector<HTMLInputElement>('input[data-select-fallback="manual"]');
    expect(fallback).not.toBeNull();
    act(() => {
      if (!fallback) return;
      fallback.value = 'functional-value';
      fallback.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  it('keeps a persisted required select editable when its option list is not stored', () => {
    render(<InlineInputRequirements caseId={42} requirements={[
      { key: 'origin', label: 'Origin', controlType: 'select', required: true, allowedValues: [] },
      { key: 'destination', label: 'Destination', controlType: 'select', required: true, allowedValues: ['Observed option'] },
    ]} />);
    expect(container?.querySelector('input[data-input-key="origin"][data-select-fallback="manual"]')).not.toBeNull();
    expect(container?.querySelector('select[data-input-key="destination"]')?.textContent).toContain('Observed option');
  });

  it('renders repeated scoped keys once each and transports by key, never by label', () => {
    render(
      <InlineInputRequirements
        caseId={44759}
        requirements={[
          { key: 'entity_1.document', label: 'Colaborador', required: true },
          { key: 'entity_2.document', label: 'Colaborador', required: true },
        ]}
      />,
    );

    expect(container?.querySelectorAll('[data-input-key]')).toHaveLength(2);
    expect(container?.textContent).toContain('Dataset/Entidad 1');
    expect(container?.textContent).toContain('Dataset/Entidad 2');
    expect(container?.textContent).toContain('Colaborador');
    const inputs = [...(container?.querySelectorAll<HTMLInputElement>('input[data-input-key]') ?? [])];
    expect(inputs.map((input) => input.dataset.inputKey)).toEqual([
      'entity_1.document', 'entity_2.document',
    ]);
  });

  it('renders canonical human field labels and metadata-aware entity headings', () => {
    render(
      <InlineInputRequirements
        caseId={44759}
        requirements={[
          { key: 'employee_1.document', label: 'Cédula empleado 1', displayLabel: 'Cédula', entityDisplayName: 'Empleado', datasetIdentity: 'employee', datasetOrdinal: 1, required: true },
          { key: 'employee_2.document', label: 'Cédula empleado 2', displayLabel: 'Cédula', entityDisplayName: 'Empleado', datasetIdentity: 'employee', datasetOrdinal: 2, required: true },
        ]}
      />,
    );

    expect(container?.textContent).toContain('EMPLEADO 1');
    expect(container?.textContent).toContain('EMPLEADO 2');
    expect(container?.textContent).toContain('Cédula');
    expect(container?.textContent).not.toContain('Cédula empleado 1 ·');
    // The technical key is no longer printed under the field (it repeated the label); it stays as a data attribute.
    expect(container?.querySelector('[data-technical-input-key="employee_1.document"]')).not.toBeNull();
    expect(container?.textContent).not.toContain('employee_1.document');
  });

  it('keeps sensitive requirements masked while exposing only the technical key', () => {
    render(
      <InlineInputRequirements
        caseId={44759}
        requirements={[{ key: 'auth.password', label: 'Contraseña', required: true, sensitive: true }]}
      />,
    );
    expect(container?.querySelector('input[type="password"]')).not.toBeNull();
    expect(container?.querySelector('[data-technical-input-key="auth.password"]')).not.toBeNull();
    expect(container?.textContent).not.toContain('auth.password');
  });

  it('preselects the first active catalog value and excludes password catalogs', async () => {
    const catalogs = [
      { id: 'accounts', projectSlug: 'fenix', name: 'Cuentas', fieldName: 'Cuenta de origen', aliases: [], active: true, revision: 1,
        options: [
          { id: 'account-first', label: 'Cuenta Corriente', value: '001111', active: true, position: 0 },
          { id: 'account-second', label: 'Cuenta de ahorro', value: '002222', active: true, position: 1 },
        ] },
      { id: 'passwords', projectSlug: 'fenix', name: 'Contraseñas', fieldName: 'Contraseña', aliases: [], active: true, revision: 1,
        options: [{ id: 'password-first', label: 'Clave', value: 'synthetic-only', active: true, position: 0 }] },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ catalogs }) } as Response);
    function Harness() {
      const [values, setValues] = useState<Record<string, string>>({});
      return <><InlineInputRequirements caseId={42} projectSlug="fenix" requirements={[
        { key: 'account.origin', label: 'Cuenta de origen', required: true },
        { key: 'auth.password', label: 'Contraseña', required: true, sensitive: true },
      ]} runtimeInputValues={values} onRuntimeInput={(_caseId, key, value) => setValues(previous => ({ ...previous, [key]: value }))} />
        <output data-testid="runtime-values">{JSON.stringify(values)}</output></>;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));
    await act(async () => {
      await vi.waitFor(() => expect(container?.querySelector('select[data-field-capability="project_catalog"]')).not.toBeNull());
    });

    const account = container?.querySelector<HTMLSelectElement>('select[data-field-capability="project_catalog"]');
    expect(account?.value).toBe('001111');
    expect(JSON.parse(container?.querySelector('[data-testid="runtime-values"]')?.textContent ?? '{}')['account.origin']).toBe('001111');
    expect(container?.querySelector('[data-technical-input-key="auth.password"] input[type="password"]')).not.toBeNull();
    expect(container?.textContent).toContain('Por seguridad, este dato sensible no puede usar catálogos.');
    expect(container?.querySelectorAll('select[data-field-capability="project_catalog"]')).toHaveLength(1);
  });

  it('renders the complete repeated-dataset fixture contract at the required-data screen', () => {
    const expectedKeys = [
      'auth.company_identifier', 'auth.username', 'auth.password',
      'employee_1.document', 'employee_1.expected_name', 'employee_1.expected_birth_date', 'employee_1.position',
      'employee_1.income', 'employee_1.email', 'employee_1.phone', 'employee_1.residential_phone', 'employee_1.mobile_phone', 'employee_1.hire_date', 'employee_1.expected_section',
      'employee_2.document', 'employee_2.expected_name', 'employee_2.expected_birth_date', 'employee_2.position',
      'employee_2.income', 'employee_2.email', 'employee_2.phone', 'employee_2.residential_phone', 'employee_2.mobile_phone', 'employee_2.hire_date', 'employee_2.expected_section',
    ];
    render(
      <InlineInputRequirements
        caseId={44759}
        requirements={expectedKeys.map((key) => ({
          key,
          label: key.split('.').at(-1) === 'document' ? 'Colaborador' : undefined,
          required: true,
          sensitive: key === 'auth.password',
        }))}
      />,
    );

    const renderedKeys = [...(container?.querySelectorAll<HTMLElement>('[data-technical-input-key]') ?? [])]
      .map((node) => node.dataset.technicalInputKey);
    expect(renderedKeys).toEqual(expectedKeys);
    expect(new Set(renderedKeys).size).toBe(expectedKeys.length);
    expect(container?.querySelectorAll('details')).toHaveLength(2);
  });
});
