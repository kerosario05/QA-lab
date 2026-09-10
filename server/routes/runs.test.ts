import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const PORT = 9878;
const MOCK_PROVIDER_PORT = 9879;
const ORIG_ENV = { ...process.env };

let app: ReturnType<typeof express>;
let server: Server;
let mockProvider: Server;
let lastDiscoveryBatchPayload: Record<string, unknown> | null = null;

const api = (path: string) => `http://localhost:${PORT}${path}`;

beforeAll(async () => {
  delete process.env.RUN_PROVIDER_BASE_URL;
  delete process.env.SCENARIO_PREVIEW_BASE_URL;
  delete process.env.RUN_PROVIDER_ENDPOINT_PREVIEW;
  delete process.env.RUN_PROVIDER_ENDPOINT_DISCOVERY;

  const { default: runsRouter } = await import('./runs');
  app = express();
  app.use(express.json());
  app.use('/api/runs', runsRouter);

  const mockApp = express();
  mockApp.use(express.json());
  mockApp.post('/api/runs/discovery-batch', (req, res) => {
    lastDiscoveryBatchPayload = req.body as Record<string, unknown>;
    res.status(202).json({ jobId: 'mock-job-1', status: 'queued' });
  });
  mockApp.post('/api/runs/discovery-batch-checklist', (req, res) => {
    lastDiscoveryBatchPayload = req.body as Record<string, unknown>;
    res.status(202).json({
      jobId: 'mock-job-checklist',
      status: 'queued',
      checklistUrl: '/checklist/job:mock-job-checklist',
      defectCount: 1,
    });
  });
  mockApp.post('/api/runs/scenario-preview', (_req, res) => {
    res.status(202).json({ ok: true, jobId: 'mock-job-2', status: 'queued', mode: 'scenario-preview', scenarioCount: 1 });
  });
  mockApp.post('/api/runs/scenario-preview-error', (_req, res) => {
    res.status(500).json({ errorCode: 'GENERATOR_FAILED', message: 'Internal provider error' });
  });
  mockApp.post('/api/runs/scenario-preview-html', (_req, res) => {
    res.status(500).send('<html>Server Error</html>');
  });
  mockApp.get('/api/runs/:jobId/logs', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('event: status\ndata: {"status":"running"}\n\n');
    res.write('event: done\ndata: {"status":"done","exitCode":0}\n\n');
    res.end();
  });
  mockApp.get('/api/runs/:jobId', (req, res) => {
    res.json({ jobId: req.params.jobId, status: 'running' });
  });
  mockApp.get('/api/runs/:jobId/evidence-docx/status', (req, res) => {
    if (req.params.jobId === 'job-ready') {
      res.status(200).json({ jobId: req.params.jobId, status: 'ready', documentReady: true, reasonCode: 'ready' });
      return;
    }
    if (req.params.jobId === 'job-pending') {
      res.status(202).json({ jobId: req.params.jobId, status: 'preparing', documentReady: false, reasonCode: 'document_preparing' });
      return;
    }
    if (req.params.jobId === 'job-failed') {
      res.status(200).json({ jobId: req.params.jobId, status: 'failed', documentReady: false, reasonCode: 'document_generation_failed' });
      return;
    }
    if (req.params.jobId === 'job-missing') {
      res.status(404).json({ jobId: req.params.jobId, status: 'not_found', documentReady: false, reasonCode: 'job_not_found' });
      return;
    }
    if (req.params.jobId === 'job-legacy') {
      res.status(404).send('Not Found');
      return;
    }
    res.status(200).json({ jobId: req.params.jobId, status: 'unavailable', documentReady: false, reasonCode: 'document_not_found_after_completion' });
  });
  mockApp.head('/api/runs/:jobId/evidence-docx', (req, res) => {
    if (req.params.jobId === 'job-ready') {
      res.status(200).end();
      return;
    }
    if (req.params.jobId === 'job-legacy') {
      res.status(200).end();
      return;
    }
    if (req.params.jobId === 'job-failed') {
      res.status(500).end();
      return;
    }
    res.status(404).end();
  });

  await Promise.all([
    new Promise<void>((resolve) => { server = app.listen(PORT, () => resolve()); }),
    new Promise<void>((resolve) => { mockProvider = mockApp.listen(MOCK_PROVIDER_PORT, () => resolve()); }),
  ]);
});

