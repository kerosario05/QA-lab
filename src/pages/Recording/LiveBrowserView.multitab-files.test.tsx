import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveBrowserView } from './LiveBrowserView';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  binaryType = '';
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];
  static instances: MockWebSocket[] = [];

  constructor(_url: string) { MockWebSocket.instances.push(this); }
  send(message: string) { this.sent.push(message); }
  close() { this.readyState = 3; }
  open() { this.readyState = MockWebSocket.OPEN; this.onopen?.(new Event('open')); }
  receive(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent); }
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(ui: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container!.querySelectorAll('button')).find((item) => item.textContent?.includes(text)) as HTMLButtonElement | undefined;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  MockWebSocket.instances = [];
});

describe('LiveBrowserView multi-tab and file input', () => {
  it('records URL navigation, tab selection, and selected files through the live session', async () => {
    localStorage.setItem('qa-lab.token', 'test-session');
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: ['a.pdf', 'b.pdf'] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveBrowserView recordingId="recording/1" viewport={{ width: 800, height: 600 }} />);

    const socket = MockWebSocket.instances[0];
    await act(async () => {
      socket.open();
      socket.receive({
        t: 'hello', ready: true, canControl: true, pageKey: 'tab-1',
        tabs: [{ pageKey: 'tab-1', url: 'https://portal-a.example', title: 'Portal A' }],
      });
    });

    const address = container!.querySelector('input[aria-label="Link de navegación"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(address, 'https://ejemplo.com');
      address.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => button('Ir')?.click());
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ t: 'navigate', url: 'https://ejemplo.com', newTab: false });

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(address, 'https://aprobaciones.example');
      address.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => button('Nueva pestaña')?.click());
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ t: 'navigate', url: 'https://aprobaciones.example', newTab: true });

    await act(async () => socket.receive({ t: 'tabs', selectedPageKey: 'tab-1', tabs: [
      { pageKey: 'tab-1', url: 'https://portal-a.example', title: 'Portal A' },
      { pageKey: 'tab-2', url: 'https://aprobaciones.example', title: 'Aprobaciones' },
    ] }));
    act(() => button('Aprobaciones')?.click());
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ t: 'select_tab', pageKey: 'tab-2' });

    await act(async () => socket.receive({ t: 'file_chooser', available: true, multiple: true, pageKey: 'tab-2' }));
    const fileInput = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.multiple).toBe(true);
    const selected = [new File(['one'], 'a.pdf', { type: 'application/pdf' }), new File(['two'], 'b.pdf', { type: 'application/pdf' })];
    Object.defineProperty(fileInput, 'files', { configurable: true, value: selected });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/recordings\/recording%2F1\/live-files$/);
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer test-session');
    expect((request.body as FormData).getAll('files').map((file) => (file as File).name)).toEqual(['a.pdf', 'b.pdf']);
    expect(container!.textContent).toContain('Adjuntado: a.pdf, b.pdf');
  });
});
