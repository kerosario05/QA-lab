import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession } from './useRecordingSession';

/**
 * TICKET: a historical recording sometimes fails to (re)show "Escenarios" after the user
 * navigates away from the Recording screen and returns, then clicks it. `<Recording>` is
 * conditionally rendered by its parent (`{view === 'grabacion' && <Recording .../>}`) so it
 * FULLY UNMOUNTS/REMOUNTS on every navigation -- `openExistingRequestRef` and all session state
 * start fresh each time, which this file's tests confirm behaves like a first-ever open (no
 * cross-mount leakage is possible since the ref lives inside the hook instance).
 *
 * Two real gaps were found and fixed by direct code audit while tracing
 * click -> openExisting -> fetch -> apply -> render (see the new instrumentation logs in
 * `openExisting`/`index.tsx`'s render effect):
 *
 * 1. A 304 (or any non-2xx) already threw via `ApiError` in the transport layer -- correctly
 *    landing in the `rejected` branch, which never destroys state. Confirmed still true here,
 *    not a bug.
 * 2. A FULFILLED scenarios response whose body is missing/malformed the `scenarios` array
 *    itself (`scenarioResult.value.scenarios` not an array -- a genuinely malformed/truncated
 *    200, as opposed to an authoritative `scenarios: []`) was coerced via `?? []` into an empty
 *    array and applied as if authoritative, silently wiping the last good scenario list. Fixed
 *    by requiring `Array.isArray(...)` before ever treating a fulfilled result as usable; a
 *    non-array body is now treated like a transport failure (state preserved, `error` set).
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

const okScenarios = (id: string) => ({ ok: true, scenarios: [{ scenarioId: id, title: `Escenario ${id}` }], lifecycle: { scenariosReady: true } });
const okTrace = { ok: true, trace: { narrative: 'Narrativa' } };
const okSemantic = { ok: true, model: { datasets: [], semanticComponents: [], technicalObservations: [], recordingDataPolicy: { persistQaCredentials: false } } };
function notModified() {
  // A raw 304 has no usable JSON body -- `res.json()` throws, caught to `null`, and the
  // transport layer's `!res.ok` check turns it into a rejected ApiError.
  return new Response(null, { status: 304 });
}

describe('useRecordingSession — reopening a historical recording', () => {
  it('1/open200. opening a historical recording with a 200 scenarios response shows it', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
  });

  it('2/returnToPage. a fresh mount (simulating navigate-away-and-back) opens a historical recording exactly like a first-ever open', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    // First "visit": mount, open, then unmount (leaving Recording).
    const firstHolder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={firstHolder.onSession} />));
    await act(async () => { await firstHolder.get().openExisting('rec-1'); });
    expect(firstHolder.get().scenarios).toHaveLength(1);
    act(() => root?.unmount());
    container?.remove();

    // Second "visit": brand-new mount, brand-new hook instance/ref, click again.
    const secondHolder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={secondHolder.onSession} />));
    expect(secondHolder.get().scenarios).toHaveLength(0);
    await act(async () => { await secondHolder.get().openExisting('rec-1'); });
    expect(secondHolder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
  });

  it('3/repeat. repeated clicks on the same recording keep it visible', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
  });

  it('4/duplicateSameRecording. two concurrent openExisting calls for the SAME recording both resolve to the correct visible state', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => {
      await Promise.all([holder.get().openExisting('rec-1'), holder.get().openExisting('rec-1')]);
    });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
  });

  it('5/staleDifferentRecording. a slow response for an abandoned recording never overwrites the recording the user is now viewing', async () => {
    let resolveSlow: ((res: Response) => void) | undefined;
    stubFetchByPath({
      '/rec-old/scenarios?': () => new Promise((resolve) => { resolveSlow = resolve; }),
      '/rec-new/scenarios?': () => jsonResponse(okScenarios('new-scenario')),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = holder.get().openExisting('rec-old');
      await holder.get().openExisting('rec-new');
    });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['new-scenario']);
    await act(async () => {
      resolveSlow?.(jsonResponse(okScenarios('old-scenario')));
      await firstCall;
    });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['new-scenario']);
  });

  it('6/traceFailure. scenarios stay visible when trace fails', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse({ ok: false, error: 'boom' }, 502), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);
  });

  it('7/semanticFailure. scenarios stay visible when semantic fails', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse({ ok: false, error: 'boom' }, 502) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);
  });

  it('8/notModified. a raw 304 with no body is rejected by the transport layer and never destroys the already-loaded scenarios', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);

    stubFetchByPath({ '/scenarios?': () => notModified(), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);
  });

  it('9/malformed. a fulfilled 200 whose body is missing the scenarios array never overwrites the last good state', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);

    // Malformed: `ok: true` but no `scenarios` key at all.
    stubFetchByPath({ '/scenarios?': () => jsonResponse({ ok: true }), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
    expect(holder.get().error).toBeTruthy();
  });

  it('10/inactiveHistorical. a historical recording never depends on an active/recording phase to be shown', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().phase).not.toBe('recording');
    expect(holder.get().scenarios.length).toBeGreaterThan(0);
  });

  it('11/projectSwitch. a legitimate project switch still resets scenarios', async () => {
    stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios('s1')), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="project-a" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-1'); });
    expect(holder.get().scenarios).toHaveLength(1);
    act(() => root?.render(<Harness projectSlug="project-b" onSession={holder.onSession} />));
    await act(async () => { await Promise.resolve(); });
    expect(holder.get().scenarios).toHaveLength(0);
  });

  it('12/generic. no app/project/recording id is hardcoded in the reopen path', async () => {
    for (const [project, recordingId, scenarioId] of [['acme', 'grab-1', 'esc-1'], ['otro-proyecto', 'grabacion-2', 'escenario-2']] as const) {
      stubFetchByPath({ '/scenarios?': () => jsonResponse(okScenarios(scenarioId)), '/trace?': () => jsonResponse(okTrace), '/semantic?': () => jsonResponse(okSemantic) });
      const holder = latestSessionHolder();
      mount();
      act(() => root?.render(<Harness projectSlug={project} onSession={holder.onSession} />));
      await act(async () => { await holder.get().openExisting(recordingId); });
      expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual([scenarioId]);
      act(() => root?.unmount());
      container?.remove();
    }
  });
});
