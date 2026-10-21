import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenariosProxy } from './preview';
import { scenariosRequest } from './client';
import type { ScenariosPreviewParams } from './types';
vi.mock('./client', () => ({ scenariosRequest: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

describe('Jira preview polling', () => {
  it('receives a short accepted response, then returns the generated stories', async () => {
    vi.useFakeTimers();
    const request = vi.mocked(scenariosRequest);
    request.mockResolvedValueOnce({ taskId: 'fixture-job' })
      .mockResolvedValueOnce({ state: 'running' })
      .mockResolvedValueOnce({ state: 'completed', result: { ok: true, stories: [{ key: 'HU-1' }], totalScenarios: 1 } });
    const result = scenariosProxy.post({ projectKey: 'HU', generationMode: 'jira_semantic' } as ScenariosPreviewParams);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toMatchObject({ totalScenarios: 1 });
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).async).toBe(true);
    expect(request.mock.calls[1][0]).toBe('/api/scenarios/preview/tasks/fixture-job');
  });
  it('keeps the existing direct request for other generators', async () => {
    const request = vi.mocked(scenariosRequest);
    request.mockResolvedValueOnce({ ok: true, stories: [] });
    await scenariosProxy.post({ projectKey: 'MOB' } as ScenariosPreviewParams);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).async).toBeUndefined();
  });
  it('shows generation failures from the completed task', async () => {
    vi.mocked(scenariosRequest).mockResolvedValueOnce({ taskId: 'fixture-job' })
      .mockResolvedValueOnce({ state: 'completed', result: { ok: false, errorCode: 'INVALID_GENERATION' } });
    await expect(scenariosProxy.post({ projectKey: 'HU', generationMode: 'jira_semantic' } as ScenariosPreviewParams))
      .rejects.toThrow('INVALID_GENERATION');
  });
});
