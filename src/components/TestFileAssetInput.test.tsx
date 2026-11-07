import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestFileAssetInput } from './TestFileAssetInput';

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

describe('project test-file fixture input', () => {
  it('lists stored fixtures and uploads bytes to the selected project', async () => {
    const asset = { fileRef: '3c7d2dd0-58ed-485f-9b18-73a958da73b7', projectSlug: 'profile-a', filename: 'formulario.pdf', contentType: 'application/pdf', size: 10, sha256: 'hash', uploadedAt: '2026-10-27T00:00:00.000Z' };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ file: asset }) } as Response);
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let selected = '';
    unmount = async () => { await act(async () => root.unmount()); };
    await act(async () => root.render(<TestFileAssetInput area="test-design" projectSlug="profile-a" value={selected} onChange={value => { selected = value; }} />));
    await act(async () => { await Promise.resolve(); });

    const file = new File(['fixture'], 'formulario.pdf', { type: 'application/pdf' });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('/api/test-design/files?projectSlug=profile-a');
    expect((request?.body as FormData).get('projectSlug')).toBe('profile-a');
    expect((request?.body as FormData).get('file')).toBe(file);
    expect(selected).toBe(asset.fileRef);
  });
});

