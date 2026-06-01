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
};
