import { jiraRequest } from './client';
import type { JiraIssue, JiraProject, JiraSprint } from './types';

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

  /** Search Jira issues in a project by issue key or title. */
  searchIssues: (projectKey: string, query: string): Promise<JiraIssue[]> => {
    const qs = new URLSearchParams({ q: query }).toString();
    return jiraRequest<{ issues: JiraIssue[] }>(`/api/jira/projects/${encodeURIComponent(projectKey)}/issues/search?${qs}`)
      .then((data) => Array.isArray(data?.issues) ? data.issues : []);
  },

  /** Search Jira issues visible to the configured account by issue key or title. */
  searchAllIssues: (query: string): Promise<JiraIssue[]> => {
    const qs = new URLSearchParams({ q: query }).toString();
    return jiraRequest<{ issues: JiraIssue[] }>(`/api/jira/issues/search?${qs}`)
      .then((data) => Array.isArray(data?.issues) ? data.issues : []);
  },
};
