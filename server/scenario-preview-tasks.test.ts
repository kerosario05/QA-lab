import { describe, it, expect } from 'vitest';
import { ScenarioPreviewTasks } from './scenario-preview-tasks';
import type { ProviderResponse } from './scenario-preview-provider';

describe('Jira preview tasks', () => {
  it('returns immediately and retains the completed generation for polling', async () => {
    let finish!: (result: ProviderResponse) => void;
    const tasks = new ScenarioPreviewTasks(() => new Promise(resolve => { finish = resolve; }));
    const id = tasks.start({ projectKey: 'HU', generationMode: 'jira_semantic' });
    expect(tasks.get(id)).toEqual({ state: 'running' });
    await Promise.resolve();
    finish({ ok: true, stories: [{ key: 'HU-1' }], totalScenarios: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(tasks.get(id)).toEqual({ state: 'completed', result: { ok: true, stories: [{ key: 'HU-1' }], totalScenarios: 1 } });
    expect(tasks.get('missing')).toBeUndefined();
  });
  it('reports a provider failure instead of leaving polling running forever', async () => {
    const tasks = new ScenarioPreviewTasks(async () => { throw new Error('sensitive detail'); });
    const id = tasks.start({ projectKey: 'HU' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const result = tasks.get(id);
    expect(result?.state).toBe('completed');
    expect(JSON.stringify(result)).not.toContain('sensitive detail');
  });
  it('deduplicates pending retries without merging different projects', async () => {
    let calls = 0;
    const tasks = new ScenarioPreviewTasks(async () => { calls++; return new Promise(() => {}); });
    const payload = { projectKey: 'HU', appSlug: 'app-one', generationMode: 'jira_semantic' };
    const first = tasks.start(payload);
    expect(tasks.start(payload)).toBe(first);
    expect(tasks.start({ ...payload, appSlug: 'app-two' })).not.toBe(first);
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});
