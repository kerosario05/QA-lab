const RETRY_DELAYS = [0, 500, 1000, 2000];

export interface TestRailConfig {
  baseUrl: string;
  user: string;
  apiKey: string;
}

export function getTestRailConfig(): TestRailConfig {
  const baseUrl = process.env.TESTRAIL_URL ?? process.env.VITE_TESTRAIL_URL ?? '';
  const user = process.env.TESTRAIL_EMAIL ?? process.env.TESTRAIL_USER ?? process.env.VITE_TESTRAIL_USER ?? '';
  const apiKey = process.env.TESTRAIL_API_KEY ?? process.env.VITE_TESTRAIL_API_KEY ?? '';
  return { baseUrl, user, apiKey };
}

export class TestRailClientError extends Error {
  status: number;
  rateLimited: boolean;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, rateLimited = false, retryAfterSeconds?: number) {
    super(message);
    this.name = 'TestRailClientError';
    this.status = status;
    this.rateLimited = rateLimited;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TestRailClient {
  private baseUrl: string;
  private auth: string;
  private configured: boolean;

  constructor() {
    const config = getTestRailConfig();
    const normalizedUrl = config.baseUrl.replace(/\/+$/, '');
    this.baseUrl = normalizedUrl ? `${normalizedUrl}/index.php?/api/v2` : '';
    this.auth = config.user && config.apiKey ? Buffer.from(`${config.user}:${config.apiKey}`).toString('base64') : '';
    this.configured = !!(config.baseUrl && config.user && config.apiKey);

    if (!config.baseUrl) console.warn('[testrail-api] TestRail URL not set');
    if (!config.user) console.warn('[testrail-api] TestRail user not set');
    if (!config.apiKey) console.warn('[testrail-api] TestRail API key not set');

    console.log(`[testrail-api] TestRail URL configured=${!!config.baseUrl}`);
    console.log(`[testrail-api] TestRail user configured=${!!config.user}`);
    console.log(`[testrail-api] TestRail api key configured=${!!config.apiKey}`);
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.configured) {
      throw new TestRailClientError('TestRail configuration is missing', 503);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }

      try {
        const url = `${this.baseUrl}${path}`;
        if (attempt === 0) {
          console.log(`[testrail-api] request path=${path}`);
        } else {
          console.log(`[testrail-api] retry path=${path} attempt=${attempt + 1}/${RETRY_DELAYS.length}`);
        }
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${this.auth}`,
          },
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

          if (attempt < RETRY_DELAYS.length - 1) {
            continue;
          }

          throw new TestRailClientError(
            `TestRail rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
            429,
            true,
            retryAfterSeconds,
          );
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({} as Record<string, unknown>));
          throw new TestRailClientError(
            String((body as Record<string, unknown>)?.error ?? `TestRail ${res.status}: ${res.statusText}`),
            res.status,
          );
        }

        return res.json() as Promise<T>;
      } catch (err: any) {
        lastError = err;

        if (err instanceof TestRailClientError) {
          if (err.rateLimited && attempt < RETRY_DELAYS.length - 1) {
            continue;
          }
          throw err;
        }

        const isNetworkError = err instanceof TypeError || err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED';
        if (!isNetworkError) {
          throw err;
        }

        if (attempt >= RETRY_DELAYS.length - 1) {
          throw new TestRailClientError(
            `TestRail request failed after ${RETRY_DELAYS.length} attempts: ${err.message}`,
            0,
          );
        }
      }
    }

    throw lastError ?? new TestRailClientError('TestRail request failed', 0);
  }

  async getProjects(): Promise<{ projects: any[]; count: number }> {
    const raw = await this.request<any>('/get_projects');
    const normalized = normalizeTestRailProjectsResponse(raw);
    console.log(`[testrail-api] projects rawShape=${normalized.rawShape} normalizedCount=${normalized.count}`);
    return { projects: normalized.projects, count: normalized.count };
  }

  async getSuites(projectId: number): Promise<{ suites: any[]; count: number }> {
    const raw = await this.request<any>(`/get_suites/${projectId}`);
    const normalized = normalizeTestRailSuitesResponse(raw);
    console.log(`[testrail-api] suites rawShape=${normalized.rawShape} normalizedCount=${normalized.count}`);
    return { suites: normalized.suites, count: normalized.count };
  }

  async getSuite(suiteId: number): Promise<any> {
    return this.request<any>(`/get_suite/${suiteId}`);
  }

  async getSections(projectId: number, suiteId?: number): Promise<{ sections: any[]; count: number }> {
    const qs = suiteId ? `&suite_id=${suiteId}` : '';
    const raw = await this.request<any>(`/get_sections/${projectId}${qs}`);
    const normalized = normalizeTestRailSectionsResponse(raw);
    console.log(`[testrail-api] sections rawShape=${normalized.rawShape} normalizedCount=${normalized.count}`);
    return { sections: normalized.sections, count: normalized.count };
  }

  async getCases(projectId: number, params?: { suiteId?: number; sectionId?: number; offset?: number; limit?: number }): Promise<any> {
    const qs = new URLSearchParams();
    if (params?.suiteId) qs.set('suite_id', String(params.suiteId));
    if (params?.sectionId) qs.set('section_id', String(params.sectionId));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `&${qs.toString()}` : '';
    return this.request<any>(`/get_cases/${projectId}${query}`);
  }

  async getAllCases(projectId: number, params?: { suiteId?: number; sectionId?: number }): Promise<{ cases: any[]; count: number; pagesFetched: number }> {
    const limit = 250;
    let offset = 0;
    let allCases: any[] = [];
    let totalSize = 0;
    let pagesFetched = 0;
    const MAX_PAGES = 100;

    while (pagesFetched < MAX_PAGES) {
      const response = await this.getCases(projectId, { ...params, offset, limit });
      const normalized = normalizeTestRailCasesResponse(response);
      const pageCases = normalized.cases;
      const pageSize = response?.size ?? pageCases.length;

      allCases = allCases.concat(pageCases);
      if (pageSize > totalSize) totalSize = pageSize;
      pagesFetched++;

      const hasNext = response?._links?.next != null && pageCases.length >= limit;
      if (!hasNext) break;

      offset += limit;
    }

    const count = Math.max(totalSize, allCases.length);
    console.log(`[testrail-count] pagination projectId=${projectId} suiteId=${params?.suiteId ?? '—'} pages=${pagesFetched} totalCases=${count}`);
    return { cases: allCases, count, pagesFetched };
  }
}

