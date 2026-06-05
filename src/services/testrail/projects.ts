import { testrailRequest } from './client';
import type { TRProject, TRSuite, TRSection, TRMilestone } from './types';
import type { TestRailProject } from '../../types';

const PROXY = import.meta.env.VITE_API_URL ?? '';

/** Fetch suites for a given project from the proxy (minimal, no caseCount). */
export async function fetchProjectSuites(projectId: number): Promise<{ id: number; name: string; is_master: boolean }[]> {
  const res = await fetch(`${PROXY}/api/testrail/projects/${projectId}/suites`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data?.suites ?? (Array.isArray(data) ? data : []);
}

/** Fetch the total case count for a project+suite (no section filter). */
export async function fetchProjectCaseCount(projectId: number, suiteId: number): Promise<number> {
  const res = await fetch(`${PROXY}/api/testrail/projects/${projectId}/suites/${suiteId}/cases/count`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const count = data?.count ?? 0;
  return count;
}

export const trProjectsProxy = {
  /** GET /api/testrail/projects — via backend proxy, minimal data (no counts) */
  getAll: async (): Promise<TestRailProject[]> => {
    const res = await fetch(`${PROXY}/api/testrail/projects`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retryAfter = body?.retryAfterSeconds ?? 60;
        const err: any = new Error(`TestRail rate limit exceeded. Retry after ${retryAfter} seconds.`);
        err.status = 429;
        err.rateLimited = true;
        err.retryAfterSeconds = retryAfter;
        throw err;
      }

      throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    // El endpoint devuelve { ok: true, projects: [...] }
    const list = Array.isArray(data) ? data : (data?.projects ?? []);
    return list.map((p: any) => ({
      id: p.id,
      name: p.name,
      suite_mode: p.suite_mode ?? 1,
      totalCaseCount: p.totalCaseCount ?? 0,
      suites: Array.isArray(p.suites) ? p.suites : [],
    })) as TestRailProject[];
  },
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
