import { scenariosRequest } from './client';
import type { ScenariosPreviewParams, ScenariosPreviewResponse } from './types';

export const scenariosProxy = {
  /** POST /api/scenarios/preview */
  post: (body: ScenariosPreviewParams): Promise<ScenariosPreviewResponse> => {
    // NEW: Log request to diagnose selectedIssueKeys
    console.log(
      `[scenario-preview] request selectedIssueKeys=${body.selectedIssueKeys ? JSON.stringify(body.selectedIssueKeys) : "undefined"} ` +
      `projectKey=${body.projectKey} status=${body.status}`
    );
    return scenariosRequest('/api/scenarios/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
