import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSession } from './useRecordingSession';
import { canShowScenarioGenerationPanel } from './index';

/**
 * TICKET (recordingId df1bdcbd-8e22-4c85-b259-5dde8fe8e277): clicking "Generar escenarios" after
 * stopping a recording never sent `POST /derive` and the scenarios panel disappeared entirely.
 *
 * FIRST LOSS: not `derive()`'s own guard (`if (!recordingId) return;`, always correct once
 * `openExisting`/`stop` set it) -- it was the JSX render gate in `index.tsx`, which ALSO required
 * `session.summary` to render the whole panel (button included). `openExisting` only ever
 * populates `summary` via `history.find((h) => h.recordingId === id)`, a lookup into a `history`
 * array that can legitimately not yet contain a just-finished recording (a `refreshHistory()`
 * race) even though `recordingId`/`phase` are already correct -- silently hiding the button, so
 * the click never happened and no request was ever sent.
 *
 * Fixed by extracting the render decision as a pure predicate (`canShowScenarioGenerationPanel`,
 * matching this file's existing `decideDatasetSaveAction`/`canReplayScenario` pattern) that
 * depends ONLY on `phase`, never on `summary` -- `summary` now only gates the display-only stat
 * row inside the panel, never the derive capability itself.
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

function stubFetchByPath(handlers: Record<string, (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>>) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (url.includes(fragment)) return handler(input, init);
      }
      return jsonResponse({ ok: true }, 200);
    }),
  );
  return calls;
}

const okScenariosEmpty = { ok: true, scenarios: [], lifecycle: { scenariosReady: false } };
const okTrace = { ok: true, trace: { narrative: 'Narrativa' } };
const okSemantic = { ok: true, model: { datasets: [], semanticComponents: [], technicalObservations: [], recordingDataPolicy: { persistQaCredentials: false } } };
const okDerive = (scenarioId: string) => ({ ok: true, scenarios: [{ scenarioId, title: `Escenario ${scenarioId}` }], summary: { recordingId: 'rec-x', actionCount: 5, screenCount: 2, durationMs: 1000 } });

describe('Recording — "Generar escenarios" after stop / history selection', () => {
  it('1/stopThenDerive. after start -> stop, clicking derive sends exactly one POST /derive with the same recordingId', async () => {
    const calls = stubFetchByPath({
      '/start': () => jsonResponse({ recordingId: 'rec-1', jobId: 'job-1', summary: { recordingId: 'rec-1', actionCount: 0, screenCount: 0, durationMs: 0 } }),
      '/stop': () => jsonResponse({ summary: { recordingId: 'rec-1', actionCount: 3, screenCount: 1, durationMs: 500 } }),
      '/derive': () => jsonResponse(okDerive('s1')),
      '/scenarios?': () => jsonResponse(okScenariosEmpty),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().start(); });
    await act(async () => { await holder.get().stop(); });
    expect(holder.get().recordingId).toBe('rec-1');
    await act(async () => { await holder.get().derive(); });
    const deriveCalls = calls.filter((c) => c.url.includes('/derive'));
    expect(deriveCalls).toHaveLength(1);
    expect(deriveCalls[0].url).toContain('/rec-1/derive');
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s1']);
  });

  it('2/summaryMissingStillDerivable. openExisting on a recording absent from `history` (summary stays null) is still derivable -- the panel is never hidden by a missing summary', async () => {
    stubFetchByPath({
      '/scenarios?': () => jsonResponse(okScenariosEmpty),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    // `history` is empty (never refreshed) -- exactly the race that leaves `summary` null.
    await act(async () => { await holder.get().openExisting('df1bdcbd'); });
    expect(holder.get().recordingId).toBe('df1bdcbd');
    expect(holder.get().summary).toBeNull();
    expect(holder.get().phase).toBe('stopped');
    // The panel must still render/offer derive, driven only by phase.
    expect(canShowScenarioGenerationPanel(holder.get().phase)).toBe(true);
  });

  it('3/historySelectionUsesExactId. selecting a finished recording from history and deriving uses that exact recordingId, not a stale/empty one', async () => {
    const calls = stubFetchByPath({
      '/scenarios?': () => jsonResponse(okScenariosEmpty),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
      '/derive': () => jsonResponse(okDerive('s2')),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-history-1'); });
    await act(async () => { await holder.get().derive(); });
    const deriveCalls = calls.filter((c) => c.url.includes('/derive'));
    expect(deriveCalls).toHaveLength(1);
    expect(deriveCalls[0].url).toContain('/rec-history-1/derive');
  });

  it('4/emptyScenariosNeverBlocksDerive. GET scenarios=[] before derive never disables the capability', async () => {
    stubFetchByPath({
      '/scenarios?': () => jsonResponse(okScenariosEmpty),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-empty'); });
    expect(holder.get().scenarios).toHaveLength(0);
    expect(canShowScenarioGenerationPanel(holder.get().phase)).toBe(true);
  });

  it('5/deriveSuccessRefreshesScenarios. a successful derive response is applied and rendered', async () => {
    stubFetchByPath({
      '/scenarios?': () => jsonResponse(okScenariosEmpty),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
      '/derive': () => jsonResponse(okDerive('s3')),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-2'); });
    await act(async () => { await holder.get().derive(); });
    expect(holder.get().phase).toBe('derived');
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['s3']);
  });

  it('6/staleHistoryResponseNeverErasesFreshDerive. a slow, stale openExisting response never overwrites scenarios a derive just produced', async () => {
    let resolveSlow: ((res: Response) => void) | undefined;
    stubFetchByPath({
      '/rec-old/scenarios?': () => new Promise((resolve) => { resolveSlow = resolve; }),
      '/rec-old/trace?': () => jsonResponse(okTrace),
      '/rec-old/semantic?': () => jsonResponse(okSemantic),
      '/rec-new/scenarios?': () => jsonResponse(okScenariosEmpty),
      '/rec-new/trace?': () => jsonResponse(okTrace),
      '/rec-new/semantic?': () => jsonResponse(okSemantic),
      '/derive': () => jsonResponse(okDerive('fresh')),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    let staleCall!: Promise<void>;
    await act(async () => {
      staleCall = holder.get().openExisting('rec-old');
      await holder.get().openExisting('rec-new');
    });
    await act(async () => { await holder.get().derive(); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['fresh']);
    await act(async () => {
      resolveSlow?.(jsonResponse({ ok: true, scenarios: [{ scenarioId: 'stale', title: 'Stale' }] }));
      await staleCall;
    });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['fresh']);
  });

  it('7/otherRecordingResponseNeverApplied. a response for recording A is never applied while viewing recording B', async () => {
    stubFetchByPath({
      '/rec-a/scenarios?': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 'a1', title: 'A' }], lifecycle: { scenariosReady: true } }),
      '/rec-a/trace?': () => jsonResponse(okTrace),
      '/rec-a/semantic?': () => jsonResponse(okSemantic),
      '/rec-b/scenarios?': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 'b1', title: 'B' }], lifecycle: { scenariosReady: true } }),
      '/rec-b/trace?': () => jsonResponse(okTrace),
      '/rec-b/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-a'); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['a1']);
    await act(async () => { await holder.get().openExisting('rec-b'); });
    expect(holder.get().scenarios.map((s) => s.scenarioId)).toEqual(['b1']);
  });

  it('8/alreadyDerivedShowsRegenerate. a recording already derived stays in the "derived" phase (button offers "Generar nuevamente"), no regression', async () => {
    stubFetchByPath({
      '/scenarios?': () => jsonResponse({ ok: true, scenarios: [{ scenarioId: 's1', title: 'S1' }], lifecycle: { scenariosReady: true } }),
      '/trace?': () => jsonResponse(okTrace),
      '/semantic?': () => jsonResponse(okSemantic),
    });
    const holder = latestSessionHolder();
    mount();
    act(() => root?.render(<Harness projectSlug="p" onSession={holder.onSession} />));
    await act(async () => { await holder.get().openExisting('rec-already-derived'); });
    expect(holder.get().phase).toBe('derived');
    expect(canShowScenarioGenerationPanel(holder.get().phase)).toBe(true);
  });

  it('9/predicate. canShowScenarioGenerationPanel depends only on phase, never on summary/recordingId', () => {
    expect(canShowScenarioGenerationPanel('stopped')).toBe(true);
    expect(canShowScenarioGenerationPanel('derived')).toBe(true);
    expect(canShowScenarioGenerationPanel('idle')).toBe(false);
    expect(canShowScenarioGenerationPanel('recording')).toBe(false);
    expect(canShowScenarioGenerationPanel('deriving')).toBe(false);
    expect(canShowScenarioGenerationPanel('stopping')).toBe(false);
    expect(canShowScenarioGenerationPanel('starting')).toBe(false);
  });
});
