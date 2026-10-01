import type { RecordedScenario } from '../../services/recordings/types';

export interface RecordingScenarioGroup {
  recordingId: string;
  scenarios: RecordedScenario[];
}

export function groupScenariosByRecording(
  scenarios: RecordedScenario[],
  recordingIds: string[],
  fallbackRecordingId: string,
): RecordingScenarioGroup[] {
  const groups = new Map<string, RecordedScenario[]>();
  scenarios.forEach((scenario, index) => {
    const recordingId = recordingIds[index] || fallbackRecordingId;
    const group = groups.get(recordingId) ?? [];
    if (!group.some((candidate) => candidate.scenarioId === scenario.scenarioId)) group.push(scenario);
    groups.set(recordingId, group);
  });
  return [...groups].map(([recordingId, groupedScenarios]) => ({ recordingId, scenarios: groupedScenarios }));
}
