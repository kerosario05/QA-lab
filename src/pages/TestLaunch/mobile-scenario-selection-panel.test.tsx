import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MobileScenarioSelectionPanel } from './MobileScenarioSelectionPanel';
import type { MobileScenario } from '../../services/mobile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeScenarios(): MobileScenario[] {
  return [
    {
      scenarioId: 'MOBILE-AA-94-001',
      sourceIssueKey: 'AA-94',
      sourceIssueSummary: 'Visualizar pantalla inicial del kiosco con título extenso para validar multilinea y legibilidad completa',
      title: 'Visualizar pantalla inicial del kiosco',
      preconditions: ['App instalada', 'Usuario sin sesión activa'],
      expectedResult: 'Se muestra la pantalla inicial con botones habilitados.',
      requiredData: [
        { key: 'documentType', label: 'Tipo de documento', kind: 'select', stepIndex: 1, exampleValue: '', sensitive: false, options: ['Cédula', 'Pasaporte'], defaultValue: 'Cédula' },
        { key: 'documentId', label: 'Número de documento', kind: 'text', stepIndex: 2, exampleValue: '001-1234567-8', sensitive: false },
      ],
      steps: [
        { action: 'click', description: 'Abrir selector de documento', target: { strategy: 'accessibilityId', value: 'document-selector' } },
        { action: 'fill', description: 'Completar documento', target: { strategy: 'id', value: 'document-input' }, value: '001-1234567-8' },
      ],
    },
    {
      scenarioId: 'MOBILE-AA-94-002',
      sourceIssueKey: 'AA-94',
      sourceIssueSummary: 'Visualizar pantalla inicial del kiosco con título extenso para validar multilinea y legibilidad completa',
      title: 'Validar opciones principales',
      preconditions: [],
      expectedResult: 'Las opciones principales son visibles.',
      steps: [{ action: 'assertVisible', description: 'Verificar opciones', target: { strategy: 'xpath', value: '//*[@text="Opciones"]' } }],
    },
    {
      scenarioId: 'MOBILE-AA-93-001',
      sourceIssueKey: 'AA-93',
      sourceIssueSummary: 'Flujo de ingreso de documento',
      title: 'Seleccionar tipo de documento y continuar',
      preconditions: ['App abierta en home'],
      expectedResult: 'Se habilita el botón continuar.',
      steps: [{ action: 'click', description: 'Seleccionar tipo', target: { strategy: 'className', value: 'android.widget.Button' } }],
    },
  ];
}

function Harness() {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedIssues, setExpandedIssues] = useState<string[]>(['AA-94', 'AA-93']);
  const [values, setValues] = useState<Record<string, Record<number, string>>>({});
  return (
    <MobileScenarioSelectionPanel
      mobileScenarios={makeScenarios()}
      selectedMobileScenarioIds={selected}
      expandedMobileIssueKeys={expandedIssues}
      setExpandedMobileIssueKeys={setExpandedIssues}
      mobileDataValues={values}
      setMobileFieldValue={(scenarioId, stepIndex, value) => setValues((prev) => ({ ...prev, [scenarioId]: { ...(prev[scenarioId] ?? {}), [stepIndex]: value } }))}
      toggleMobileScenario={(scenarioId) => setSelected((prev) => (prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId]))}
      setSelectedMobileScenarioIds={setSelected}
    />
  );
}

function click(container: HTMLElement, selector: string) {
  const element = container.querySelector(selector) as HTMLButtonElement | null;
  if (!element) throw new Error(`Missing selector: ${selector}`);
  act(() => {
    element.click();
  });
}

function clickByText(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Missing button text: ${label}`);
  act(() => {
    button.click();
  });
}

describe('MobileScenarioSelectionPanel', () => {
  it('renders issue headers, maintains selection states, expands details and keeps complete data visible', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });

    expect(container.textContent).toContain('AA-94');
    expect(container.textContent).toContain('Visualizar pantalla inicial del kiosco con título extenso para validar multilinea y legibilidad completa');
    expect(container.textContent).toContain('3 escenarios');
    expect(container.textContent).toContain('2 historias');
    expect(container.textContent).toContain('Seleccionar todos');

    click(container, 'button[aria-label="Seleccionar escenario MOBILE-AA-94-001"]');
    expect(container.textContent).toContain('1 de 3 seleccionados');
    const issueCheckbox = container.querySelector('button[aria-label="Seleccionar historia AA-94"]');
    expect(issueCheckbox?.getAttribute('aria-checked')).toBe('mixed');

    click(container, 'button[aria-label="Seleccionar historia AA-94"]');
    expect(container.textContent).toContain('2 de 3 seleccionados');
    expect(issueCheckbox?.getAttribute('aria-checked')).toBe('true');

    click(container, 'button[aria-label="Expandir escenario MOBILE-AA-94-001"]');
    expect(container.textContent).toContain('Precondiciones');
    expect(container.textContent).toContain('Datos de la prueba');
    expect(container.textContent).toContain('Pasos');
    expect(container.textContent).toContain('Resultado esperado');
    expect(container.textContent).toContain('Tipo de documento');
    expect(container.textContent).toContain('Número de documento');
    expect(container.textContent).toContain('App instalada');
    expect(container.textContent).toContain('Se muestra la pantalla inicial con botones habilitados.');
    expect(container.textContent).toContain('click');
    expect(container.textContent).toContain('fill');
    expect(container.textContent).toContain('accessibilityId: document-selector');
  });

  it('supports select-all and scenarios without preconditions or editable data', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });

    click(container, 'button[aria-label="Expandir escenario MOBILE-AA-94-002"]');
    expect(container.textContent).toContain('MOBILE-AA-94-002');
    expect(container.textContent).toContain('Pasos');
    expect(container.textContent).toContain('assertVisible');
    expect(container.textContent).not.toContain('Datos de la prueba');

    clickByText(container, 'Seleccionar todos');
    expect(container.textContent).toContain('3 de 3 seleccionados');
  });
});
