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

  private async request<T>(path: string, opts?: { method?: string; body?: string }): Promise<T> {
    const method = opts?.method ?? 'GET';
    const body = opts?.body;

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
        console.log(`[jira-api] request method=${method} path=${path}`);
        const res = await fetch(url, {
          method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Basic ${this.auth}`,
          },
          body,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null) as Record<string, unknown> | null;
          const bodyStr = body ? JSON.stringify(body) : await res.text().catch(() => '');
          console.log(`[jira-api] error status=${res.status} path=${path} method=${method} body=${bodyStr.substring(0, 500)}`);
          const errors = Array.isArray(body?.errorMessages) ? body!.errorMessages as unknown[] : [];
          const msg = (errors[0] as string)
            ?? (body?.errorMessage as string)
            ?? `Jira ${res.status}: ${res.statusText}`;
          throw new JiraClientError(String(msg), res.status);
        }

        // Handle 204 No Content or empty body gracefully
        if (res.status === 204) return {} as unknown as T;
        const text = await res.text().catch(() => '');
        if (!text || text.trim() === '') return {} as unknown as T;
        return JSON.parse(text) as T;
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

  async createIssue(payload: {
    projectKey: string;
    summary: string;
    description: string | object;
    issueType?: string;
    labels?: string[];
    assigneeAccountId?: string;
    customFields?: Record<string, unknown>;
  }): Promise<{ key: string; id: string; self: string }> {
    const { projectKey, summary, description, issueType = 'Bug', labels = [], assigneeAccountId, customFields } = payload;

    // Use plain string for v2 API (ADF only works with v3)
    const descString = typeof description === 'string'
      ? description
      : (description as any)?.content?.map((b: any) =>
          b?.content?.map((c: any) => c?.text).join('')
        ).join('\n') ?? '';

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
      description: descString,
      labels: ['qa-lab', 'automated-defect', 'scenario-preview', ...labels],
    };

    if (assigneeAccountId) {
      fields.assignee = { accountId: assigneeAccountId };
    }

    // Spread custom fields (field IDs mapped by createmeta)
    if (customFields) {
      Object.assign(fields, customFields);
    }

    const fieldKeys = Object.keys(fields);
    console.log(`[jira-api] createIssue payload projectKey=${projectKey} issueType=${issueType} summary="${summary.substring(0, 80)}" summaryLen=${summary.length} descLen=${descString.length} descriptionFormat=string hasAssignee=${!!assigneeAccountId} customFields=${customFields ? Object.keys(customFields).length : 0} fields=[${fieldKeys.join(',')}] labels=[${fields.labels}]`);

    try {
      const result = await this.request<{ key: string; id: string; self: string }>('/rest/api/2/issue', {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });
      return result;
    } catch (err: any) {
      // Try without assignee if that caused the error
      if (assigneeAccountId && err instanceof JiraClientError && err.status === 400) {
        console.log(`[jira-api] createIssue retrying without assignee (assignee may have caused 400)`);
        delete fields.assignee;
        const result = await this.request<{ key: string; id: string; self: string }>('/rest/api/2/issue', {
          method: 'POST',
          body: JSON.stringify({ fields }),
        });
        // Try to assign after creation
        try {
          await this.request<any>(`/rest/api/2/issue/${result.key}/assignee`, {
            method: 'PUT',
            body: JSON.stringify({ accountId: assigneeAccountId }),
          });
          console.log(`[jira-api] assignee set after creation issueKey=${result.key} accountId=${assigneeAccountId}`);
        } catch (assignErr: any) {
          console.log(`[jira-api] assignee warning issueKey=${result.key} accountId=${assigneeAccountId} reason=${assignErr.message}`);
        }
        return result;
      }
      throw err;
    }
  }

  async searchUsers(query: string, projectKey: string): Promise<Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string }>> {
    console.log(`[jira-api] searchUsers query=${query} projectKey=${projectKey}`);

    const params = new URLSearchParams({ query, project: projectKey });
    const data = await this.request<any>(`/rest/api/2/user/assignable/search?${params.toString()}`);

    const users = Array.isArray(data) ? data : (data?.values ?? []);
    return users.map((u: any) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: u.emailAddress,
      avatarUrl: u.avatarUrls?.['16x16'] ?? u.avatarUrls?.['32x32'],
    }));
  }

  async addComment(issueKey: string, body: string): Promise<{ id: string }> {
    console.log(`[jira-api] addComment issueKey=${issueKey} bodyLen=${body.length}`);
    try {
      const result = await this.request<{ id: string }>(`/rest/api/2/issue/${issueKey}/comment`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      console.log(`[jira-api] addComment success issueKey=${issueKey}`);
      return result;
    } catch (err: any) {
      console.log(`[jira-api] addComment failed issueKey=${issueKey} reason=${err.message}`);
      throw err;
    }
  }

  async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
    console.log(`[jira-api] transitions issueKey=${issueKey}`);
    const data = await this.request<{ transitions?: Array<{ id: string; name: string }> }>(`/rest/api/2/issue/${issueKey}/transitions`);
    const transitions = data?.transitions ?? [];
    console.log(`[jira-api] transitions issueKey=${issueKey} available=${transitions.map(t => t.name).join(', ')}`);
    return transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    console.log(`[jira-api] transitionIssue issueKey=${issueKey} transitionId=${transitionId}`);
    try {
      await this.request<any>(`/rest/api/2/issue/${issueKey}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
      console.log(`[jira-api] transitionIssue success issueKey=${issueKey}`);
    } catch (err: any) {
      console.log(`[jira-api] transitionIssue failed issueKey=${issueKey} reason=${err.message}`);
      throw err;
    }
  }
}
