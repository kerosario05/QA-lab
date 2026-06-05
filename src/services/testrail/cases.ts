import { testrailRequest } from './client';
import type { TRCase, TRPaginatedResponse } from './types';

export interface GetCasesParams {
  suiteId?: number;
  sectionId?: number;
  milestoneId?: number;
  priorityId?: number;
  typeId?: number;
  limit?: number;
  offset?: number;
}

export const trCases = {
  /** GET /get_case/:case_id */
  get: (caseId: number) =>
    testrailRequest<TRCase>(`/get_case/${caseId}`),

  /** GET /get_cases/:project_id — con filtros opcionales */
  list: (projectId: number, params: GetCasesParams = {}) => {
    const qs = new URLSearchParams();
    if (params.suiteId) qs.set('suite_id', String(params.suiteId));
    if (params.sectionId) qs.set('section_id', String(params.sectionId));
    if (params.milestoneId) qs.set('milestone_id', String(params.milestoneId));
    if (params.priorityId) qs.set('priority_id', String(params.priorityId));
    if (params.typeId) qs.set('type_id', String(params.typeId));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `&${qs.toString()}` : '';
    return testrailRequest<TRPaginatedResponse<TRCase>>(`/get_cases/${projectId}${query}`);
  },
};
