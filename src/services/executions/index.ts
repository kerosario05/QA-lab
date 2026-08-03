const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ExecutionListItem {
  launchId: string;
  createdAt?: string;
  completedAt?: string;
  status?: string;
  huKey?: string;
  huTitle?: string;
  appSlug?: string;
  testRunId?: number | string;
  scenarioCount: number;
  passed: number;
  failed: number;
}

export interface ExecutionScenario {
  scenarioId: string;
  caseId?: number;
  title: string;
  result: 'passed' | 'failed' | 'pending';
  syncStatus?: string;
  testRailStatusId?: number;
}

export interface ExecutionDefect {
  id: string;
  title: string;
  severity: string;
  status: string;
  registeredInJira: boolean;
  jiraIssueKey?: string;
  jiraIssueUrl?: string;
}

export interface ExecutionSummary {
  launchId: string;
  jobId?: string;
  createdAt?: string;
  completedAt?: string;
  status?: string;
  hu: { key?: string; title?: string };
  project: { appSlug?: string };
  testRail: {
    projectId?: number | string;
    suiteId?: number | string;
    sectionId?: number | string;
    sectionName?: string;
    sectionSlug?: string;
    runId?: number | string;
    runUrl?: string;
  };
  scenarios: ExecutionScenario[];
  summary: { total: number; passed: number; failed: number; synced?: number; syncFailed?: number };
  defects: ExecutionDefect[];
  evidenceAvailable: boolean;
}

export async function listExecutions(): Promise<ExecutionListItem[]> {
  const res = await fetch(`${API_BASE}/api/executions`);
  if (!res.ok) throw new Error(`Failed to fetch executions: ${res.statusText}`);
  const body = await res.json();
  return Array.isArray(body?.executions) ? body.executions : [];
}

export async function getExecution(launchId: string): Promise<ExecutionSummary> {
  const res = await fetch(`${API_BASE}/api/executions/${encodeURIComponent(launchId)}`);
  if (!res.ok) throw new Error(`Failed to fetch execution: ${res.statusText}`);
  const body = await res.json();
  return body.execution as ExecutionSummary;
}
