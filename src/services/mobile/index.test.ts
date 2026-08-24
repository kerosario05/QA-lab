import { afterEach, describe, expect, it, vi } from 'vitest';
import { mobileProxy } from './index';

describe('mobileProxy scenario generation endpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts async scenario generation via /api/mobile/scenarios/generation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, generationJobId: 'job-1', status: 'running' }),
    } as Response);

    const result = await mobileProxy.startScenarioGeneration({ projectKey: 'AA', sprintId: 1, appSlug: 'app-a' });
    expect(result.generationJobId).toBe('job-1');
    expect(result.status).toBe('running');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mobile/scenarios/generation'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reads async scenario generation status via /api/mobile/scenarios/generation/:jobId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, generationJobId: 'job-1', status: 'completed', result: { scenarios: [], rejected: [], issuesFound: 0 } }),
    } as Response);

    const result = await mobileProxy.getScenarioGenerationStatus('job-1');
    expect(result.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mobile/scenarios/generation/job-1'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
