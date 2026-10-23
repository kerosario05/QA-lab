import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectDataCatalogManager } from './ProjectDataCatalogManager';
import type { ProjectListItem } from './index';

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

describe('project data catalog cards', () => {
  it('opens the selected catalog editor and can start a new catalog', async () => {
    const catalog = {
      id: 'catalog-1', projectSlug: 'fenix', name: 'Productos', fieldName: 'Cuenta de Origen',
      aliases: ['cuenta origen'], active: true, revision: 1,
      options: [{ id: 'option-1', label: 'Cuenta Corriente', value: 'Cuenta Corriente', active: true, position: 0 }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ catalogs: [catalog] }) } as Response);
    const projects = [{ slug: 'fenix', name: 'Fenix', enabled: true, projectType: 1 }] as ProjectListItem[];
    render(<ProjectDataCatalogManager projects={projects} />);

    const projectCard = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Fenix'));
    expect(projectCard).toBeDefined();
    await act(async () => { projectCard?.click(); });

    const catalogCard = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Productos'));
    expect(catalogCard).toBeDefined();
    expect(container?.querySelector('input[placeholder="Nombre del catálogo"]')).toBeNull();
    await act(async () => { catalogCard?.click(); });
    expect(container?.querySelector('input[placeholder="Nombre del catálogo"]')).not.toBeNull();
    expect((container?.querySelector('input[placeholder="Nombre del catálogo"]') as HTMLInputElement).value).toBe('Productos');

    const close = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Cerrar');
    await act(async () => { close?.click(); });
    expect(container?.querySelector('input[placeholder="Nombre del catálogo"]')).toBeNull();

    const create = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Nuevo catálogo'));
    await act(async () => { create?.click(); });
    expect((container?.querySelector('input[placeholder="Nombre del catálogo"]') as HTMLInputElement).value).toBe('');
  });
});
