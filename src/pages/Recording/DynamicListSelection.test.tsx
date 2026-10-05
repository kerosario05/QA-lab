// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DynamicListSelection } from './DynamicListSelection';
import { encodeSelectionRule, parseSelectionRule } from '../../services/recordings/dynamic-selection-rule';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); host?.remove(); localStorage.clear(); });

it('shows positions, applies criteria explicitly and isolates saved rules by project and field', () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onApply = vi.fn();
  const value = encodeSelectionRule({ terms: ['Blue'], matchIndex: 1 });
  const render = (projectSlug: string, fieldKey = 'source') => act(() => root!.render(
    <DynamicListSelection projectSlug={projectSlug} fieldKey={fieldKey} label="Items" value={value}
      options={['Blue / 12345678', 'Red / 98765432', 'Blue / 45678901']} disabled={false} onApply={onApply} />));
  render('one');
  expect(host.textContent).toContain('Coincidencias en la grabación: 2');
  expect(host.textContent).not.toContain('12345678');
  const click = (text: string) => act(() => [...host.querySelectorAll('button')].find(button => button.textContent === text)!.click());
  click('Aplicar regla');
  expect(parseSelectionRule(onApply.mock.calls[0][0])).toEqual({ terms: ['Blue'], matchIndex: 1 });
  click('Guardar regla del proyecto');
  render('two'); click('Cargar regla del proyecto');
  expect(host.textContent).toContain('No hay una regla guardada');
  render('one', 'destination'); click('Cargar regla del proyecto');
  expect(host.textContent).toContain('No hay una regla guardada');
  render('one'); click('Cargar regla del proyecto');
  expect(host.textContent).toContain('Regla cargada');
});

it('positional mode retains the original dataset value while hiding dynamic labels', () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onApply = vi.fn();
  act(() => root!.render(<DynamicListSelection projectSlug="one" fieldKey="source" label="Items" value="Old owner / 12345678"
    options={['Old owner / 12345678', 'Another owner / 98765432']} disabled={false} onApply={onApply} />));
  expect(host.textContent).toContain('Opción 1');
  expect(host.textContent).not.toContain('Old owner');
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Items"]')!;
  act(() => { select.value = 'Another owner / 98765432'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(onApply).toHaveBeenCalledWith('Another owner / 98765432');

it('applies valid criteria when leaving the editor without a separate Apply click', () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onApply = vi.fn();
  act(() => root!.render(<DynamicListSelection projectSlug="one" fieldKey="source" label="Items" value="Old label"
    options={['Savings / USD / old identifier']} disabled={false} onApply={onApply} />));
  const mode = host.querySelector<HTMLSelectElement>('select[aria-label="Modo de selección de Items"]')!;
  act(() => { mode.value = 'criteria'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Características de Items"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, 'USD'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => { input.focus(); input.blur(); });
  expect(onApply).toHaveBeenCalledWith(encodeSelectionRule({ terms: ['USD'], matchIndex: 0 }));
});

});
