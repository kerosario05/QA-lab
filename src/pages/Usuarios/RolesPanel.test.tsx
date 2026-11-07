import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminRole, PermissionModule } from '../../auth/types';

const setPermissions = vi.fn(async () => ({}));
vi.mock('../../services/identity', () => ({ rolesApi: { setPermissions: (...args: unknown[]) => setPermissions(...(args as [])), remove: vi.fn() } }));

const { RolesPanel } = await import('./RolesPanel');

/**
 * A role can carry keys from another release of the engine (testplanning.* on a branch without
 * that module). They are invisible in the editor; sending them back made the engine refuse the
 * whole list, so an administrator could not grant the new services.* permissions at all.
 */

const modules: PermissionModule[] = [
  { key: 'admin', label: 'Administración', permissions: [{ key: 'admin.users', label: 'Usuarios', description: '' }] },
  {
    key: 'services',
    label: 'Catálogo de servicios',
    permissions: [
      { key: 'services.view', label: 'Ver catálogo de servicios', description: '' },
      { key: 'services.edit', label: 'Configurar servicios', description: '' },
    ],
  },
];

const adminRole = {
  id: 'r-admin', slug: 'admin', name: 'Administrador', description: null, isSystem: true,
  permissions: ['admin.users', 'testplanning.view', 'testplanning.commit'], userCount: 1, createdAt: '', updatedAt: '',
} as unknown as AdminRole;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  setPermissions.mockClear();
});

function button(text: string) {
  return Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
}

describe('RolesPanel', () => {
  it('grants a new permission to a role that still holds keys this engine does not know', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<RolesPanel roles={[adminRole]} modules={modules} onChanged={() => undefined} />));

    expect(container.textContent).toContain('testplanning.view, testplanning.commit');
    act(() => button('Ver catálogo de servicios').click());
    await act(async () => { button('Guardar').click(); });

    expect(setPermissions).toHaveBeenCalledWith('r-admin', ['admin.users', 'services.view']);
  });
});
