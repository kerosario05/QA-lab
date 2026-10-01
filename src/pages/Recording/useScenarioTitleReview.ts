import { useCallback, useEffect, useState } from 'react';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenario, ScenarioTitleReview } from '../../services/recordings/types';

/**
 * The engine's review of each scenario title (repeats in the app, generic names), and the
 * rename command. The review is re-read whenever the set of scenario ids or titles changes;
 * `enabled` keeps it off while recording, when the live preview rewrites scenarios constantly.
 */
export function useScenarioTitleReview({
  recordingId,
  projectSlug,
  scenarios,
  enabled,
  onScenarioRenamed,
}: {
  recordingId: string | null;
  projectSlug: string;
  scenarios: RecordedScenario[];
  enabled: boolean;
  onScenarioRenamed: (scenario: RecordedScenario) => void;
}) {
  const [reviews, setReviews] = useState<Record<string, ScenarioTitleReview>>({});
  const signature = scenarios.map((scenario) => `${scenario.scenarioId}\u0000${scenario.title}`).join('\u0001');

  useEffect(() => {
    if (!enabled || !recordingId || !projectSlug || !signature) {
      setReviews({});
      return;
    }
    let cancelled = false;
    recordingsApi.scenarios(recordingId, projectSlug)
      .then((result) => {
        if (!cancelled) setReviews(result.titleReview ?? {});
      })
      // An engine without title review answers without the field; a failed read just shows no badges.
      .catch(() => {
        if (!cancelled) setReviews({});
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, recordingId, projectSlug, signature]);

  const rename = useCallback(async (scenarioId: string, title: string): Promise<string | null> => {
    if (!recordingId || !projectSlug) return 'No hay una grabación abierta';
    try {
      const result = await recordingsApi.renameScenario(recordingId, projectSlug, scenarioId, title);
      onScenarioRenamed(result.scenario);
      if (result.titleReview) setReviews((prev) => ({ ...prev, [scenarioId]: result.titleReview! }));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'No se pudo guardar el título';
    }
  }, [recordingId, projectSlug, onScenarioRenamed]);

  return { reviews, rename };
}
