import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectServiceCatalog } from './ProjectServiceCatalog';

let root: Root;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

it('loads the project assignment and persists activation and deactivation only on save', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => ({
    ok: true, status: 200,
    json: async () => init?.method === 'PUT' ? { enabled: JSON.parse(String(init.body)).enabled } : { enabled: false },
  } as Response));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ProjectServiceCatalog slug="portal-comercial" />));
  const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  for (const enabled of [true, false]) {
    const before = request.mock.calls.length;
    await act(async () => checkbox.click());
    expect(request.mock.calls.length).toBe(before);
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    const [url, init] = request.mock.calls.at(-1)!;
    expect(String(url)).toContain('/api/projects/portal-comercial/request-cancellation-config');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ enabled });
    expect(checkbox.checked).toBe(enabled);
  }
});

it('does not offer assignment when the backend reports no compatible service', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ProjectServiceCatalog slug="other-project" />));
  expect(container.querySelector('input')).toBeNull();
  expect(container.textContent).toContain('No hay servicios compatibles');
});
