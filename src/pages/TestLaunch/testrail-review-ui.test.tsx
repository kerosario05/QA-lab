import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestRailReviewAction } from './TestRailReviewAction';
import type { TestRailReviewDetails } from '../../services/testrail/reviews';

const review: TestRailReviewDetails = {
  status: 'pending',
  existingRequirements: [{ key: 'account.id', label: 'Cuenta', controlType: 'text' }],
  proposals: [{ key: 'auth.user', label: 'Usuario', controlType: 'text' }],
  unresolvedPlaceholders: ['{{auth.user}}'],
  conflicts: [{ key: 'account.id', reason: 'controlType mismatch' }],
};

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

describe('TestRail review UI', () => {
  it('shows review action only for a TestRail case with proposals', () => {
    render(<TestRailReviewAction source="testrail" hasProposals review={review} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(container?.textContent).toContain('Revisar mejoras');

    act(() => root?.render(<TestRailReviewAction source="jira" hasProposals review={review} onApprove={vi.fn()} onReject={vi.fn()} />));
    expect(container?.textContent).not.toContain('Revisar mejoras');
  });

  it('keeps execution selection separate from review callbacks', () => {
    const approve = vi.fn();
    const reject = vi.fn();
    render(<><input type="checkbox" aria-label="seleccionar para ejecutar" /><TestRailReviewAction source="testrail" hasProposals review={review} onApprove={approve} onReject={reject} /></>);

    act(() => (container?.querySelector('input') as HTMLInputElement).click());
    expect(approve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it('approves from the review panel without a launch callback', async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    render(<TestRailReviewAction source="testrail" hasProposals review={review} onApprove={approve} onReject={vi.fn()} />);
    act(() => (container?.querySelector('button') as HTMLButtonElement).click());
    expect(container?.textContent).toContain('Propuestas nuevas');
    expect(container?.textContent).toContain('{{auth.user}}');
    await act(async () => (container?.querySelector('[data-testid="approve-review"]') as HTMLButtonElement).click());
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('changes review state on rejection without launching', async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    render(<TestRailReviewAction source="testrail" hasProposals review={review} onApprove={vi.fn()} onReject={reject} />);
    act(() => (container?.querySelector('button') as HTMLButtonElement).click());
    await act(async () => (container?.querySelector('[data-testid="reject-review"]') as HTMLButtonElement).click());
    expect(reject).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain('Rechazado');
  });
});
