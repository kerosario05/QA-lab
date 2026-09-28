import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession } from './useRecordingSession';

/**
 * Long recordings used to look frozen after Stop / "Generar escenarios": both were one silent
 * request, and the QA Lab proxy cut them at 5 minutes with a 504 that the panel showed as an
 * error (Stop even went back to "recording") while the engine kept working. Generation now runs
 * in the background and the panel polls its progress.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

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

/** Handlers are matched in insertion order: list '/derivation' before '/derive'. */
function stubFetchByPath(handlers: Array<[string, () => Response]>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [fragment, handler] of handlers) {
      if (url.includes(fragment)) return handler();
    }
    return jsonResponse({ ok: true });
  }));
}

function sequence(...bodies: Array<[unknown, number?]>): () => Response {
  let index = 0;
  return () => {
    const [body, status] = bodies[Math.min(index, bodies.length - 1)];
    index += 1;
    return jsonResponse(body, status ?? 200);
  };
}

const summary = { recordingId: 'rec-1', projectSlug: 'p', appSlug: 'p', platform: 'web', status: 'recording', startedAt: '2026-09-28T00:00:00.000Z', eventCount: 0, screenCount: 0, actionCount: 0, hasNarrative: false, scenarioCount: 0 };
const startOk = { ok: true, recordingId: 'rec-1', jobId: 'job-1', summary };
const stoppedSummary = { ...summary, status: 'stopped', scenarioCount: 1 };
const derivedSummary = { ...summary, status: 'derived', scenarioCount: 1 };
const persisted = {
  ok: true,
  scenarios: [{ scenarioId: 'REC-1-01', title: 'Préstamo personal', primary: true }],
  lifecycle: { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: true },
};

