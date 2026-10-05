const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ExecutionListItem {
  launchId: string;
  jobId?: string;
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

export interface ExecutionListPage {
  executions: ExecutionListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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

export async function listExecutions(query: { limit?: number; offset?: number } = {}): Promise<ExecutionListPage> {
  const params = new URLSearchParams();
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null) params.set('offset', String(query.offset));
  const suffix = params.size ? `?${params.toString()}` : '';
  const executionsResponse = await fetch(`${API_BASE}/api/executions${suffix}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!executionsResponse.ok) throw new Error(`Failed to fetch executions: ${executionsResponse.statusText}`);

  const executionsBody = await executionsResponse.json();
  const executions: ExecutionListItem[] = Array.isArray(executionsBody?.executions) ? executionsBody.executions : [];
  const limit = nonNegativeNumber(executionsBody?.limit) || query.limit || 40;
  const offset = nonNegativeNumber(executionsBody?.offset) || query.offset || 0;
  const total = nonNegativeNumber(executionsBody?.total) || executions.length;
  return { executions, total, limit, offset, hasMore: typeof executionsBody?.hasMore === 'boolean' ? executionsBody.hasMore : offset + executions.length < total };
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getExecution(launchId: string): Promise<ExecutionSummary> {
  const res = await fetch(`${API_BASE}/api/executions/${encodeURIComponent(launchId)}`);
  if (res.ok) {
    const body = await res.json();
    return body.execution as ExecutionSummary;
  }

  // Some completed jobs (for example scenario previews without a TestRail launch)
  // exist only in /api/runs and have no persisted /api/executions detail.
  const runResponse = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(launchId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!runResponse.ok) throw new Error(`Failed to fetch execution: ${res.statusText}`);
  const raw = await runResponse.json() as Record<string, unknown>;
  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary as Record<string, unknown> : {};
  const params = raw.params && typeof raw.params === 'object' ? raw.params as Record<string, unknown> : {};
  const passed = nonNegativeNumber(summary.passed);
  const failed = nonNegativeNumber(summary.failed);
  const total = nonNegativeNumber(summary.totalCases ?? summary.scenarioCount ?? params.scenarioCount) || passed + failed;
  const title = [raw.currentCaseTitle, raw.currentCase, params.huTitle, params.scenarioTitle, params.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? 'Ejecución';
  const jobStatus = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const status = failed > 0 || ['failed', 'completed_with_failures'].includes(jobStatus)
    ? 'completed_with_failures'
    : (passed > 0 || ['done', 'completed', 'passed', 'success'].includes(jobStatus)) ? 'completed' : jobStatus;

  return {
    launchId: String(raw.id ?? launchId),
    jobId: String(raw.id ?? launchId),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    status,
    hu: { title },
    project: { appSlug: typeof params.appSlug === 'string' ? params.appSlug : typeof params.projectSlug === 'string' ? params.projectSlug : undefined },
    testRail: {},
    scenarios: [],
    summary: { total, passed, failed },
    defects: [],
    evidenceAvailable: Boolean(summary.evidenceAvailable || summary.evidenceDocxPath || raw.evidenceDocxPath),
  };
}
