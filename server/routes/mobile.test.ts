import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const PORT = 9878;
const ORIG_ENV = { ...process.env };

let app: ReturnType<typeof express>;
let server: Server;

beforeAll(async () => {
  delete process.env.SCENARIO_PREVIEW_BASE_URL;
  const { default: mobileRouter } = await import('./mobile');
  app = express();
  app.use(express.json());
  app.use('/api/mobile', mobileRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

afterAll(() => {
  process.env = { ...ORIG_ENV };
  server?.close();
});

const api = (path: string) => `http://localhost:${PORT}${path}`;

describe('mobile router', () => {
  it('is registered and does not 404 — returns JSON', async () => {
    const res = await fetch(api('/api/mobile/emulator/status'), { method: 'GET' });
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    expect(res.status).not.toBe(404);
  });

  it('emulator/start returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/emulator/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('EMULATOR_NOT_CONFIGURED');
  });

  it('emulator/status returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/emulator/status'), { method: 'GET' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('EMULATOR_NOT_CONFIGURED');
  });

  it('appium/status returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/appium/status'), { method: 'GET' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('APPIUM_NOT_CONFIGURED');
  });

  it('scenarios/preview returns 400 when projectKey is missing', async () => {
    const res = await fetch(api('/api/mobile/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSprint: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_PROJECT_KEY');
  });

  it('scenarios/preview returns 400 when sprintId and activeSprint are both missing', async () => {
    const res = await fetch(api('/api/mobile/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_SPRINT');
  });

  it('scenarios/preview returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA', sprintId: 123 }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('MOBILE_SCENARIOS_NOT_CONFIGURED');
  });

  it('scenarios/generation returns 400 when projectKey is missing', async () => {
    const res = await fetch(api('/api/mobile/scenarios/generation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSprint: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_PROJECT_KEY');
  });

  it('scenarios/generation returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/scenarios/generation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA', sprintId: 123 }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('MOBILE_SCENARIOS_NOT_CONFIGURED');
  });

  it('scenarios/generation/:jobId returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/scenarios/generation/job-123'), {
      method: 'GET',
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('MOBILE_SCENARIOS_NOT_CONFIGURED');
  });

  it('runs/launch-execution returns 400 when scenarios is empty', async () => {
    const res = await fetch(api('/api/mobile/runs/launch-execution'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appSlug: 'app-conversacional-bsc', projectId: 1, testrailSectionId: 2, scenarios: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_SCENARIOS');
  });

  it('runs/launch-execution returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/runs/launch-execution'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appSlug: 'app-conversacional-bsc', projectId: 1, testrailSectionId: 2, scenarios: [{ scenarioId: 'MOBILE-AA-001' }] }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('MOBILE_RUNS_NOT_CONFIGURED');
  });

  it('runs/execute returns 400 when launchId/testRunId are missing', async () => {
    const res = await fetch(api('/api/mobile/runs/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarios: [{ scenarioId: 'MOBILE-AA-001' }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_LAUNCH_CONTEXT');
  });

  it('runs/execute returns 400 when scenarios is empty', async () => {
    const res = await fetch(api('/api/mobile/runs/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchId: 'L1', testRunId: 42, scenarios: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_SCENARIOS');
  });

  it('runs/execute returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/mobile/runs/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchId: 'L1', testRunId: 42, scenarios: [{ scenarioId: 'MOBILE-AA-001' }] }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('MOBILE_RUNS_NOT_CONFIGURED');
  });

  it('always returns JSON, never HTML', async () => {
    const res = await fetch(api('/api/mobile/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    expect(res.status).toBe(400);
  });
});
