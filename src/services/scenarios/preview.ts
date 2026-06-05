import { scenariosRequest } from './client';
import type { ScenariosPreviewParams, ScenariosPreviewResponse } from './types';

export const scenariosProxy = {
  /** POST /api/scenarios/preview */
  post: (body: ScenariosPreviewParams): Promise<ScenariosPreviewResponse> =>
    scenariosRequest('/api/scenarios/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
