import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RevealableInput } from './RevealableInput';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(ui: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('RevealableInput', () => {
  it('muestra y oculta el valor de un campo de contraseña con el check', () => {
    render(<RevealableInput type="password" value="s3creto" onChange={() => undefined} aria-label="Contraseña" />);
    const field = container!.querySelector<HTMLInputElement>('input[aria-label="Contraseña"]')!;
    const check = container!.querySelector<HTMLInputElement>('input[aria-label="Mostrar valor"]')!;
    expect(field.type).toBe('password');
    act(() => check.click());
    expect(field.type).toBe('text');
    expect(field.value).toBe('s3creto');
    act(() => check.click());
    expect(field.type).toBe('password');
  });

  it('no agrega el check a un campo que no es contraseña', () => {
    render(<RevealableInput type="text" value="abc" onChange={() => undefined} />);
    expect(container!.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
