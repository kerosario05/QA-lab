import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const PORT = 9877;
const ORIG_ENV = { ...process.env };

let app: ReturnType<typeof express>;
let server: Server;

beforeAll(async () => {
  delete process.env.SCENARIO_PREVIEW_BASE_URL;
  const { default: scenariosRouter } = await import('./scenarios');
  app = express();
  app.use(express.json());
  app.use('/api/scenarios', scenariosRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

afterAll(() => {
  process.env = { ...ORIG_ENV };
  server?.close();
});

const api = (path: string) => `http://localhost:${PORT}${path}`;

describe('scenarios router', () => {
  it('is registered and does not 404 — returns JSON', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA', sprintId: 123 }),
    });

    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    expect(res.status).not.toBe(404);
  });

  it('returns 400 when projectKey is missing', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSprint: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_PROJECT_KEY');
  });

  it('returns 400 when sprintId and activeSprint are both missing', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe('MISSING_SPRINT');
  });

  it('returns 503 when SCENARIO_PREVIEW_BASE_URL is not set', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA', sprintId: 123 }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('PREVIEW_NOT_CONFIGURED');
  });

  it('accepts activeSprint=true instead of sprintId', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'AA', activeSprint: true }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorCode).toBe('PREVIEW_NOT_CONFIGURED');
  });

  it('always returns JSON, never HTML', async () => {
    const res = await fetch(api('/api/scenarios/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    expect(res.status).toBe(400);
  });
});
