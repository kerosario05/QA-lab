import { useCallback, useState } from 'react';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenario } from '../../services/recordings/types';

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

export interface WebReplayLaunch {
  jobId: string;
  scenarioCount: number;
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
    ): Promise<WebReplayLaunch | null> => {
      setError(null);

      // A derived scenario carries steps but describes a state the recording never reached.
      // Running it would assert something nobody established.
      const runnable = scenarios.filter((s) => s.provenance !== 'derived');
      if (runnable.length === 0) {
        setError(
          'Ninguno de los escenarios seleccionados se puede reproducir: son derivados y la grabación nunca los recorrió.',
        );
        return null;
      }

      setStarting(true);
      try {
        const launch = await recordingsApi.execute(
          recordingId,
          projectSlug,
          runnable.map((s) => s.scenarioId),
          dataOverrides,
        );
        return { jobId: launch.jobId, scenarioCount: launch.scenarioCount ?? runnable.length };
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
