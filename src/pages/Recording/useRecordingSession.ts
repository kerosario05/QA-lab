import { useCallback, useEffect, useRef, useState } from 'react';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenario, RecordingLive, RecordingSummary } from '../../services/recordings/types';

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

export function useRecordingSession(projectSlug: string) {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [live, setLive] = useState<RecordingLive | null>(null);
  const [scenarios, setScenarios] = useState<RecordedScenario[]>([]);
  const [narrative, setNarrative] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecordingSummary[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setError(null);
  }, [projectSlug, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (label?: string) => {
      setError(null);
      setPhase('starting');
      setScenarios([]);
      setNarrative('');
      try {
        const res = await recordingsApi.start(projectSlug, label);
        setRecordingId(res.recordingId);
        setSummary(res.summary);
        setPhase('recording');

        pollRef.current = setInterval(async () => {
          try {
            const status = await recordingsApi.status(res.recordingId, projectSlug);
            if (status.active) {
              setLive(status.live ?? null);
              setSummary(status.summary);
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
    try {
      const res = await recordingsApi.stop(recordingId, projectSlug);
      setSummary(res.summary);
      setPhase('stopped');
      void refreshHistory();
    } catch (err) {
      setPhase('recording');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [recordingId, projectSlug, stopPolling, refreshHistory]);

  const derive = useCallback(
    async (title?: string) => {
      if (!recordingId) return;
      setPhase('deriving');
      setError(null);
      try {
        const res = await recordingsApi.derive(recordingId, projectSlug, title);
        setScenarios(res.scenarios ?? []);
        setNarrative(res.narrative ?? '');
        setSummary(res.summary);
        setPhase('derived');
        void refreshHistory();
      } catch (err) {
        setPhase('stopped');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [recordingId, projectSlug, refreshHistory],
  );

  /** Reopens a previous recording without re-running it. */
  const openExisting = useCallback(
    async (id: string) => {
      setError(null);
      setRecordingId(id);
      try {
        const [scenarioRes, traceRes] = await Promise.all([
          recordingsApi.scenarios(id, projectSlug),
          recordingsApi.trace(id, projectSlug).catch(() => ({ trace: {} as { narrative?: string } })),
        ]);
        setScenarios(scenarioRes.scenarios ?? []);
        setNarrative(traceRes.trace?.narrative ?? '');
        const found = history.find((h) => h.recordingId === id) ?? null;
        setSummary(found);
        setPhase(scenarioRes.scenarios?.length ? 'derived' : 'stopped');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
    error,
    setError,
    history,
    start,
    stop,
    derive,
    openExisting,
    remove,
    refreshHistory,
  };
}
