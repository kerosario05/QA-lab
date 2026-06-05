import { testrailRequest } from './client';
import type { TRRun, TRTest, TRAddRunPayload, TRPaginatedResponse } from './types';

export const trRuns = {
  /** GET /get_run/:run_id */
  get: (runId: number) =>
    testrailRequest<TRRun>(`/get_run/${runId}`),

  /** GET /get_runs/:project_id */
  list: (projectId: number, params: { milestoneId?: number; isCompleted?: boolean; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.milestoneId) qs.set('milestone_id', String(params.milestoneId));
    if (params.isCompleted !== undefined) qs.set('is_completed', params.isCompleted ? '1' : '0');
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `&${qs.toString()}` : '';
    return testrailRequest<TRPaginatedResponse<TRRun>>(`/get_runs/${projectId}${query}`);
  },

  /** POST /add_run/:project_id */
  create: (projectId: number, payload: TRAddRunPayload) =>
    testrailRequest<TRRun>(`/add_run/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST /update_run/:run_id */
  update: (runId: number, payload: Partial<TRAddRunPayload>) =>
    testrailRequest<TRRun>(`/update_run/${runId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** POST /close_run/:run_id */
  close: (runId: number) =>
    testrailRequest<TRRun>(`/close_run/${runId}`, { method: 'POST', body: '{}' }),

  /** POST /delete_run/:run_id */
  delete: (runId: number) =>
    testrailRequest<void>(`/delete_run/${runId}`, { method: 'POST', body: '{}' }),

  /** GET /get_tests/:run_id */
  tests: (runId: number, statusIds?: number[]) => {
    const query = statusIds?.length ? `&status_id=${statusIds.join(',')}` : '';
    return testrailRequest<TRPaginatedResponse<TRTest>>(`/get_tests/${runId}${query}`);
  },
};
