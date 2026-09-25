import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession } from './useRecordingSession';

/**
 * FIRST_LOSS: `stop()`'s own backend response (`POST /:id/stop` -> `{ summary }`) never carries
 * scenarioIds/payload -- `RecordingSummary` only has a `scenarioCount` NUMBER -- even though the
 * backend had, by the time that response resolved, already run
 * `materializeObservedPrimaryScenario` + `saveScenarios` (confirmed via the
 * `[recording-scenario-store]` save/load log pair for a real recording). `stop()` never read the
 * persisted store afterward: it left `scenarios` untouched (still whatever the LIVE/unpersisted
 * poll preview had last set, before `stopPolling()` ran) and unconditionally cleared
 * `persistedScenarioIds` to empty. `scenarioPersisted` (index.tsx) is keyed off
 * `session.persistedScenarioIds`, so the just-persisted observed primary produced the exact false
 * "escenario pendiente de materialización" reported, disappearing only once "Generar escenarios"
 * (`derive()`) separately populated `persistedScenarioIds` from ITS OWN response.
 *
 * Fixed by having `stop()` read the SAME already-existing `GET .../scenarios` endpoint
 * `openExisting` already trusts as authoritative (see `useRecordingSession.history-reopen.test.tsx`)
 * right after `POST /stop` resolves -- a read of the persisted store, never `derive()`/AI
 * generation, which stays a fully separate, optional, user-triggered call this fix never invokes.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

type SessionSnapshot = ReturnType<typeof useRecordingSession>;

function Harness({ projectSlug, onSession }: { projectSlug: string; onSession: (session: SessionSnapshot) => void }) {
  const session = useRecordingSession(projectSlug);
  onSession(session);
  return null;
}

function latestSessionHolder() {
  let latest: SessionSnapshot | undefined;
  const onSession = (session: SessionSnapshot) => {
    latest = session;
  };
  return { get: () => latest!, onSession };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetchByPath(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (url.includes(fragment)) return handler();
      }
      return jsonResponse({ ok: true }, 200);
    }),
  );
}

const startOk = { ok: true, recordingId: 'rec-1', jobId: 'job-1', summary: { recordingId: 'rec-1', projectSlug: 'p', appSlug: 'p', platform: 'web', status: 'recording', startedAt: '2026-09-18T00:00:00.000Z', eventCount: 0, screenCount: 0, actionCount: 0, hasNarrative: false, scenarioCount: 0 } };
// STOP's own response: only ever a COUNT, never a scenarioId/payload -- exactly what the real
// backend route (`res.json({ ok: true, summary })`, `RecordingSummary.scenarioCount: number`)
// returns.
const stopOk = { ok: true, summary: { ...startOk.summary, status: 'stopped', scenarioCount: 1 } };
const persistedScenarios = (id: string) => ({
  ok: true,
  scenarios: [{ scenarioId: id, title: 'Solicitud multiproducto', primary: true }],
  lifecycle: { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: true },
});

async function mountAndStart(projectSlug = 'p') {
  const holder = latestSessionHolder();
  mount();
  act(() => root?.render(<Harness projectSlug={projectSlug} onSession={holder.onSession} />));
  await act(async () => { await holder.get().start(); });
  return holder;
}

describe('useRecordingSession — STOP hydrates the persisted primary immediately', () => {
  it('1/stopPersist. STOP returns and the persisted store already has the primary -> persistedScenarioIds contains it, no derive() call needed', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse(persistedScenarios('REC-22AB5B69-01')),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    expect(holder.get().persistedScenarioIds.has('REC-22AB5B69-01')).toBe(true);
  });

  it('2/immediateReplayState. the primary is visible in `scenarios` immediately after STOP, with no "pending materialization" gap', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse(persistedScenarios('REC-22AB5B69-01')),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['REC-22AB5B69-01']);
    expect(holder.get().persistedScenarioIds.has('REC-22AB5B69-01')).toBe(true);
  });

  it('3/noGenerateDependency. materialization never requires a derive() call -- STOP alone hydrates persisted state', async () => {
    let deriveCalled = false;
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse(persistedScenarios('REC-22AB5B69-01')),
      '/rec-1/derive': () => { deriveCalled = true; return jsonResponse({ ok: true, scenarios: [] }); },
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    expect(deriveCalled).toBe(false);
    expect(holder.get().persistedScenarioIds.size).toBe(1);
  });

  it('4/refresh. reopening the same recording afterward (openExisting) keeps the persisted primary -- independent hydration paths agree', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse(persistedScenarios('REC-22AB5B69-01')),
      '/trace?': () => jsonResponse({ ok: true, trace: { narrative: '' } }),
      '/semantic?': () => jsonResponse({ ok: true, model: { datasets: [], semanticComponents: [], technicalObservations: [], recordingDataPolicy: { persistQaCredentials: false } } }),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    expect(holder.get().persistedScenarioIds.has('REC-22AB5B69-01')).toBe(true);
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().persistedScenarioIds.has('REC-22AB5B69-01')).toBe(true);
  });

  it('5/deriveRegression. derive() still populates persistedScenarioIds for its own derived variants, unaffected by this fix', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse(persistedScenarios('REC-22AB5B69-01')),
      '/rec-1/derive': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 'REC-22AB5B69-01' }, { scenarioId: 'REC-22AB5B69-02-suggestion' }], summary: startOk.summary }),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    await act(async () => { await holder.get().derive(); });
    expect([...holder.get().persistedScenarioIds].sort()).toEqual(['REC-22AB5B69-01', 'REC-22AB5B69-02-suggestion']);
  });

  it('6/realMissingMaterialization. STOP with a genuinely empty persisted store still reports nothing persisted -- the fix is not a blanket "always persisted"', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse({ ok: true, summary: { ...startOk.summary, status: 'stopped', scenarioCount: 0 } }),
      '/rec-1/scenarios?': () => jsonResponse({ ok: true, scenarios: [], lifecycle: { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: false } }),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    expect(holder.get().persistedScenarioIds.size).toBe(0);
    expect(holder.get().scenarios).toHaveLength(0);
  });

  it('7/transientFailure. a transient failure reading the persisted store right after STOP never fabricates a false-empty result over prior state', async () => {
    stubFetchByPath({
      '/recordings/start': () => jsonResponse(startOk),
      '/rec-1/stop': () => jsonResponse(stopOk),
      '/rec-1/scenarios?': () => jsonResponse({ ok: false, error: 'boom' }, 502),
    });
    const holder = await mountAndStart();
    await act(async () => { await holder.get().stop(); });
    // No prior scenarios existed (nothing to preserve) -- assert the failure path does not throw
    // and does not fabricate a persisted id that was never actually confirmed.
    expect(holder.get().persistedScenarioIds.size).toBe(0);
    expect(holder.get().phase).toBe('stopped');
  });

  it('8/multiproject. no appSlug/recordingId hardcode governs the hydration path', async () => {
    for (const [projectSlug, recordingId, scenarioId] of [['acme', 'rec-a', 'esc-a'], ['otro-proyecto', 'rec-b', 'esc-b']] as const) {
      stubFetchByPath({
        '/recordings/start': () => jsonResponse({ ...startOk, recordingId }),
        [`/${recordingId}/stop`]: () => jsonResponse(stopOk),
        [`/${recordingId}/scenarios?`]: () => jsonResponse(persistedScenarios(scenarioId)),
      });
      const holder = await mountAndStart(projectSlug);
      await act(async () => { await holder.get().stop(); });
      expect(holder.get().persistedScenarioIds.has(scenarioId)).toBe(true);
      act(() => root?.unmount());
      container?.remove();
    }
  });
});
