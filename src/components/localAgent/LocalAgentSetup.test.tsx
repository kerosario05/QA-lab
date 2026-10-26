import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAgentProvider, useLocalAgent } from './LocalAgentContext';
import { LocalAgentSetupDialog } from './LocalAgentSetupDialog';

/**
 * Right after login the panel asks the server whether this PC has the QA Lab agent and the
 * recording Chromium. Agent without Chromium -> the install starts on its own and the user
 * sees "Instalando Chromium…" with progress. No agent -> nothing is shown.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const agent = { agentId: 'agent-0001', machine: 'PC-QA-01', windowsUser: 'kevin', agentVersion: '0.1.0', chromiumInstalled: false };

let latestPhase = '';
function PhaseProbe() {
  latestPhase = useLocalAgent().phase;
  return null;
}

function render(enabled = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <LocalAgentProvider enabled={enabled}>
      <LocalAgentSetupDialog />
      <PhaseProbe />
    </LocalAgentProvider>,
  ));
}

const text = () => container?.textContent ?? '';
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe('LocalAgent setup after login', () => {
  it('agent without Chromium: installs on its own and shows the progress until ready', async () => {
    vi.useFakeTimers();
    let install: any = null;
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/api/local-agent/install')) {
        install = { requestId: 'r1', revision: '1223', state: 'preparing', percent: 0 };
        return jsonResponse({ ok: true, install }, 202);
      }
      const ready = install?.state === 'done';
      return jsonResponse({
        ok: true, requiredRevision: '1223', pairing: 'found',
        agent: { ...agent, chromiumInstalled: ready }, install, ready,
      });
    }));

    render();
    await flush();
    expect(calls).toContain('POST /api/local-agent/install');
    expect(text()).toContain('Instalando Chromium en tu equipo para la grabación');
    expect(text()).toContain('El servidor está preparando Chromium');

    install = { ...install, state: 'download', percent: 45, receivedBytes: 90 * 1024 * 1024, totalBytes: 182 * 1024 * 1024 };
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(text()).toContain('45%');
    expect(text()).toContain('Descargando Chromium… 90 MB de 182 MB');

    install = { ...install, state: 'done', percent: 100 };
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(latestPhase).toBe('ready');
    expect(text()).toContain('Chromium está listo');

    // The confirmation closes itself.
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(container?.querySelector('[data-testid="local-agent-setup"]')).toBeNull();
  });

  it('no agent on this PC: nothing is shown and recordings stay integrated', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, requiredRevision: '1223', pairing: 'none', agent: null, install: null, ready: false }));
    vi.stubGlobal('fetch', fetchMock);
    render();
    await flush();
    expect(latestPhase).toBe('unavailable');
    expect(container?.querySelector('[data-testid="local-agent-setup"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('agent already has Chromium: ready without any dialog', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ok: true, requiredRevision: '1223', pairing: 'found', agent: { ...agent, chromiumInstalled: true }, install: null, ready: true,
    })));
    render();
    await flush();
    expect(latestPhase).toBe('ready');
    expect(container?.querySelector('[data-testid="local-agent-setup"]')).toBeNull();
  });

  it('several PCs behind the same IP: the user picks theirs', async () => {
    vi.useFakeTimers();
    const other = { ...agent, agentId: 'agent-0002', machine: 'PC-QA-02', windowsUser: 'ana', chromiumInstalled: true };
    let selected = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/local-agent/select')) {
        selected = JSON.parse(String(init?.body)).agentId;
        return jsonResponse({ ok: true, pairing: 'found', requiredRevision: '1223', agent: other, install: null, ready: true });
      }
      return jsonResponse({ ok: true, requiredRevision: '1223', pairing: 'ambiguous', agent: null, candidates: [agent, other], install: null, ready: false });
    }));
    render();
    await flush();
    expect(text()).toContain('Elige tu equipo');
    const button = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('PC-QA-02'))!;
    await act(async () => { button.click(); await vi.advanceTimersByTimeAsync(0); });
    expect(selected).toBe('agent-0002');
    expect(latestPhase).toBe('ready');
    expect(container?.querySelector('[data-testid="local-agent-setup"]')).toBeNull();
  });

  it('without recording permission it does not ask the server at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(false);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('install failure: shows the reason and lets the user retry', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/local-agent/install')) {
        attempts += 1;
        return jsonResponse({ ok: true, install: { requestId: `r${attempts}`, revision: '1223', state: 'preparing', percent: 0 } }, 202);
      }
      return jsonResponse({
        ok: true, requiredRevision: '1223', pairing: 'found', agent, ready: false,
        install: attempts ? { requestId: `r${attempts}`, revision: '1223', state: 'error', percent: 30, message: 'No hay espacio en disco' } : null,
      });
    }));
    render();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(latestPhase).toBe('error');
    expect(text()).toContain('No hay espacio en disco');
    const retry = [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar')!;
    await act(async () => { retry.click(); await vi.advanceTimersByTimeAsync(0); });
    expect(attempts).toBe(2);
    expect(latestPhase).toBe('installing');
  });
});
