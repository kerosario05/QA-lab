import { describe, expect, it } from 'vitest';
import { flushScenarioValueWrites, stageScenarioValueWrite } from './scenario-value-flush';

describe('scenario value flush', () => {
  it('persists a latest local edit before its caller continues', async () => {
    const calls: string[] = [];
    stageScenarioValueWrite({ recordingId: 'r-a', scenarioId: 's-a', valueKey: 'field_a', persist: async () => { calls.push('latest'); return 'saved'; } });
    const result = await flushScenarioValueWrites('r-a');
    expect(calls).toEqual(['latest']);
    expect(result).toMatchObject({ dirtyKeyCount: 1, persistSucceededCount: 1, persistFailedCount: 0 });
  });

  it('serializes an older in-flight write before the latest revision for the same key', async () => {
    const calls: string[] = [];
    let releaseOlder!: () => void;
    const older = new Promise<void>((resolve) => { releaseOlder = resolve; });
    stageScenarioValueWrite({ recordingId: 'r-b', scenarioId: 's-b', valueKey: 'field_b', persist: async () => { calls.push('older'); await older; return 'saved'; } });
    const flush = flushScenarioValueWrites('r-b');
    await Promise.resolve();
    stageScenarioValueWrite({ recordingId: 'r-b', scenarioId: 's-b', valueKey: 'field_b', persist: async () => { calls.push('latest'); return 'saved'; } });
    releaseOlder();
    await expect(flush).resolves.toMatchObject({ persistSucceededCount: 1, persistFailedCount: 0 });
    expect(calls).toEqual(['older', 'latest']);
  });

  it('blocks completion when any applicable persistence fails and retains it for retry', async () => {
    stageScenarioValueWrite({ recordingId: 'r-c', scenarioId: 's-c', valueKey: 'field_c', persist: async () => 'failed' });
    await expect(flushScenarioValueWrites('r-c')).resolves.toMatchObject({ persistSucceededCount: 0, persistFailedCount: 1 });
    stageScenarioValueWrite({ recordingId: 'r-c', scenarioId: 's-c', valueKey: 'field_c', persist: async () => 'saved' });
    await expect(flushScenarioValueWrites('r-c')).resolves.toMatchObject({ persistSucceededCount: 1, persistFailedCount: 0 });
  });

  it('flushes only the scenarios selected for the rerun', async () => {
    const calls: string[] = [];
    stageScenarioValueWrite({ recordingId: 'r-d', scenarioId: 'selected', valueKey: 'field_d', persist: async () => { calls.push('selected'); return 'saved'; } });
    stageScenarioValueWrite({ recordingId: 'r-d', scenarioId: 'other', valueKey: 'field_d', persist: async () => { calls.push('other'); return 'saved'; } });
    await expect(flushScenarioValueWrites('r-d', ['selected'])).resolves.toMatchObject({ dirtyKeyCount: 1, persistSucceededCount: 1 });
    expect(calls).toEqual(['selected']);
    await flushScenarioValueWrites('r-d');
  });
});
