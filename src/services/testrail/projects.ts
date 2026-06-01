import { testrailRequest } from './client';
import type { TRProject, TRSuite, TRSection, TRMilestone } from './types';
import type { TestRailProject } from '../../types';

const PROXY = import.meta.env.VITE_API_URL ?? '';

export const trProjectsProxy = {
  /** GET /api/testrail/projects — via backend proxy */
  getAll: (): Promise<TestRailProject[]> =>
    fetch(`${PROXY}/api/testrail/projects?counts=true`).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    }).then((data: any) => {
      // El endpoint devuelve { projects: [...] }
      const list = Array.isArray(data) ? data : (data?.projects ?? []);
      // Normaliza suites para que siempre sea un array, independiente de lo que devuelva el backend
      return list.map((p: any) => ({ ...p, suites: Array.isArray(p.suites) ? p.suites : [] })) as TestRailProject[];
    }),
};

export const trProjects = {
  /** GET /get_projects — lista todos los proyectos */
  list: () =>
    testrailRequest<TRProject[]>('/get_projects'),

  /** GET /get_project/:id */
  get: (projectId: number) =>
    testrailRequest<TRProject>(`/get_project/${projectId}`),

  /** GET /get_suites/:project_id */
  suites: (projectId: number) =>
    testrailRequest<TRSuite[]>(`/get_suites/${projectId}`),

  /** GET /get_suite/:suite_id */
  suite: (suiteId: number) =>
    testrailRequest<TRSuite>(`/get_suite/${suiteId}`),

  /** GET /get_sections/:project_id&suite_id=:suite_id */
  sections: (projectId: number, suiteId?: number) => {
    const qs = suiteId ? `&suite_id=${suiteId}` : '';
    return testrailRequest<TRSection[]>(`/get_sections/${projectId}${qs}`);
  },

  /** GET /get_milestones/:project_id */
  milestones: (projectId: number) =>
    testrailRequest<TRMilestone[]>(`/get_milestones/${projectId}`),
};
