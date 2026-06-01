import { testrailRequest } from './client';
import type {
  TRResult,
  TRAddResultPayload,
  TRAddResultsForCasesPayload,
  TRPaginatedResponse,
} from './types';

export const trResults = {
  /** GET /get_results/:test_id */
  forTest: (testId: number, limit = 250) =>
    testrailRequest<TRPaginatedResponse<TRResult>>(`/get_results/${testId}&limit=${limit}`),

  /** GET /get_results_for_case/:run_id/:case_id */
  forCase: (runId: number, caseId: number, limit = 250) =>
    testrailRequest<TRPaginatedResponse<TRResult>>(
      `/get_results_for_case/${runId}/${caseId}&limit=${limit}`,
    ),

  /** GET /get_results_for_run/:run_id */
  forRun: (runId: number, params: { statusIds?: number[]; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.statusIds?.length) qs.set('status_id', params.statusIds.join(','));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `&${qs.toString()}` : '';
    return testrailRequest<TRPaginatedResponse<TRResult>>(`/get_results_for_run/${runId}${query}`);
  },

  /** POST /add_result/:test_id */
  add: (testId: number, payload: TRAddResultPayload) =>
    testrailRequest<TRResult>(`/add_result/${testId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST /add_results_for_cases/:run_id — envío masivo de resultados */
  addBulk: (runId: number, payload: TRAddResultsForCasesPayload) =>
    testrailRequest<TRResult[]>(`/add_results_for_cases/${runId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
