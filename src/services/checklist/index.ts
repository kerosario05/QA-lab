const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Defect {
  id: string;
  scenarioId?: string;
  scenarioTitle?: string;
  title?: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  severityReason?: string;
  evidenceUrl?: string;
  status: 'pending_review' | 'accepted' | 'rejected' | 'fixed';
  createdAt: string;
  updatedAt: string;
  jiraIssueKey?: string;
  jiraIssueUrl?: string;
  jiraUploadedAt?: string;
  jiraUploadStatus?: 'uploaded' | 'failed';
  jiraUploadError?: string;
  technicalContext?: Record<string, unknown>;
  evidenceAttachment?: {
    status: 'attached' | 'not_available' | 'generation_failed' | 'upload_failed';
    attachmentName?: string;
    reasonCode?: string;
  };
}

export interface ChecklistResponse {
  issueKey: string;
  title?: string;
  checklistUrl: string;
  defects: Defect[];
  createdAt: string | null;
  updatedAt: string | null;
}

export async function getChecklist(issueKey: string, jobId?: string, scenarioIds?: string[]): Promise<ChecklistResponse> {
  const params = new URLSearchParams();
  if (jobId) params.set('jobId', jobId);
  if (scenarioIds && scenarioIds.length > 0) params.set('scenarioIds', scenarioIds.join(','));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/checklists/${encodeURIComponent(issueKey)}${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch checklist: ${res.statusText}`);
  return res.json();
}

export async function addDefect(
  issueKey: string,
  params: { description: string; severity: string; scenarioId?: string; scenarioTitle?: string; evidenceUrl?: string }
): Promise<{ ok: boolean; defect: Defect }> {
  const res = await fetch(`${API_BASE}/api/checklists/${encodeURIComponent(issueKey)}/defects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to add defect: ${res.statusText}`);
  return res.json();
}

export async function updateDefectStatus(
  issueKey: string,
  defectId: string,
  status: string
): Promise<{ ok: boolean; defect: Defect }> {
  const res = await fetch(`${API_BASE}/api/checklists/${encodeURIComponent(issueKey)}/defects/${encodeURIComponent(defectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update defect: ${res.statusText}`);
  return res.json();
}

export async function updateDefectJira(
  issueKey: string,
  defectId: string,
  jiraFields: { jiraIssueKey: string; jiraIssueUrl: string; jiraUploadStatus?: 'uploaded' | 'failed'; jiraUploadError?: string; jobId?: string; scenarioId?: string }
): Promise<{ ok: boolean; defect: Defect }> {
  const res = await fetch(`${API_BASE}/api/checklists/${encodeURIComponent(issueKey)}/defects/${encodeURIComponent(defectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jiraIssueKey: jiraFields.jiraIssueKey,
      jiraIssueUrl: jiraFields.jiraIssueUrl,
      jiraUploadedAt: new Date().toISOString(),
      jiraUploadStatus: jiraFields.jiraUploadStatus ?? 'uploaded',
      jiraUploadError: jiraFields.jiraUploadError,
      jobId: jiraFields.jobId,
      scenarioId: jiraFields.scenarioId,
    }),
  });
  if (!res.ok) throw new Error(`Failed to update defect Jira metadata: ${res.statusText}`);
  return res.json();
}