export interface NormalizedCasesResponse {
  cases: any[];
  count: number;
  rawShape: string;
}

export function normalizeTestRailCasesResponse(response: unknown): NormalizedCasesResponse {
  const rawShape = Array.isArray(response)
    ? 'array'
    : response !== null && typeof response === 'object'
      ? `object:${Object.keys(response as object).join(',')}`
      : typeof response;

  if (Array.isArray(response)) {
    return { cases: response, count: response.length, rawShape };
  }

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const cases = obj.cases ?? obj.data ?? [];
    const count = typeof obj.size === 'number' ? obj.size : (Array.isArray(cases) ? cases.length : 0);
    return {
      cases: Array.isArray(cases) ? cases : [],
      count,
      rawShape,
    };
  }

  return { cases: [], count: 0, rawShape };
}

export interface NormalizedProjectsResponse {
  projects: any[];
  count: number;
  rawShape: string;
}

export interface NormalizedSuitesResponse {
  suites: any[];
  count: number;
  rawShape: string;
}

export function normalizeTestRailSuitesResponse(response: unknown): NormalizedSuitesResponse {
  const rawShape = Array.isArray(response)
    ? 'array'
    : response !== null && typeof response === 'object'
      ? `object:${Object.keys(response as object).join(',')}`
      : typeof response;

  if (Array.isArray(response)) {
    return { suites: response, count: response.length, rawShape };
  }

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const suites = obj.suites ?? obj.data ?? [];
    const count = typeof obj.size === 'number' ? obj.size : (Array.isArray(suites) ? suites.length : 0);
    return {
      suites: Array.isArray(suites) ? suites : [],
      count,
      rawShape,
    };
  }

  return { suites: [], count: 0, rawShape };
}

export interface NormalizedSectionsResponse {
  sections: any[];
  count: number;
  rawShape: string;
}

export function normalizeTestRailSectionsResponse(response: unknown): NormalizedSectionsResponse {
  const rawShape = Array.isArray(response)
    ? 'array'
    : response !== null && typeof response === 'object'
      ? `object:${Object.keys(response as object).join(',')}`
      : typeof response;

  if (Array.isArray(response)) {
    return { sections: response, count: response.length, rawShape };
  }

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const sections = obj.sections ?? obj.data ?? [];
    const count = typeof obj.size === 'number' ? obj.size : (Array.isArray(sections) ? sections.length : 0);
    return {
      sections: Array.isArray(sections) ? sections : [],
      count,
      rawShape,
    };
  }

  return { sections: [], count: 0, rawShape };
}

export function normalizeTestRailProjectsResponse(response: unknown): NormalizedProjectsResponse {
  const rawShape = Array.isArray(response)
    ? 'array'
    : response !== null && typeof response === 'object'
      ? `object:${Object.keys(response as object).join(',')}`
      : typeof response;

  if (Array.isArray(response)) {
    return { projects: response, count: response.length, rawShape };
  }

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const projects = obj.projects ?? obj.data ?? [];
    const count = typeof obj.size === 'number' ? obj.size : (Array.isArray(projects) ? projects.length : 0);
    return {
      projects: Array.isArray(projects) ? projects : [],
      count,
      rawShape,
    };
  }

  return { projects: [], count: 0, rawShape };
}
