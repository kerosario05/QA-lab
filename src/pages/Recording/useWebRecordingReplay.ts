import { useCallback, useState } from 'react';
import { recordingsApi, type RecordingTestRailDestination } from '../../services/recordings';
import type { RecordedScenario, RecordingReplayAdmission, RecordingScenarioRejection } from '../../services/recordings/types';

/**
 * Starts the replay of a recorded web walkthrough.
 *
 * Separate from `useRecordingExecution` on purpose: that one publishes to TestRail and hands
 * the scenarios to the mobile launch chain, which owns an emulator and a device session. A
 * web replay shares none of that — it drives a browser from a plan built out of the recorded
 * steps — and folding both into one hook would couple two flows that fail for entirely
 * different reasons.
 *
 * It only starts the job and reports the id. Progress, logs and the outcome belong to the
 * live-execution screen, which already follows any job in the engine's store; duplicating
 * that here would give the same run two places to be watched and two ways to disagree.
 */

export interface WebReplayLaunch extends Partial<RecordingReplayAdmission> {
  /** Absent when every selected scenario resolved to the reuse-existing fast path. */
  jobId?: string;
  scenarioCount?: number;
  rejectedScenarios?: RecordingScenarioRejection[];
  executionMode?: string;
  fastPath?: Array<{ scenarioId: string; caseId: number; specPath: string; status: 'passed' | 'failed' | 'skipped'; error?: string }>;
}

export function useWebRecordingReplay() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replay = useCallback(
    async (
      projectSlug: string,
      recordingId: string,
      scenarios: RecordedScenario[],
      dataOverrides: Record<string, Record<number, string>>,
      datasetValues: Record<string, string | undefined>,
      // Structured boolean only — the caller (the button handler) decides this, never a
      // label or scenario title inspected here.
      generateSpec?: boolean,
      // Structured TestRail destination. When present, this single call carries the whole
      // "Ejecutar Automatización" intent — the backend resolves reuse/publish/generate per
      // scenario itself; this hook stops composing a separate publish call in front of it.
      testRailDestination?: RecordingTestRailDestination,
    ): Promise<WebReplayLaunch | null> => {
      setError(null);

      // Provenance alone is not a replay gate. The page applies the execution-readiness
      // projection and the Recording endpoint validates the same contract server-side.
      if (scenarios.length === 0) {
        setError(
          'No hay escenarios seleccionados para reproducir.',
        );
        return null;
      }

      setStarting(true);
      try {
        const launch = await recordingsApi.execute(
          recordingId,
          projectSlug,
          scenarios.map((s) => s.scenarioId),
          dataOverrides,
          Object.fromEntries(Object.entries(datasetValues).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
          generateSpec,
          testRailDestination,
        );
        return {
          jobId: launch.jobId,
          scenarioCount: launch.scenarioCount ?? scenarios.length,
          requestedCount: launch.requestedCount,
          eligibleCount: launch.eligibleCount,
          acceptedCount: launch.acceptedCount,
          requestedRejectedCount: launch.requestedRejectedCount,
          requestedRejectedScenarioIds: launch.requestedRejectedScenarioIds,
          requestedRejectedScenarios: launch.requestedRejectedScenarios,
          nonRequestedRejectedCandidates: launch.nonRequestedRejectedCandidates,
          rejectedScenarios: launch.rejectedScenarios,
          executionMode: launch.executionMode,
          fastPath: launch.fastPath,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  return { replay, starting, error, setError };
}
