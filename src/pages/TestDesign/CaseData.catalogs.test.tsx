import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseDataPanel } from './CaseData';
import type { TestDesignDatum } from '../../services/test-design';

let host: HTMLDivElement | undefined;
let unmount: (() => Promise<void>) | undefined;

afterEach(async () => {
  await unmount?.();
  host?.remove();
  host = undefined;
  unmount = undefined;
  vi.restoreAllMocks();
});

describe('Test Design project catalog defaults', () => {
  it('selects the first active option automatically and keeps password fields out of catalogs', async () => {
    const catalogs = [
      { id: 'accounts', projectSlug: 'fenix', name: 'Cuentas', fieldName: 'Cuenta de origen', aliases: ['cuenta origen'], active: true, revision: 1,
        options: [
          { id: 'account-first', label: 'Cuenta Corriente', value: '001111', active: true, position: 0 },
          { id: 'account-second', label: 'Cuenta de ahorro', value: '002222', active: true, position: 1 },
        ] },
      { id: 'passwords', projectSlug: 'fenix', name: 'Contraseñas', fieldName: 'Contraseña', aliases: [], active: true, revision: 1,
        options: [{ id: 'password-first', label: 'Clave', value: 'do-not-use', active: true, position: 0 }] },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ catalogs }) } as Response);
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Harness() {
      const [data, setData] = useState<TestDesignDatum[]>([
        { key: 'cuenta_origen', label: 'Cuenta de origen', value: '', sensitive: false, description: '' },
        { key: 'contrasena', label: 'Contraseña', value: '', sensitive: true, description: '' },
      ]);
      return <><CaseDataPanel data={data} readOnly={false} projectSlug="fenix" onChange={setData} /><pre data-testid="data">{JSON.stringify(data)}</pre></>;
    }
    unmount = async () => { await act(async () => root.unmount()); };
    await act(async () => { root.render(<Harness />); });
    await act(async () => { await Promise.resolve(); });

    const accountOption = host.querySelector<HTMLSelectElement>('[aria-label="Opción para Cuenta de origen"]');
    expect(accountOption?.value).toBe('account-first');
    expect(JSON.parse(host.querySelector('[data-testid="data"]')?.textContent ?? '[]')[0].value).toBe('001111');
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Catálogo de Contraseña"]')?.disabled).toBe(true);
    expect(host.querySelector('[aria-label="Opción para Contraseña"]')).toBeNull();
    expect(host.textContent).toContain('Por seguridad, los datos sensibles no usan catálogos.');
    const accountRow = host.querySelector('[aria-label="Catálogo de Cuenta de origen"]')?.closest('.grid');
    const passwordRow = host.querySelector('[aria-label="Catálogo de Contraseña"]')?.closest('.grid');
    expect(accountRow?.children).toHaveLength(5);
    expect(passwordRow?.children).toHaveLength(5);
    expect(host.querySelector('[aria-label="Catálogo de Contraseña"]')?.parentElement?.textContent).toContain('Por seguridad');
  });
});
