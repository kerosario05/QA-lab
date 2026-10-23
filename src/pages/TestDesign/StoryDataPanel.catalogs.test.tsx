import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestDesignScenario } from '../../services/test-design';
import { StoryDataPanel } from './StoryDataPanel';

let host: HTMLDivElement | undefined;
let unmount: (() => Promise<void>) | undefined;

afterEach(async () => {
  await unmount?.();
  host?.remove();
  host = undefined;
  unmount = undefined;
  vi.restoreAllMocks();
});

const scenarios: TestDesignScenario[] = ['case-a', 'case-b'].map(id => ({
  id,
  title: id,
  preconditions: '',
  steps: [{ action: 'Transferir desde {{cuenta_origen}}', expected: '' }],
  data: [
    { key: 'cuenta_origen', label: 'Cuenta de origen', value: '', sensitive: false, description: '' },
    { key: 'auth.password', label: 'Contraseña', value: '', sensitive: false, description: '' },
  ],
  expectedResult: '',
  priority: 'medium',
  type: 'functional',
  selectedForTestRail: true,
  selectedForJira: false,
  testRailCaseId: null,
  origin: 'ai',
  edited: false,
}));

describe('Test Design shared story data catalogs', () => {
  it('shows the matched catalog in common data and applies its first active option to every case', async () => {
    const catalogs = [{
      id: 'accounts', projectSlug: 'fenix', name: 'Cuentas propias', fieldName: 'Cuenta de origen', aliases: [], active: true, revision: 1,
      options: [
        { id: 'checking', label: 'Cuenta Corriente', value: '001111', active: true, position: 0 },
        { id: 'savings', label: 'Cuenta Ahorro', value: '002222', active: true, position: 1 },
      ],
    }, {
      id: 'passwords', projectSlug: 'fenix', name: 'Contraseñas', fieldName: 'Contraseña', aliases: [], active: true, revision: 1,
      options: [{ id: 'password', label: 'Clave', value: 'must-not-load', active: true, position: 0 }],
    }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ catalogs }) } as Response);
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Harness() {
      const [data, setData] = useState(scenarios);
      return <><StoryDataPanel scenarios={data} readOnly={false} projectSlug="fenix" onChange={update => setData(current => typeof update === 'function' ? update(current) : update)} /><pre data-testid="scenarios">{JSON.stringify(data)}</pre></>;
    }
    unmount = async () => { await act(async () => root.unmount()); };
    await act(async () => { root.render(<Harness />); });
    await vi.waitFor(() => expect(host?.querySelector('select[data-field-capability="project_catalog"]')?.value).toBe('001111'));

    expect(host.querySelector('select[data-field-capability="project_catalog"]')?.options[0].textContent).toBe('Cuenta Corriente');
    expect(JSON.parse(host.querySelector('[data-testid="scenarios"]')?.textContent ?? '[]').map((scenario: TestDesignScenario) => scenario.data?.[0].value)).toEqual(['001111', '001111']);
    expect(host.querySelector('[aria-label="Catálogo de Contraseña"]')).toBeNull();
    expect(host.querySelector('input[type="password"]')).not.toBeNull();
  });
});
