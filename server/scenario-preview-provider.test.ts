import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestScenarioPreview, getScenarioPreviewConfig } from './scenario-preview-provider';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('getScenarioPreviewConfig', () => {
  it('reads SCENARIO_PREVIEW_BASE_URL', () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp-runner:3000';
    const config = getScenarioPreviewConfig();
    expect(config.baseUrl).toBe('http://mcp-runner:3000');
  });

  it('uses default endpoint when SCENARIO_PREVIEW_ENDPOINT is missing', () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://example.com';
    const config = getScenarioPreviewConfig();
    expect(config.endpoint).toBe('/api/scenarios/preview');
  });

  it('reads SCENARIO_PREVIEW_ENDPOINT when present', () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://example.com';
    process.env.SCENARIO_PREVIEW_ENDPOINT = '/custom/endpoint';
    const config = getScenarioPreviewConfig();
    expect(config.endpoint).toBe('/custom/endpoint');
  });

  it('uses default timeout when SCENARIO_PREVIEW_TIMEOUT_MS is missing', () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://example.com';
    const config = getScenarioPreviewConfig();
    expect(config.timeoutMs).toBe(180000);
  });

  it('reads SCENARIO_PREVIEW_TIMEOUT_MS when present', () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://example.com';
    process.env.SCENARIO_PREVIEW_TIMEOUT_MS = '5000';
    const config = getScenarioPreviewConfig();
    expect(config.timeoutMs).toBe(5000);
  });

  it('returns empty baseUrl when no config', () => {
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const config = getScenarioPreviewConfig();
    expect(config.baseUrl).toBe('');
  });
});

describe('requestScenarioPreview', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns PREVIEW_NOT_CONFIGURED when baseUrl is missing', async () => {
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PREVIEW_NOT_CONFIGURED');
  });

  it('POSTs to the correct URL when provider is configured', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    let fetchUrl = '';
    globalThis.fetch = vi.fn(async (url: string, opts: any) => {
      fetchUrl = url;
      return new Response(JSON.stringify({ stories: [{ jiraKey: 'AA-1', title: 'Story 1', scenarios: [] }] }), { status: 200 });
    }) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', sprintId: 123, status: 'To Do' });

    expect(fetchUrl).toBe('http://mcp:3000/api/scenarios/preview');
    expect(result.ok).toBe(true);
  });

  it('sends payload as JSON body', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    let sentBody = '';
    globalThis.fetch = vi.fn(async (_url: string, opts: any) => {
      sentBody = opts.body;
      return new Response(JSON.stringify({ stories: [] }), { status: 200 });
    }) as any;

    await requestScenarioPreview({ projectKey: 'AA', sprintId: 123, status: 'To Do', testrailProjectId: 56 });

    const parsed = JSON.parse(sentBody);
    expect(parsed.projectKey).toBe('AA');
    expect(parsed.sprintId).toBe(123);
    expect(parsed.status).toBe('To Do');
    expect(parsed.testrailProjectId).toBe(56);
  });

  it('sends activeSprint=true when no sprintId', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    let sentBody = '';
    globalThis.fetch = vi.fn(async (_url: string, opts: any) => {
      sentBody = opts.body;
      return new Response(JSON.stringify({ stories: [] }), { status: 200 });
    }) as any;

    await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });

    const parsed = JSON.parse(sentBody);
    expect(parsed.activeSprint).toBe(true);
    expect(parsed.projectKey).toBe('AA');
  });

  it('returns PREVIEW_TIMEOUT on abort/timeout', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    process.env.SCENARIO_PREVIEW_TIMEOUT_MS = '5';
    globalThis.fetch = vi.fn(async (_url: string, opts: any) => {
      // Listen for abort signal and reject when fired
      await new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new DOMException('The operation was aborted', 'AbortError')), 10);
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
      });
      return new Response('', { status: 200 });
    }) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PREVIEW_TIMEOUT');
  });

  it('returns PREVIEW_INVALID_RESPONSE for non-JSON body', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    globalThis.fetch = vi.fn(async () => new Response('<html>404</html>', { status: 200 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PREVIEW_INVALID_RESPONSE');
  });

  it('returns PREVIEW_EMPTY_RESPONSE for empty body', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PREVIEW_EMPTY_RESPONSE');
  });

  it('returns error code from provider on 4xx/5xx', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      errorCode: 'GENERATOR_FAILED',
      message: 'Generation failed',
    }), { status: 500 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('GENERATOR_FAILED');
  });

  it('returns PREVIEW_PROVIDER_ERROR on network failure', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    globalThis.fetch = vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PREVIEW_PROVIDER_ERROR');
  });

  it('normalizes { stories } from provider', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    const providerResponse = {
      stories: [
        { jiraKey: 'AA-1', title: 'Story 1', scenarios: [{ title: 'Scenario 1', refs: '', custom_steps_separated: [] }] },
      ],
      totalScenarios: 1,
      sprint: { id: 1, name: 'Sprint 1' },
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(providerResponse), { status: 200 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(true);
    expect(result.stories).toHaveLength(1);
    expect(result.totalScenarios).toBe(1);
  });

  it('normalizes { generated, valid, rejected } from provider', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    const providerResponse = {
      valid: [{ jiraKey: 'AA-1', title: 'Valid Story', scenarios: [{ title: 'S1', refs: '', custom_steps_separated: [] }] }],
      generated: [],
      rejected: [{ key: 'AA-2', reason: 'No scenarios' }],
      totalScenarios: 1,
    };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(providerResponse), { status: 200 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(true);
    expect(result.stories).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('normalizes { data } wrapper from provider', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    const providerResponse = { data: [{ jiraKey: 'AA-1', title: 'Data Story', scenarios: [] }] };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(providerResponse), { status: 200 })) as any;

    const result = await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(result.ok).toBe(true);
    expect(result.stories).toHaveLength(1);
  });

  it('preserves Content-Type header in POST', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://mcp:3000';
    let sentHeaders: any = null;
    globalThis.fetch = vi.fn(async (_url: string, opts: any) => {
      sentHeaders = opts.headers;
      return new Response(JSON.stringify({ stories: [] }), { status: 200 });
    }) as any;

    await requestScenarioPreview({ projectKey: 'AA', activeSprint: true });
    expect(sentHeaders['Content-Type']).toBe('application/json');
  });
});
