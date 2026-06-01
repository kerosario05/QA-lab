import { scenariosRequest } from './client';
import type { ScenariosPreviewParams, ScenariosPreviewResponse } from './types';

export const scenariosProxy = {
  /** POST /api/testrail/cases/preview */
  post: (body: ScenariosPreviewParams): Promise<ScenariosPreviewResponse> =>
    scenariosRequest('/api/testrail/cases/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
