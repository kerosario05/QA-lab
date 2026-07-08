import { jiraRequest } from './client';

export interface UploadDefectInput {
  id?: string;
  scenarioId?: string;
  title?: string;
  scenarioTitle?: string;
  severity?: string;
  status?: string;
  description?: string;
  failureReason?: string;
  evidenceUrl?: string;
  updatedAt?: string;
  jiraIssueKey?: string;
}

export interface UploadDefectsPayload {
  appSlug: string;
  sourceIssueKey: string;
  jiraProjectKey: string;
  defects: UploadDefectInput[];
  assigneeAccountId?: string;
}

export interface UploadDefectsResponse {
  ok: boolean;
  created: Array<{ defectId: string; jiraIssueKey: string; jiraIssueUrl: string }>;
  failed: Array<{ defectId: string; reason: string }>;
  skipped: Array<{ defectId: string; reason: string; jiraIssueKey?: string }>;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
}

export async function uploadDefectsToJira(payload: UploadDefectsPayload): Promise<UploadDefectsResponse> {
  return jiraRequest<UploadDefectsResponse>('/api/jira/issues/upload-defects', {
    method: 'POST',
    body: payload,
  });
}

export async function searchJiraUsers(query: string, projectKey: string): Promise<{ ok: boolean; users: JiraUser[] }> {
  const params = new URLSearchParams({ query, projectKey });
  return jiraRequest<{ ok: boolean; users: JiraUser[] }>(`/api/jira/users/search?${params.toString()}`);
}