afterAll(() => {
  process.env = { ...ORIG_ENV };
  server?.close();
  mockProvider?.close();
});

const storyPayload = {
  stories: [{
    jiraKey: 'AA-1',
    title: 'Story 1',
    scenarios: [{
      title: 'Login scenario',
      refs: 'AA-1',
      custom_steps_separated: [{ content: 'Open login page', expected: 'Login page shown' }],
      custom_preconds: 'User is logged out',
      custom_expected: 'User is logged in',
    }],
  }],
  projectId: 56,
  suiteId: 1731,
};

const casePayload = {
  existingCaseIds: [100, 200],
  projectId: 56,
  suiteId: 1731,
};

describe('runs router — POST /api/runs/from-scenarios', () => {
  it('is registered and does not 404 — returns JSON', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('application/json');
    expect(res.status).not.toBe(404);
  });

  it('returns 400 for empty payload', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('INVALID_RUN_REQUEST');
  });

  it('returns 400 for stories with empty scenarios array and no caseIds', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stories: [{ jiraKey: 'AA-1', scenarios: [] }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('INVALID_RUN_REQUEST');
  });

  it('returns 503 when provider is not configured — scenario-preview mode', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storyPayload),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_NOT_CONFIGURED');
  });

  it('returns 503 when provider is not configured — discovery-batch mode', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(casePayload),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_NOT_CONFIGURED');
  });

  it('always returns JSON, never HTML', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('application/json');
    expect(res.status).toBe(400);
  });
});

describe('runs router — provider configured', () => {
  afterEach(() => {
    delete process.env.RUN_PROVIDER_ENDPOINT_PREVIEW;
    delete process.env.RUN_PROVIDER_ENDPOINT_DISCOVERY;
    lastDiscoveryBatchPayload = null;
  });

  it('proxies discovery-batch and returns jobId', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(casePayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe('mock-job-1');
    expect(body.status).toBe('queued');
    expect(lastDiscoveryBatchPayload?.executePromotedSpecs).toBeUndefined();
  });

  it('forwards contextOnly to the second discovery-batch request', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const runtimeEntriesByCase = {
      '100': [{ key: 'auth.username', value: 'redacted-fixture', source: 'test', sensitive: true }],
    };
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...casePayload,
        appSlug: 'app-a',
        contextOnly: true,
        runtimeEntriesByCase,
      }),
    });
    expect(res.status).toBe(200);
    expect(lastDiscoveryBatchPayload?.contextOnly).toBe(true);
    expect(lastDiscoveryBatchPayload?.appSlug).toBe('app-a');
    expect(lastDiscoveryBatchPayload?.caseIds).toEqual([100, 200]);
    expect(lastDiscoveryBatchPayload?.runtimeEntriesByCase).toEqual(runtimeEntriesByCase);
  });

  it('uses executePromotedSpecs for launch metadata and merges published caseIds', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appSlug: 'app-a',
        projectId: 56,
        suiteId: 1731,
        sectionId: 4903,
        sectionName: 'Detalle Kiosko',
        sectionSlug: 'detalle-kiosko',
        stories: [{ jiraKey: 'AA-1', scenarios: [{ title: 'S1' }] }],
        existingCaseIds: [100, 200],
        launchId: 'launch-1',
        testRunId: 9999,
        jiraKey: 'AA-1',
        publishedCases: [
          { scenarioId: 'TR-CASE-100', caseId: 100, sourceType: 'testrail_case' },
          {
            scenarioId: 'L-abc-001',
            caseId: 300,
            sourceType: 'jira_preview',
            sourceIssueKey: 'AA-1',
            launchScenarioId: 'LAUNCH-001',
            executionScenarioId: 'PREVIEW-001',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe('mock-job-1');
    expect(lastDiscoveryBatchPayload).toBeTruthy();
    expect(lastDiscoveryBatchPayload?.executePromotedSpecs).toBe(true);
    expect(lastDiscoveryBatchPayload?.launchId).toBe('launch-1');
    expect(lastDiscoveryBatchPayload?.testRunId).toBe(9999);
    expect(lastDiscoveryBatchPayload?.appSlug).toBe('app-a');
    expect(lastDiscoveryBatchPayload?.sectionSlug).toBe('detalle-kiosko');
    expect(lastDiscoveryBatchPayload?.caseIds).toEqual([100, 200, 300]);
    const forwardedPublishedCases = lastDiscoveryBatchPayload?.publishedCases as Array<Record<string, unknown>>;
    expect(forwardedPublishedCases).toHaveLength(2);
    expect(forwardedPublishedCases[1]).toMatchObject({
      sourceType: 'jira_preview',
      sourceIssueKey: 'AA-1',
      launchScenarioId: 'LAUNCH-001',
      executionScenarioId: 'PREVIEW-001',
    });
  });

  it('propaga checklistUrl y defectCount en discovery-batch sin issueKey obligatorio', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    process.env.RUN_PROVIDER_ENDPOINT_DISCOVERY = '/api/runs/discovery-batch-checklist';
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(casePayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe('mock-job-checklist');
    expect(body.checklistUrl).toBe('/checklist/job:mock-job-checklist');
    expect(body.defectCount).toBe(1);
    expect(body.issueKey).toBeUndefined();
  });

  it('proxies scenario-preview and returns jobId', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storyPayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe('mock-job-2');
    expect(body.status).toBe('queued');
  });

  it('returns 502 when provider returns 500', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    process.env.RUN_PROVIDER_ENDPOINT_PREVIEW = '/api/runs/scenario-preview-error';
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storyPayload),
    });
    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('GENERATOR_FAILED');
  });

  it('converts HTML provider response to JSON error', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    process.env.RUN_PROVIDER_ENDPOINT_PREVIEW = '/api/runs/scenario-preview-html';
    const res = await fetch(api('/api/runs/from-scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storyPayload),
    });
    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_INVALID_RESPONSE');
  });
});

