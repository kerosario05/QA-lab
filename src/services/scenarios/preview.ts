import { scenariosRequest } from './client';
import type { ScenariosPreviewParams, ScenariosPreviewResponse } from './types';

export const scenariosProxy = {
  /** POST /api/scenarios/preview */
  post: async (body: ScenariosPreviewParams): Promise<ScenariosPreviewResponse> => {
    // NEW: Log request to diagnose selectedIssueKeys
    console.log(
      `[scenario-preview] request selectedIssueKeys=${body.selectedIssueKeys ? JSON.stringify(body.selectedIssueKeys) : "undefined"} ` +
      `projectKey=${body.projectKey} status=${body.status}`
    );
    if (body.generationMode !== 'jira_semantic') return scenariosRequest('/api/scenarios/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const started = await scenariosRequest<{ taskId: string }>('/api/scenarios/preview', {
      method: 'POST', body: JSON.stringify({ ...body, async: true }),
    });
    if (!started.taskId) throw new Error('PREVIEW_TASK_RESPONSE_INVALID');
    const deadline = Date.now() + 750_000;
    while (Date.now() < deadline) {
      const task = await scenariosRequest<{ state: string; result?: { ok: boolean; error?: string; errorCode?: string } & ScenariosPreviewResponse }>(
        `/api/scenarios/preview/tasks/${encodeURIComponent(started.taskId)}`);
      if (task.state === 'completed') {
        if (!task.result?.ok) throw new Error(task.result?.errorCode ?? task.result?.error ?? 'PREVIEW_GENERATION_FAILED');
        return task.result;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('PREVIEW_TIMEOUT');
  },
};
