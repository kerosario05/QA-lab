import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession } from './useRecordingSession';

/**
 * FIRST_LOSS: `openExisting` (the function that fires GET scenarios/trace/semantic together --
 * exactly the physically-observed three-request pattern) used a single `Promise.all` where only
 * `trace`/`semantic` were individually `.catch()`-guarded (falling back to an EMPTY
 * `{trace:{}}`/`{model:null}` on failure -- itself destructive, silently wiping any
 * already-loaded narrative/semantic model). `scenarios` had no guard at all: if it rejected (a
 * transport failure -- the reported 502/"fetch failed" from a proxy backend hiccup, never an
 * authoritative empty list), the WHOLE `Promise.all` rejected, and while the outer catch didn't
 * itself call `setScenarios([])`, the net effect combined with the trace/semantic fallbacks was
 * that a single transient provider failure on any of the three silently discarded already-loaded
 * state for that resource.
 *
 * Fixed with `Promise.allSettled`: each of scenarios/trace/semantic is applied to state ONLY on
 * its own individual success; a rejected one leaves whatever was already in state untouched. A
 * request-sequencing guard (`openExistingRequestRef`) also ensures a slow/failed response from an
 * OLDER call can never overwrite state after a newer `openExisting` call has already started.
 *
 * These tests exercise the real `useRecordingSession` hook (via a tiny harness component --
 * this repo has no `renderHook` utility) against `vi.stubGlobal('fetch', ...)`, matching the
 * established mocking convention in `transport-contract.test.ts`.
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

const okScenarios = { ok: true, scenarios: [{ scenarioId: 's1', title: 'Escenario 1' }], lifecycle: { scenariosReady: true } };
const okTrace = { ok: true, trace: { narrative: 'Narrativa original' } };
const okSemantic = { ok: true, model: { datasets: [], semanticComponents: [], technicalObservations: [], recordingDataPolicy: { persistQaCredentials: false } } };
function badGateway() {
  return jsonResponse({ ok: false, errorCode: 'PROVIDER_ERROR', error: 'Provider request failed', message: 'fetch failed' }, 502);
}

describe('useRecordingSession openExisting — provider failure resilience', () => {
  it('1/scenarios200. a successful scenarios response updates state', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
    expect(holder.get().narrative).toBe('Narrativa original');
  });

  it('2/scenarios502. scenarios fails: previous scenarios preserved, error surfaced', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(1);

    stubFetchByPath({ '/scenarios?': badGateway, '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
    expect(holder.get().error).toBeTruthy();
  });

  it('3/trace502. trace fails: scenarios AND previous narrative preserved', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();

    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': badGateway, '/semantic?': () => jsonResponse(okSemantic) });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(1);
    expect(holder.get().narrative).toBe('Narrativa original');
  });

  it('4/semantic502. semantic fails: scenarios AND previous semantic model preserved', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().semanticModel).not.toBeNull();

    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': badGateway });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(1);
    expect(holder.get().semanticModel).not.toBeNull();
  });

  it('5/all502. all three fail: scenarios remain visible, none silently cleared', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();

    stubFetchByPath({ '/scenarios?': badGateway, '/trace?': badGateway, '/semantic?': badGateway });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(1);
    expect(holder.get().narrative).toBe('Narrativa original');
    expect(holder.get().semanticModel).not.toBeNull();
  });

  it('7/authoritativeEmpty. a genuinely successful, empty scenarios list is accepted', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(1);

    stubFetchByPath({ '/scenarios?': () => jsonResponse({ ok: true, scenarios: [], lifecycle: { scenariosReady: false } }), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();
    expect(holder.get().scenarios).toHaveLength(0);
  });

  it('9/stale. an older, slower response arriving after a newer successful one is ignored', async () => {
    let resolveSlow: ((value: Response) => void) | undefined;
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/scenarios?')) {
          callCount += 1;
          if (callCount === 1) {
            return new Promise<Response>((resolve) => { resolveSlow = resolve; });
          }
          return jsonResponse({ ok: true, scenarios: [{ scenarioId: 'newer' }], lifecycle: { scenariosReady: true } });
        }
        if (url.includes('/trace?')) return jsonResponse(okTrace);
        if (url.includes('/semantic?')) return jsonResponse(okSemantic);
        return jsonResponse({ ok: true });
      }),
    );
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));

    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = holder.get().openExisting('rec-1'); // starts the slow, older call
      await holder.get().openExisting('rec-1'); // starts and awaits the faster, newer call
    });
    await flush();
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['newer']);

    // Now let the OLDER, slower request resolve -- with a DIFFERENT (stale) payload.
    await act(async () => {
      resolveSlow?.(jsonResponse({ ok: true, scenarios: [{ scenarioId: 'stale' }], lifecycle: { scenariosReady: true } }));
      await firstCall;
    });
    await flush();
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['newer']);
  });

  it('12/generic. no app/project hardcode: works for an arbitrary recordingId/projectSlug pair', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 'cualquier-id' }], lifecycle: { scenariosReady: true } }), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="cualquier-proyecto" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('cualquier-recording-id'); });
    await flush();
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['cualquier-id']);
  });
});

describe('useRecordingSession live-poll scenariosReady', () => {
  // FIRST_LOSS: while a recording is still active, the poll showed a LIVE, unpersisted preview
  // (`status.live?.scenarios`) as the scenario list, but `scenariosReady` counted that same
  // preview as evidence of backend materialization -- a false positive, since the backend's own
  // `PUT /scenario-value` only ever checks its OWN persisted store (populated by `derive()`,
  // never by the live poll). `scenariosReady` must only ever reflect `status.scenarios`.
  it('a live-only preview (status.live.scenarios, no status.scenarios yet) never reports scenariosReady=true', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/start')) return jsonResponse({ recordingId: 'rec-1', summary: {} });
        if (url.includes('/rec-1?')) {
          return jsonResponse({
            active: true,
            summary: {},
            live: { scenarios: [{ scenarioId: 'live-preview' }] },
            // No `scenarios` field at all -- nothing persisted yet.
          });
        }
        return jsonResponse({ ok: true });
      }),
    );
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['live-preview']);
    expect(holder.get().lifecycle?.scenariosReady).toBe(false);
    expect(holder.get().persistedScenarioIds.size).toBe(0);
    vi.useRealTimers();
  });

  // FIRST_LOSS (round 2): backend research on `recordings.ts` GET /:recordingId confirmed that
  // WHILE ACTIVE, the status route answers with `entry.liveProjection.scenarios` reused under
  // the very same `scenarios` key -- an in-memory preview, never the persisted store
  // `loadScenarios()` reads. A non-empty `status.scenarios` during an ACTIVE poll therefore proves
  // NOTHING about persistence: readiness (and per-scenario persisted authority) must only ever
  // come from `derive()`'s own response or `GET .../scenarios`, never from this poll, active or
  // not.
  it('a non-empty status.scenarios during an ACTIVE poll never reports scenariosReady=true (it is the live projection, not the persisted store)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/start')) return jsonResponse({ recordingId: 'rec-1', summary: {} });
        if (url.includes('/rec-1?')) {
          return jsonResponse({
            active: true,
            summary: {},
            scenarios: [{ scenarioId: 'persisted' }],
            live: { scenarios: [{ scenarioId: 'persisted' }] },
          });
        }
        return jsonResponse({ ok: true });
      }),
    );
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(holder.get().lifecycle?.scenariosReady).toBe(false);
    expect(holder.get().persistedScenarioIds.size).toBe(0);
    vi.useRealTimers();
  });

  // 3/persistedSameId + 4/differentPersistedId: only `derive()`'s response and
  // `GET .../scenarios` are trusted as per-scenario persisted authority.
  it('derive() response marks exactly its own scenarioIds as persisted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/start')) return jsonResponse({ recordingId: 'rec-1', summary: {} });
        if (url.includes('/derive')) {
          return jsonResponse({ ok: true, scenarios: [{ scenarioId: 'a' }, { scenarioId: 'b' }], summary: {} });
        }
        return jsonResponse({ ok: true });
      }),
    );
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().start(); });
    await act(async () => { await holder.get().derive(); });

    expect([...holder.get().persistedScenarioIds].sort()).toEqual(['a', 'b']);
    expect(holder.get().persistedScenarioIds.has('c')).toBe(false);
  });

  it('GET .../scenarios (openExisting) marks exactly the returned scenarioIds as persisted', async () => {
    stubFetchByPath({
      '/scenarios?': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 'only-this-one' }], lifecycle: { scenariosReady: true } }),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await flush();

    expect([...holder.get().persistedScenarioIds]).toEqual(['only-this-one']);
    expect(holder.get().persistedScenarioIds.has('another-scenario')).toBe(false);
  });
});

