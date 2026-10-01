import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioTitle } from './ScenarioTitle';
import type { RecordedScenario, ScenarioTitleReview } from '../../services/recordings/types';

const scenario = { scenarioId: 'REC-A1-01', title: 'Desde ¡Hola!: Estados de cuenta' } as RecordedScenario;

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

function button(label: string): HTMLButtonElement {
  const found = container!.querySelector(`button[aria-label="${label}"], button[title="${label}"]`);
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ScenarioTitle', () => {
  it('renames through the command and leaves edit mode when it is saved', async () => {
    const onRename = vi.fn().mockResolvedValue(null);
    render(<ScenarioTitle scenario={scenario} onActivate={() => undefined} onRename={onRename} />);

    act(() => button('Renombrar escenario').click());
    const input = container!.querySelector('input[aria-label="Título del escenario"]') as HTMLInputElement;
    type(input, '  Consultar estado   de cuenta ');
    await act(async () => button('Guardar título').click());

    expect(onRename).toHaveBeenCalledWith('Consultar estado de cuenta');
    expect(container!.querySelector('input[aria-label="Título del escenario"]')).toBeNull();
  });

  it('keeps editing and shows why when the title is too short or the engine refuses it', async () => {
    const onRename = vi.fn().mockResolvedValue('El escenario indicado no existe');
    render(<ScenarioTitle scenario={scenario} onActivate={() => undefined} onRename={onRename} />);

    act(() => button('Renombrar escenario').click());
    const input = container!.querySelector('input[aria-label="Título del escenario"]') as HTMLInputElement;
    type(input, 'ab');
    await act(async () => button('Guardar título').click());
    expect(onRename).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('al menos 5 caracteres');

    type(input, 'Un título válido');
    await act(async () => button('Guardar título').click());
    expect(container!.textContent).toContain('El escenario indicado no existe');
    expect(container!.querySelector('input[aria-label="Título del escenario"]')).not.toBeNull();
  });

  it('flags a repeated title with the conflicting ids, and a generic one', () => {
    const review: ScenarioTitleReview = {
      scenarioId: 'REC-A1-01',
      conflicts: [{ source: 'case', id: 'preview-001-roque-10', title: 'roque 10' }],
      weak: true,
      reasons: ['duplicate_title', 'typed_goal_title', 'generic_title'],
    };
    render(<ScenarioTitle scenario={{ ...scenario, title: 'roque 10' }} review={review} onActivate={() => undefined} />);

    const repeated = Array.from(container!.querySelectorAll('span')).find((span) => span.textContent?.includes('Título repetido (1)'));
    expect(repeated?.getAttribute('title')).toContain('preview-001-roque-10');
    expect(container!.textContent).toContain('Título genérico');
    // Without a rename command there is no pencil.
    expect(container!.querySelector('button[aria-label="Renombrar escenario"]')).toBeNull();
  });
});
