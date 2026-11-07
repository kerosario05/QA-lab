import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseDataPanel } from './CaseData';
import type { TestDesignDatum } from '../../services/test-design';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | undefined;
let unmount: (() => Promise<void>) | undefined;

afterEach(async () => {
  await unmount?.();
  host?.remove();
  host = undefined;
  unmount = undefined;
  vi.restoreAllMocks();
});

describe('Test Design file datum', () => {
  it('keeps the project fixture reference out of data catalog auto-binding', async () => {
    const fileRef = 'a68b0fb1-201b-4d63-a343-b92adee67662';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/api/projects/')) return { ok: true, json: async () => ({ catalogs: [
        { id: 'forms', projectSlug: 'profile-a', name: 'Forms', fieldName: 'Formulario', aliases: [], active: true, revision: 1,
          options: [{ id: 'sample', label: 'Sample', value: 'wrong-value', active: true, position: 0 }] },
      ] }) } as Response;
      return { ok: true, json: async () => ({ files: [
        { fileRef, projectSlug: 'profile-a', filename: 'formulario.pdf', contentType: 'application/pdf', size: 10, sha256: 'hash', uploadedAt: '2026-10-27T00:00:00.000Z' },
      ] }) } as Response;
    });

    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Harness() {
      const [data, setData] = useState<TestDesignDatum[]>([
        { key: 'formulario', label: 'Formulario', value: fileRef, controlType: 'file', sensitive: false, description: '' },
      ]);
      return <><CaseDataPanel data={data} readOnly={false} projectSlug="profile-a" onChange={setData} />
        <pre data-testid="data">{JSON.stringify(data)}</pre></>;
    }
    unmount = async () => { await act(async () => root.unmount()); };
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });

    const saved = JSON.parse(host.querySelector('[data-testid="data"]')?.textContent ?? '[]')[0];
    expect(saved.value).toBe(fileRef);
    expect(saved.catalogBinding).toBeUndefined();
    expect(host.querySelector('[aria-label="Catálogo de Formulario"]')).toBeNull();
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Archivo de prueba"]')?.value).toBe(fileRef);
  });
});