describe('runs router — GET endpoints', () => {
  it('GET /:jobId/logs returns 503 when not configured', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/job-1/logs'));
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_NOT_CONFIGURED');
  });

  it('GET /:jobId returns 503 when not configured', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/job-1'));
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_NOT_CONFIGURED');
  });

  it('GET /:jobId/evidence-docx/status returns 503 when not configured', async () => {
    delete process.env.RUN_PROVIDER_BASE_URL;
    delete process.env.SCENARIO_PREVIEW_BASE_URL;
    const res = await fetch(api('/api/runs/job-1/evidence-docx/status'));
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.errorCode).toBe('RUN_PROVIDER_NOT_CONFIGURED');
  });

  it('GET /:jobId/logs proxies SSE when configured', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-1/logs'));
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: status');
    expect(text).toContain('"status":"running"');
  });

  it('GET /:jobId proxies status when configured', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-1'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.jobId).toBe('job-1');
    expect(body.status).toBe('running');
  });

  it('GET /:jobId/evidence-docx/status devuelve ready cuando provider responde ready', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-ready/evidence-docx/status'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.jobId).toBe('job-ready');
    expect(body.status).toBe('ready');
    expect(body.documentReady).toBe(true);
    expect(body.reasonCode).toBe('ready');
  });

  it('GET /:jobId/evidence-docx/status devuelve preparing cuando provider responde preparing', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-pending/evidence-docx/status'));
    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.jobId).toBe('job-pending');
    expect(body.status).toBe('preparing');
    expect(body.documentReady).toBe(false);
    expect(body.reasonCode).toBe('document_preparing');
  });

  it('GET /:jobId/evidence-docx/status devuelve failed cuando provider responde failed', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-failed/evidence-docx/status'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.jobId).toBe('job-failed');
    expect(body.status).toBe('failed');
    expect(body.documentReady).toBe(false);
    expect(body.reasonCode).toBe('document_generation_failed');
  });

  it('GET /:jobId/evidence-docx/status devuelve 404 cuando provider reporta job_not_found', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-missing/evidence-docx/status'));
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.status).toBe('not_found');
    expect(body.documentReady).toBe(false);
    expect(body.reasonCode).toBe('job_not_found');
  });

  it('GET /:jobId/evidence-docx/status usa fallback HEAD cuando provider no expone /status', async () => {
    process.env.RUN_PROVIDER_BASE_URL = `http://localhost:${MOCK_PROVIDER_PORT}`;
    const res = await fetch(api('/api/runs/job-legacy/evidence-docx/status'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ready');
    expect(body.documentReady).toBe(true);
  });
});
