export interface TestRailConfig {
  url: string;
  email: string;
  apiKey: string;
}

export class TestRailClient {
  private baseUrl: string;
  private auth: string;

  constructor(config: TestRailConfig) {
    this.baseUrl = (config.url || '').replace(/\/+$/, '');
    this.auth = config.email && config.apiKey
      ? Buffer.from(`${config.email}:${config.apiKey}`).toString('base64')
      : '';
  }

  async getProjects(includeCounts?: boolean): Promise<any[]> {
    return this.trFetch('/get_projects', 'projects', includeCounts ? 'includeCounts=true' : undefined);
  }

  async getSections(projectId: number, suiteId: number): Promise<any[]> {
    return this.trFetch(`/get_sections/${projectId}&suite_id=${suiteId}`, 'sections');
  }

  async getCases(projectId: number, suiteId: number, sectionId: number): Promise<any[]> {
    return this.trFetch(`/get_cases/${projectId}&suite_id=${suiteId}&section_id=${sectionId}`, 'cases');
  }

  private async trFetch(apiPath: string, resultKey: string, extra?: string): Promise<any[]> {
    const url = `${this.baseUrl}/index.php?/api/v2${apiPath}`;
    console.log(`[testrail-api] request resource=${resultKey} url=${apiPath}${extra ? ` ${extra}` : ''}`);
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.auth}`,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.log(`[testrail-api] ${resultKey} failed status=${res.status} error=${(body as any)?.error ?? res.statusText}`);
      throw new Error((body as any)?.error ?? `TestRail ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    const items = (data as any)?.[resultKey] ?? (Array.isArray(data) ? data : []);
    console.log(`[testrail-api] ${resultKey} response count=${items.length}`);
    return items;
  }
}
