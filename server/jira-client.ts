const RETRY_DELAYS = [0, 500, 1000, 2000];

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export function getJiraConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL ?? '';
  const email = process.env.JIRA_EMAIL ?? '';
  const apiToken = process.env.JIRA_API_TOKEN ?? '';
  return { baseUrl, email, apiToken };
}

export class JiraClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'JiraClientError';
    this.status = status;
  }
}

export class JiraClient {
  private baseUrl: string;
  private auth: string;
  private configured: boolean;

  constructor() {
    const config = getJiraConfig();
    const normalizedUrl = config.baseUrl.replace(/\/+$/, '');
    this.baseUrl = normalizedUrl;
    this.auth = config.email && config.apiToken ? Buffer.from(`${config.email}:${config.apiToken}`).toString('base64') : '';
    this.configured = !!(config.baseUrl && config.email && config.apiToken);

    if (!config.baseUrl) console.warn('[jira-api] Jira base URL not set');
    if (!config.email) console.warn('[jira-api] Jira email not set');
    if (!config.apiToken) console.warn('[jira-api] Jira API token not set');
    console.log(`[jira-api] Jira configured=${this.configured}`);
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.configured) {
      throw new JiraClientError('Jira configuration is missing', 503);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }

      try {
        const url = `${this.baseUrl}${path}`;
        console.log(`[jira-api] request path=${path}`);
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Basic ${this.auth}`,
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({} as Record<string, unknown>));
          throw new JiraClientError(
            String((body as Record<string, unknown>)?.errorMessage ?? `Jira ${res.status}: ${res.statusText}`),
            res.status,
          );
        }

        return res.json() as Promise<T>;
      } catch (err: any) {
        lastError = err;
        if (err instanceof JiraClientError) throw err;
        const isNetwork = err instanceof TypeError || err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED';
        if (!isNetwork) throw err;
        if (attempt >= RETRY_DELAYS.length - 1) {
          throw new JiraClientError(`Jira request failed after ${RETRY_DELAYS.length} attempts: ${err.message}`, 0);
        }
      }
    }

    throw lastError ?? new JiraClientError('Jira request failed', 0);
  }

  async getProjects(): Promise<any[]> {
    const data = await this.request<any>('/rest/api/2/project');
    const projects = Array.isArray(data) ? data : (data?.values ?? data?.projects ?? []);
    console.log(`[jira-api] projects normalizedCount=${Array.isArray(projects) ? projects.length : 0}`);
    return Array.isArray(projects) ? projects : [];
  }

  async getActiveSprint(projectKey: string): Promise<any | null> {
    try {
      const boards = await this.request<{ values?: any[] }>(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}`);
      if (!boards?.values?.length) {
        console.log(`[jira-api] no board for project=${projectKey}`);
        return null;
      }
      const boardId = boards.values[0].id;
      const sprints = await this.request<{ values?: any[] }>(`/rest/agile/1.0/board/${boardId}/sprint?state=active`);
      if (!sprints?.values?.length) {
        console.log(`[jira-api] no active sprint for board=${boardId} project=${projectKey}`);
        return null;
      }
      const s = sprints.values[0];
      return {
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
        goal: s.goal,
      };
    } catch (err: any) {
      console.log(`[jira-api] sprint lookup failed for project=${projectKey}: ${err.message}`);
      return null;
    }
  }

  async getSprintIssues(projectKey: string, sprintId: number): Promise<any[]> {
    try {
      const boards = await this.request<{ values?: any[] }>(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}`);
      if (!boards?.values?.length) {
        console.log(`[jira-api] getSprintIssues no board for project=${projectKey}`);
        return [];
      }
      const boardId = boards.values[0].id;
      const result = await this.request<{ issues?: any[] }>(`/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?maxResults=100`);
      const issues = result?.issues ?? [];
      console.log(`[jira-api] getSprintIssues project=${projectKey} sprintId=${sprintId} count=${issues.length}`);
      return issues;
    } catch (err: any) {
      console.log(`[jira-api] getSprintIssues error: ${err.message}`);
      return [];
    }
  }
}
