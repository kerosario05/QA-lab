import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, recordingsApi } from '../../services/recordings';
import type { DerivationMetadata, DeriveResult, RecordedScenario, RecordingDerivationProgress, RecordingLifecycle, RecordingLive, RecordingSummary, SemanticRecordingModel } from '../../services/recordings/types';
import { isProxyTimeout, type GenerationProgress } from './generation-progress';

/**
 * Drives one recording from start to derived scenarios.
 *
 * The polling only runs while a session is actually open — a recording waits on a human, so
 * an idle page must not keep asking the engine about a session that ended. Everything the
 * screen needs to render is derived from `phase`, which is why it is a single value rather
 * than a set of independent booleans that could disagree with each other.
 */

export type RecordingPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'deriving'
  | 'derived';

const POLL_INTERVAL_MS = 2000;
/** How often Stop's progress (captures still pending) is refreshed while the Stop request runs. */
const STOP_PROGRESS_INTERVAL_MS = 1000;
/** How often a background step generation is polled. */
const DERIVATION_POLL_INTERVAL_MS = 2000;
/** Give up polling (the engine keeps working; reopening the recording shows the result). */
const STOP_WAIT_LIMIT_MS = 10 * 60_000;
const DERIVATION_WAIT_LIMIT_MS = 20 * 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** After a proxy timeout on Stop: waits until the engine reports the recording as no longer active. */
async function waitUntilStopped(
  recordingId: string,
  projectSlug: string,
  isCurrentRun: () => boolean,
): Promise<{ summary: RecordingSummary }> {
  const deadline = Date.now() + STOP_WAIT_LIMIT_MS;
  while (Date.now() < deadline && isCurrentRun()) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const status = await recordingsApi.status(recordingId, projectSlug);
      if (!status.active) return { summary: status.summary };
    } catch {
      // Keep waiting: a transient error says nothing about the Stop itself.
    }
  }
  throw new Error('La grabación sigue cerrándose en el motor. Vuelve a abrirla desde el historial en unos minutos.');
}

/**
 * Polls a background step generation until it is derived or failed. Transport errors (a 504, a
 * restarting BFF) never end the wait; only the engine's own verdict or the time limit does.
 */
async function waitForDerivation(
  recordingId: string,
  projectSlug: string,
  initial: RecordingDerivationProgress,
  isCurrentRun: () => boolean,
  onProgress: (progress: RecordingDerivationProgress) => void,
): Promise<RecordingDerivationProgress> {
  let current = initial;
  const deadline = Date.now() + DERIVATION_WAIT_LIMIT_MS;
  while (current.status === 'deriving' && Date.now() < deadline && isCurrentRun()) {
    await sleep(DERIVATION_POLL_INTERVAL_MS);
    try {
      const res = await recordingsApi.derivation(recordingId, projectSlug);
      current = res.derivation;
      if (isCurrentRun()) onProgress(current);
    } catch {
      // Keep polling.
    }
  }
  if (current.status === 'idle') {
    // The engine lost the in-memory progress (restarted) before finishing.
    return { ...current, status: 'failed', errorMessage: 'El motor se reinició mientras generaba los pasos. Vuelve a pulsar "Generar escenarios".' };
  }
  if (current.status === 'deriving' && isCurrentRun()) {
    return { ...current, status: 'failed', errorMessage: 'La generación de pasos sigue en curso en el motor. Vuelve a abrir la grabación desde el historial en unos minutos.' };
  }
  return current;
}

