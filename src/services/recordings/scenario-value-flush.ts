export type ScenarioValueSaveResult = 'saved' | 'not_ready' | 'failed';

type PendingWrite = {
  recordingId: string;
  scenarioId: string;
  valueKey: string;
  revision: number;
  persist: () => Promise<ScenarioValueSaveResult>;
};

const pendingWrites = new Map<string, PendingWrite>();
const slotKey = (entry: Pick<PendingWrite, 'recordingId' | 'scenarioId' | 'valueKey'>) =>
  `${entry.recordingId}\u0000${entry.scenarioId}\u0000${entry.valueKey}`;

export function stageScenarioValueWrite(entry: Omit<PendingWrite, 'revision'>): void {
  const key = slotKey(entry);
  const prior = pendingWrites.get(key);
  pendingWrites.set(key, { ...entry, revision: (prior?.revision ?? 0) + 1 });
}

async function flushSlot(key: string): Promise<ScenarioValueSaveResult> {
  while (true) {
    const snapshot = pendingWrites.get(key);
    if (!snapshot) return 'saved';
    const outcome = await snapshot.persist();
    if (outcome !== 'saved') return outcome;
    if (pendingWrites.get(key)?.revision === snapshot.revision) {
      pendingWrites.delete(key);
      return 'saved';
    }
  }
}

export async function flushScenarioValueWrites(recordingId: string, scenarioIds?: readonly string[]): Promise<{
  dirtyKeyCount: number;
  persistSucceededCount: number;
  persistFailedCount: number;
}> {
  const allowedScenarioIds = scenarioIds ? new Set(scenarioIds) : undefined;
  const keys = [...pendingWrites.entries()]
    .filter(([, entry]) => entry.recordingId === recordingId && (!allowedScenarioIds || allowedScenarioIds.has(entry.scenarioId)))
    .map(([key]) => key);
  let persistSucceededCount = 0;
  let persistFailedCount = 0;
  for (const key of keys) {
    if (await flushSlot(key) === 'saved') persistSucceededCount += 1;
    else persistFailedCount += 1;
  }
  return { dirtyKeyCount: keys.length, persistSucceededCount, persistFailedCount };
}
