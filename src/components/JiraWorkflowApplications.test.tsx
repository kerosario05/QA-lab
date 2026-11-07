import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { JiraWorkflowApplications } from './JiraWorkflowApplications';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove(); root = undefined; container = undefined; vi.restoreAllMocks();
});

it('loads and saves application aliases for the selected project', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({ applications: { Aprobaciones: { baseUrl: 'https://approval.fixture/#/tasks' } } }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ applications: { Aprobaciones: { baseUrl: 'https://approval.fixture/#/tasks' } } }) } as Response);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<JiraWorkflowApplications projectSlug="portal-comercial" area="runs" />));
  const url = container.querySelector<HTMLInputElement>('input[aria-label="URL de aplicación 1"]');
  await vi.waitFor(() => expect(url?.value).toBe('https://approval.fixture/#/tasks'));
  await act(async () => [...container!.querySelectorAll('button')].find(button => button.textContent?.includes('Guardar aplicaciones'))!.click());
  expect(container.textContent).toContain('Configuración guardada');
  expect(fetchMock.mock.calls[1][0]).toContain('/api/runs/workflow-applications?projectSlug=portal-comercial');
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
    applications: { Aprobaciones: { baseUrl: 'https://approval.fixture/#/tasks' } },
  });
});
