import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession, type RecordingBrowserMode } from './useRecordingSession';

/**
 * In agent mode the recording runs in a Chromium window on the user's PC. Closing that window
 * makes the engine stop and save the recording by itself; the panel only notices through its
 * status poll (`active: false`). It must then land in `stopped` with the persisted scenarios,
 * exactly as if the user had pressed Detener, and say why.
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

type SessionSnapshot = ReturnType<typeof useRecordingSession>;

function Harness({ onSession }: { onSession: (session: SessionSnapshot) => void }) {
  onSession(useRecordingSession('p'));
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summary = { recordingId: 'rec-1', projectSlug: 'p', appSlug: 'p', platform: 'web', startedAt: '2026-10-15T00:00:00.000Z', eventCount: 0, screenCount: 0, actionCount: 0, hasNarrative: false, scenarioCount: 0 };
const persisted = {
  ok: true,
  scenarios: [{ scenarioId: 'scenario-closed', title: 'Inicio de sesión', primary: true }],
  lifecycle: { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: true },
};

function stubEngine(state: { active: boolean; stopCalls: number; startBody?: any }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/recordings/start')) {
      state.startBody = JSON.parse(String(init?.body ?? '{}'));
      return jsonResponse({ ok: true, recordingId: 'rec-1', jobId: 'job-1', summary: { ...summary, status: 'recording' } });
    }
    if (url.includes('/rec-1/stop')) {
      state.stopCalls += 1;
      return jsonResponse({ ok: true, summary: { ...summary, status: 'stopped', scenarioCount: 1 } });
    }
    if (url.includes('/rec-1/scenarios?')) return jsonResponse(persisted);
    if (url.includes('/rec-1?projectSlug=')) {
      return jsonResponse(state.active
        ? { ok: true, active: true, summary: { ...summary, status: 'recording', eventCount: 4 }, live: { events: 4, screens: 1, currentScreen: 'Login' } }
        : { ok: true, active: false, summary: { ...summary, status: 'stopped', eventCount: 4, scenarioCount: 1 } });
    }
    return jsonResponse({ ok: true, recordings: [] });
  }));
}

async function mountAndStart(mode: RecordingBrowserMode) {
  let latest: SessionSnapshot | undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness onSession={(s) => { latest = s; }} />));
  let started = false;
  await act(async () => { started = await latest!.start('Inicio de sesión', mode); });
  return { get: () => latest!, started };
}

describe('useRecordingSession — the engine stops the recording by itself', () => {
  it('sends browserMode "agent" and reports that the recording started', async () => {
    const state = { active: true, stopCalls: 0 } as { active: boolean; stopCalls: number; startBody?: any };
    stubEngine(state);
    const holder = await mountAndStart('agent');
    expect(holder.started).toBe(true);
    expect(state.startBody.browserMode).toBe('agent');
    expect(holder.get().phase).toBe('recording');
  });

  it('window closed on the PC: ends in stopped with the persisted scenario and a notice, without calling stop', async () => {
    vi.useFakeTimers();
    const state = { active: true, stopCalls: 0 };
    stubEngine(state);
    const holder = await mountAndStart('agent');

    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(holder.get().phase).toBe('recording');
    expect(holder.get().live?.events).toBe(4);

    state.active = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(holder.get().phase).toBe('stopped');
    expect(holder.get().persistedScenarioIds.has('scenario-closed')).toBe(true);
    expect(holder.get().notice).toMatch(/Se cerró la ventana del navegador/);
    expect(state.stopCalls).toBe(0);

    // Polling ended: later ticks change nothing.
    const fetchMock = vi.mocked(fetch);
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/rec-1?projectSlug=')).length)
      .toBe(fetchMock.mock.calls.slice(0, calls).filter(([u]) => String(u).includes('/rec-1?projectSlug=')).length);
  });

  it('user pressed Detener: an inactive poll during the stop does not finish the session twice', async () => {
    vi.useFakeTimers();
    const state = { active: true, stopCalls: 0 };
    stubEngine(state);
    const holder = await mountAndStart('agent');
    state.active = false;
    await act(async () => {
      const stopping = holder.get().stop();
      await vi.advanceTimersByTimeAsync(1100);
      await stopping;
    });
    expect(state.stopCalls).toBe(1);
    expect(holder.get().phase).toBe('stopped');
    expect(holder.get().notice).toBeNull();
  });

  it('a failed start returns false so the page can re-check the agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/recordings/start')) {
        return jsonResponse({ ok: false, errorCode: 'LOCAL_AGENT_NOT_FOUND', message: 'No hay un agente de QA Lab conectado desde tu equipo' }, 409);
      }
      return jsonResponse({ ok: true, recordings: [] });
    }));
    const holder = await mountAndStart('agent');
    expect(holder.started).toBe(false);
    expect(holder.get().phase).toBe('idle');
    expect(holder.get().error).toMatch(/agente de QA Lab/);
  });
});
