import { jiraRequest } from './client';
import type { JiraProject, JiraSprint } from './types';

export const jiraProjectsProxy = {
  /** GET /api/jira/projects */
  getAll: (): Promise<JiraProject[]> =>
    jiraRequest<any>('/api/jira/projects').then(data =>
      Array.isArray(data) ? data : (data?.projects ?? data?.values ?? [])
    ),

  /** GET /api/jira/projects/{key}/sprint/active — respuesta: { sprint: {...} } */
  getActiveSprint: (key: string): Promise<JiraSprint | null> =>
    jiraRequest<{ sprint: JiraSprint }>(`/api/jira/projects/${key}/sprint/active`)
      .then(data => data?.sprint ?? null)
      .catch(() => null),

  /** GET /api/jira/projects/{key}/sprint/{sprintId}/issues?status=<name> — read-only, respuesta: { issues: [{ key, summary }] } */
  getSprintIssues: (projectKey: string, sprintId: number | string, status?: string): Promise<Array<{ key: string; summary: string }>> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return jiraRequest<{ issues: Array<{ key: string; summary: string }> }>(`/api/jira/projects/${projectKey}/sprint/${sprintId}/issues${qs}`)
      .then(data => Array.isArray(data?.issues) ? data.issues : [])
      .catch(() => []);
  },
};