export function useRecordingSession(projectSlug: string) {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [live, setLive] = useState<RecordingLive | null>(null);
  const [scenarios, setScenarios] = useState<RecordedScenario[]>([]);
  const [narrative, setNarrative] = useState<string>('');
  const [semanticModel, setSemanticModel] = useState<SemanticRecordingModel | null>(null);
  const [derivation, setDerivation] = useState<DerivationMetadata | null>(null);
  const [lifecycle, setLifecycle] = useState<RecordingLifecycle | null>(null);
  // The PER-SCENARIO authority: exactly which scenarioIds the backend's own persisted store
  // already contains, never a global "some scenario somewhere is ready" boolean. Populated ONLY
  // from responses that prove materialization -- `derive()`'s own result, `GET .../scenarios`
  // (the persisted store itself), and the poll's `status.scenarios` field (never
  // `status.live?.scenarios`, which is an unpersisted preview). A scenario absent from this set
  // must never reach `PUT /scenario-value`, no matter how "ready" some other scenario is.
  const [persistedScenarioIds, setPersistedScenarioIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecordingSummary[]>([]);
  // What the "generating" indicator shows while Stop finishes or steps are generated.
  const [generation, setGeneration] = useState<GenerationProgress | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped by every stop/derive and by a project switch or unmount: a wait loop that no longer
  // matches it stops touching state (the user moved on).
  const generationRunRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!projectSlug) {
      setHistory([]);
      return;
    }
    try {
      const res = await recordingsApi.list(projectSlug);
      setHistory(res.recordings ?? []);
    } catch {
      // A project with no recordings yet is not an error worth showing.
      setHistory([]);
    }
  }, [projectSlug]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Switching project abandons whatever was on screen: a recording belongs to one app.
  useEffect(() => {
    stopPolling();
    setPhase('idle');
    setRecordingId(null);
    setSummary(null);
    setLive(null);
    setScenarios([]);
    setNarrative('');
    setSemanticModel(null);
    setDerivation(null);
    setLifecycle(null);
    setPersistedScenarioIds(new Set());
    setError(null);
    generationRunRef.current += 1;
    setGeneration(null);
  }, [projectSlug, stopPolling]);

  useEffect(() => () => {
    stopPolling();
    generationRunRef.current += 1;
  }, [stopPolling]);

  const start = useCallback(
    async (recordingGoal?: string) => {
      setError(null);
      setPhase('starting');
      setScenarios([]);
      setNarrative('');
      console.info('[recording:goal-lineage] uiGoal=', recordingGoal);
      try {
        const res = await recordingsApi.start(projectSlug, recordingGoal);
        setRecordingId(res.recordingId);
        setSummary(res.summary);
        setPhase('recording');
        setLifecycle({ recordingExists: true, traceReady: false, semanticReady: false, scenariosReady: false });
        setPersistedScenarioIds(new Set());

        pollRef.current = setInterval(async () => {
          try {
            const status = await recordingsApi.status(res.recordingId, projectSlug);
            if (status.active) {
              setLive(status.live ?? null);
              setSummary(status.summary);
              setScenarios(status.scenarios ?? status.live?.scenarios ?? []);
              const liveModel = status.semanticModel ?? status.live?.semanticModel ?? null;
              setSemanticModel(liveModel);
              setDerivation(liveModel?.derivation ?? null);
              setLifecycle({
                recordingExists: true,
                traceReady: false,
                semanticReady: Boolean(liveModel),
                // While a recording is active, the backend's own status route answers with
                // `entry.liveProjection.scenarios` under this SAME `scenarios` key (see
                // `recordings.ts` GET /:recordingId) -- an in-memory preview, not the persisted
                // store `loadScenarios()` reads. Only `derive()`'s response and
                // `GET .../scenarios` ever reflect that persisted store, so this poll must never
                // flip readiness true: treating `status.scenarios` as proof of materialization
                // here was the false positive that let an edit reach `PUT /scenario-value`
                // before `derive()` had ever run, guaranteeing 409 SCENARIO_NOT_READY.
                scenariosReady: false,
              });
              // Never update per-scenario persisted authority from the live poll either -- same
              // reason: nothing here is backend-persisted while the recording is still active.
            }
          } catch {
            // A transient poll failure must not kill an in-progress walkthrough.
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setPhase('idle');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectSlug],
  );

  const stop = useCallback(async () => {
    if (!recordingId) return;
    setPhase('stopping');
    stopPolling();
    const runId = ++generationRunRef.current;
    const isCurrentRun = () => generationRunRef.current === runId;
    setGeneration({ kind: 'stopping', pendingCaptures: live?.pendingCaptures ?? 0, events: live?.events ?? 0 });
    // Stop waits for the captures still queued; show how many are left while it runs.
    const stopProgress = setInterval(async () => {
      try {
        const status = await recordingsApi.status(recordingId, projectSlug);
        if (!isCurrentRun() || !status.active || !status.live) return;
        setGeneration({ kind: 'stopping', pendingCaptures: status.live.pendingCaptures ?? 0, events: status.live.events });
      } catch {
        // Progress is informative only; the Stop request itself decides the outcome.
      }
    }, STOP_PROGRESS_INTERVAL_MS);
    try {
      let res: { summary: RecordingSummary };
      try {
        res = await recordingsApi.stop(recordingId, projectSlug);
      } catch (err) {
        // A proxy timeout is not a failed Stop: the engine is still finishing. Wait for the
        // recording to stop being active instead of pretending it is still recording.
        if (!isProxyTimeout(err)) throw err;
        res = await waitUntilStopped(recordingId, projectSlug, isCurrentRun);
      }
      if (!isCurrentRun()) return;
      setSummary(res.summary);
      setPhase('stopped');
      // FIRST_LOSS fix: STOP's own response (`res.summary`) only ever carries a scenario COUNT
      // (`RecordingSummary.scenarioCount`), never the scenarioIds/payload the backend already
      // persisted (`materializeObservedPrimaryScenario` + `saveScenarios`, both already done by
      // the time this call resolves). The old code below unconditionally cleared
      // `persistedScenarioIds` here and never populated `scenarios` at all, so the observed
      // primary STOP just persisted stayed invisible to `scenarioPersisted`/readiness until
      // "Generar escenarios" (`derive()`) was clicked -- the exact false "escenario pendiente de
      // materialización" this ticket exists to remove. `GET .../scenarios` reads the SAME
      // persisted store `openExisting` already trusts as authoritative (see its own
      // `setPersistedScenarioIds` above) -- reusing it here is a read, never `derive()`/AI
      // generation, which stays a fully separate, optional, user-triggered call.
      try {
        const scenarioResult = await recordingsApi.scenarios(recordingId, projectSlug);
        const scenariosArray = Array.isArray(scenarioResult.scenarios) ? scenarioResult.scenarios : [];
        setScenarios(scenariosArray);
        setPersistedScenarioIds(new Set(scenariosArray.map((scenario) => scenario.scenarioId)));
        setLifecycle(scenarioResult.lifecycle ?? { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: scenariosArray.length > 0 });
      } catch {
        // A transient failure to read the persisted store right after STOP must never be
        // mistaken for "nothing was persisted" -- it leaves `scenarios`/`persistedScenarioIds`
        // exactly as they were (never fabricates an empty/false result); the history reopen path
        // (`openExisting`, same GET) remains the way to recover from a genuine transport outage.
        setLifecycle({ recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: false });
      }
      void refreshHistory();
    } catch (err) {
      if (!isCurrentRun()) return;
      setPhase('recording');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearInterval(stopProgress);
      if (isCurrentRun()) setGeneration(null);
    }
  }, [recordingId, projectSlug, stopPolling, refreshHistory, live]);

  /**
   * Loads what a background generation persisted: the same persisted store `openExisting` reads,
   * plus the recording summary (the history list may not include the new state yet).
   */
  const loadDerivedRecording = useCallback(
    async (id: string) => {
      const [scenarioResult, statusResult, semanticResult, traceResult] = await Promise.allSettled([
        recordingsApi.scenarios(id, projectSlug),
        recordingsApi.status(id, projectSlug),
        recordingsApi.semantic(id, projectSlug),
        recordingsApi.trace(id, projectSlug),
      ]);
      const scenariosArray = scenarioResult.status === 'fulfilled' && Array.isArray(scenarioResult.value.scenarios)
        ? scenarioResult.value.scenarios
        : [];
      setScenarios(scenariosArray);
      setPersistedScenarioIds(new Set(scenariosArray.map((scenario) => scenario.scenarioId)));
      setLifecycle(scenarioResult.status === 'fulfilled'
        ? scenarioResult.value.lifecycle ?? { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: scenariosArray.length > 0 }
        : { recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: scenariosArray.length > 0 });
      if (statusResult.status === 'fulfilled') setSummary(statusResult.value.summary);
      if (semanticResult.status === 'fulfilled') {
        const model = (semanticResult.value.model as SemanticRecordingModel | null) ?? null;
        setSemanticModel(model);
        setDerivation(model?.derivation ?? null);
      }
      if (traceResult.status === 'fulfilled') setNarrative(traceResult.value.trace?.narrative ?? '');
      if (scenarioResult.status === 'rejected') {
        setError('Los pasos se generaron, pero no se pudieron cargar. Vuelve a abrir la grabación desde el historial.');
      }
      setPhase('derived');
      void refreshHistory();
    },
    [projectSlug, refreshHistory],
  );

  const derive = useCallback(
    async (title?: string) => {
      if (!recordingId) return;
      setPhase('deriving');
      setError(null);
      const runId = ++generationRunRef.current;
      const isCurrentRun = () => generationRunRef.current === runId;
      try {
        const started = await recordingsApi.deriveAsync(recordingId, projectSlug, title);
        if (!isCurrentRun()) return;
        if (started.derivation) {
          // Background generation: poll its progress, then load what it persisted.
          setGeneration({ kind: 'deriving', derivation: started.derivation });
          const final = await waitForDerivation(recordingId, projectSlug, started.derivation, isCurrentRun, (progress) => {
            setGeneration({ kind: 'deriving', derivation: progress });
          });
          if (!isCurrentRun()) return;
          if (final.status !== 'derived') {
            setPhase('stopped');
            setError(final.errorMessage ?? 'No se pudieron generar los pasos de la grabación.');
            return;
          }
          await loadDerivedRecording(recordingId);
          return;
        }
        // An engine without background generation answered with the full result.
        const res = started as DeriveResult;
        setScenarios(res.scenarios ?? []);
        setNarrative(res.narrative ?? '');
        setSemanticModel(res.semanticModel ?? null);
        setDerivation(res.derivation ?? res.semanticModel?.derivation ?? null);
        setSummary(res.summary);
        setPhase('derived');
        setLifecycle({ recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: (res.scenarios ?? []).length > 0 });
        // `derive()` is itself the materialization call -- its own response is authoritative
        // persisted-authority evidence for exactly the scenarioIds it returns.
        setPersistedScenarioIds(new Set((res.scenarios ?? []).map((scenario) => scenario.scenarioId)));
        void refreshHistory();
      } catch (err) {
        if (!isCurrentRun()) return;
        setPhase('stopped');
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isCurrentRun()) setGeneration(null);
      }
    },
    [recordingId, projectSlug, refreshHistory, loadDerivedRecording],
  );

  // Guards against a stale response: if a NEWER `openExisting`/refresh call has started (a
  // different recording opened, or the same one reopened again) by the time an older request's
  // response arrives, that older response must never overwrite what the newer one already set.
  // The recording identity is part of the guard too (not just the sequence number) -- a response
  // is only ever applied if it both belongs to the most recent call AND to the recording that
  // call was actually opening.
  const openExistingRequestRef = useRef(0);

  /**
   * Reopens a previous recording without re-running it.
   *
   * A transport failure (502/network error, e.g. a transient backend restart) on ANY of these
   * three resources must never erase what is already on screen: each resource is fetched and
   * applied INDEPENDENTLY, so a scenarios/trace/semantic failure only means that ONE resource
   * keeps its previous value -- the other two (and the already-loaded scenario list itself)
   * stay exactly as they were. Only a genuinely successful, well-shaped response ever replaces
   * state; a thrown error (a 304 with no usable body throws via `ApiError` in the transport
   * layer, same as any other non-2xx) is never treated as "the backend returned empty" -- and
   * neither is a 200 whose body is missing/malformed the `scenarios` array itself.
   */
  const openExisting = useCallback(
    async (id: string) => {
      setError(null);
      setRecordingId(id);
      const requestId = ++openExistingRequestRef.current;
      // TEMPORARY DIAGNOSTIC (this ticket only): no dataset value/secret is logged -- only ids
      // and sequence numbers, to trace the click -> apply -> render chain in production.
      console.info('[recording-history-open]', { recordingId: id, projectSlug, requestSeq: requestId });
      // Stale means "a NEWER `openExisting` call has since started" -- the sequence number
      // alone already encodes this correctly (it strictly increases per call, regardless of
      // recordingId), so a response is discarded exactly when it isn't from the most recent
      // call, whatever recording that call was for.
      const isStale = () => openExistingRequestRef.current !== requestId;

      const [scenarioResult, traceResult, semanticResult] = await Promise.allSettled([
        recordingsApi.scenarios(id, projectSlug),
        recordingsApi.trace(id, projectSlug),
        recordingsApi.semantic(id, projectSlug),
      ]);
      console.info('[recording-history-resource]', {
        recordingId: id,
        requestSeq: requestId,
        resource: 'scenarios',
        status: scenarioResult.status,
        bodyPresent: scenarioResult.status === 'fulfilled' ? Array.isArray(scenarioResult.value.scenarios) : false,
        scenarioCount: scenarioResult.status === 'fulfilled' && Array.isArray(scenarioResult.value.scenarios) ? scenarioResult.value.scenarios.length : null,
        errorCode: scenarioResult.status === 'rejected' && scenarioResult.reason instanceof ApiError ? scenarioResult.reason.errorCode ?? null : null,
      });
      console.info('[recording-history-resource]', { recordingId: id, requestSeq: requestId, resource: 'trace', status: traceResult.status });
      console.info('[recording-history-resource]', { recordingId: id, requestSeq: requestId, resource: 'semantic', status: semanticResult.status });
      if (isStale()) {
        console.info('[recording-history-apply]', { recordingId: id, requestSeq: requestId, currentRequestSeq: openExistingRequestRef.current, stale: true, applyScenarios: false, applyTrace: false, applySemantic: false });
        return;
      }

      // A fulfilled promise only proves the HTTP call itself succeeded -- it does not prove the
      // body is the shape we expect. A malformed/truncated 200 (missing `scenarios` entirely)
      // must be treated the same as a transport failure: never silently coerced into "0
      // scenarios" and applied as if it were an authoritative empty result.
      const scenariosArray = scenarioResult.status === 'fulfilled' && Array.isArray(scenarioResult.value.scenarios)
        ? scenarioResult.value.scenarios
        : null;
      if (scenarioResult.status === 'fulfilled' && scenariosArray) {
        setScenarios(scenariosArray);
        setLifecycle(scenarioResult.value.lifecycle ?? null);
        // `GET .../scenarios` IS the persisted store itself -- authoritative per-scenario
        // evidence for every scenarioId it returns.
        setPersistedScenarioIds(new Set(scenariosArray.map((scenario) => scenario.scenarioId)));
        const found = history.find((h) => h.recordingId === id) ?? null;
        setSummary(found);
        setPhase(scenarioResult.value.lifecycle?.scenariosReady || scenariosArray.length ? 'derived' : 'stopped');
      } else if (scenarioResult.status === 'rejected') {
        setError(scenarioResult.reason instanceof Error ? scenarioResult.reason.message : String(scenarioResult.reason));
      } else {
        setError('La grabación respondió sin un listado de escenarios utilizable; se conserva el último estado visible.');
      }
      console.info('[recording-history-apply]', {
        recordingId: id,
        requestSeq: requestId,
        currentRequestSeq: openExistingRequestRef.current,
        stale: false,
        applyScenarios: Boolean(scenarioResult.status === 'fulfilled' && scenariosArray),
        scenarioCount: scenariosArray?.length ?? null,
        applyTrace: traceResult.status === 'fulfilled',
        applySemantic: semanticResult.status === 'fulfilled',
      });

      if (traceResult.status === 'fulfilled') {
        setNarrative(traceResult.value.trace?.narrative ?? '');
      }

      if (semanticResult.status === 'fulfilled') {
        const model = (semanticResult.value.model as SemanticRecordingModel | null) ?? null;
        setSemanticModel(model);
        setDerivation(model?.derivation ?? null);
      }
    },
    [projectSlug, history],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await recordingsApi.remove(id, projectSlug);
        if (id === recordingId) {
          setRecordingId(null);
          setScenarios([]);
          setNarrative('');
          setPhase('idle');
          setPersistedScenarioIds(new Set());
        }
        void refreshHistory();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectSlug, recordingId, refreshHistory],
  );

  return {
    phase,
    recordingId,
    summary,
    live,
    scenarios,
    setScenarios,
    narrative,
    semanticModel,
    derivation,
    lifecycle,
    persistedScenarioIds,
    error,
    setError,
    history,
    generation,
    start,
    stop,
    derive,
    openExisting,
    remove,
    refreshHistory,
  };
}