async function mountAndStart() {
  let latest: SessionSnapshot | undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness onSession={(s) => { latest = s; }} />));
  await act(async () => { await latest!.start('roque 7'); });
  return () => latest!;
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useRecordingSession — background step generation', () => {
  it('shows the stage while generating, then loads the persisted steps', async () => {
    stubFetchByPath([
      ['/recordings/start', () => jsonResponse(startOk)],
      ['/rec-1/stop', () => jsonResponse({ ok: true, summary: stoppedSummary })],
      ['/rec-1/derivation', sequence(
        [{ ok: true, derivation: { recordingId: 'rec-1', status: 'deriving', stage: 'building_steps', stageIndex: 2, stageCount: 4, actionCount: 18 } }],
        [{ ok: true, derivation: { recordingId: 'rec-1', status: 'derived', stageIndex: 4, stageCount: 4, actionCount: 18, stepCount: 19, scenarioCount: 1 } }],
      )],
      ['/rec-1/derive', () => jsonResponse({ ok: true, derivation: { recordingId: 'rec-1', status: 'deriving', stageIndex: 0, stageCount: 4 } }, 202)],
      ['/rec-1/scenarios?', () => jsonResponse(persisted)],
      ['/rec-1?', () => jsonResponse({ ok: true, active: false, summary: derivedSummary })],
    ]);
    const session = await mountAndStart();
    await act(async () => { await session().stop(); });

    let derived!: Promise<void>;
    act(() => { derived = session().derive(); });
    await advance(0);
    expect(session().phase).toBe('deriving');
    expect(session().generation).toMatchObject({ kind: 'deriving', derivation: { stageIndex: 0 } });

    await advance(2_000);
    expect(session().generation).toMatchObject({ kind: 'deriving', derivation: { stage: 'building_steps', actionCount: 18 } });

    await advance(2_000);
    await act(async () => { await derived; });
    expect(session().phase).toBe('derived');
    expect(session().generation).toBeNull();
    expect(session().scenarios.map((s) => s.scenarioId)).toEqual(['REC-1-01']);
    expect(session().persistedScenarioIds.has('REC-1-01')).toBe(true);
    expect(session().summary?.status).toBe('derived');
    expect(session().error).toBeNull();
  });

  it('a failure reported by the engine is shown as its own message', async () => {
    stubFetchByPath([
      ['/recordings/start', () => jsonResponse(startOk)],
      ['/rec-1/stop', () => jsonResponse({ ok: true, summary: stoppedSummary })],
      ['/rec-1/derivation', () => jsonResponse({ ok: true, derivation: { recordingId: 'rec-1', status: 'failed', errorMessage: 'No se puede generar escenarios sin un objetivo de grabación declarado' } })],
      ['/rec-1/derive', () => jsonResponse({ ok: true, derivation: { recordingId: 'rec-1', status: 'deriving', stageIndex: 0, stageCount: 4 } }, 202)],
      ['/rec-1/scenarios?', () => jsonResponse(persisted)],
    ]);
    const session = await mountAndStart();
    await act(async () => { await session().stop(); });

    let derived!: Promise<void>;
    act(() => { derived = session().derive(); });
    await advance(2_000);
    await act(async () => { await derived; });
    expect(session().phase).toBe('stopped');
    expect(session().error).toBe('No se puede generar escenarios sin un objetivo de grabación declarado');
    expect(session().generation).toBeNull();
  });

  it('a transient polling error (504 from the proxy) never ends the wait', async () => {
    stubFetchByPath([
      ['/recordings/start', () => jsonResponse(startOk)],
      ['/rec-1/stop', () => jsonResponse({ ok: true, summary: stoppedSummary })],
      ['/rec-1/derivation', sequence(
        [{ ok: false, errorCode: 'TIMEOUT', message: 'Timeout after 15000ms' }, 504],
        [{ ok: true, derivation: { recordingId: 'rec-1', status: 'derived', stageIndex: 4, stageCount: 4, scenarioCount: 1 } }],
      )],
      ['/rec-1/derive', () => jsonResponse({ ok: true, derivation: { recordingId: 'rec-1', status: 'deriving', stageIndex: 0, stageCount: 4 } }, 202)],
      ['/rec-1/scenarios?', () => jsonResponse(persisted)],
      ['/rec-1?', () => jsonResponse({ ok: true, active: false, summary: derivedSummary })],
    ]);
    const session = await mountAndStart();
    await act(async () => { await session().stop(); });

    let derived!: Promise<void>;
    act(() => { derived = session().derive(); });
    await advance(2_000);
    expect(session().phase).toBe('deriving');
    await advance(2_000);
    await act(async () => { await derived; });
    expect(session().phase).toBe('derived');
    expect(session().error).toBeNull();
  });
});

describe('useRecordingSession — Stop on a long recording', () => {
  it('shows pending captures while stopping, and a proxy 504 waits for the engine instead of reverting to "recording"', async () => {
    stubFetchByPath([
      ['/recordings/start', () => jsonResponse(startOk)],
      ['/rec-1/stop', () => jsonResponse({ ok: false, errorCode: 'TIMEOUT', error: 'Provider request timed out', message: 'Timeout after 300000ms' }, 504)],
      ['/rec-1/scenarios?', () => jsonResponse(persisted)],
      ['/rec-1?', sequence(
        [{ ok: true, active: true, summary, live: { events: 40, screens: 5, currentScreen: 'x', stopping: true, pendingCaptures: 3 } }],
        [{ ok: true, active: true, summary, live: { events: 40, screens: 5, currentScreen: 'x', stopping: true, pendingCaptures: 3 } }],
        [{ ok: true, active: false, summary: stoppedSummary }],
      )],
    ]);
    const session = await mountAndStart();

    let stopped!: Promise<void>;
    act(() => { stopped = session().stop(); });
    await advance(1_000);
    expect(session().phase).toBe('stopping');
    expect(session().generation).toMatchObject({ kind: 'stopping', pendingCaptures: 3, events: 40 });

    await advance(4_000);
    await act(async () => { await stopped; });
    expect(session().phase).toBe('stopped');
    expect(session().error).toBeNull();
    expect(session().generation).toBeNull();
    expect(session().summary?.status).toBe('stopped');
    expect(session().scenarios.map((s) => s.scenarioId)).toEqual(['REC-1-01']);
  });
});
