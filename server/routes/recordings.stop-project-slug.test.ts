import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

/**
 * El motor solo deja detener una grabación a un usuario con proyectos asignados (qa-engineer)
 * si la petición nombra el proyecto. El BFF reenviaba `{}` y descartaba el `projectSlug` que
 * envía el panel, así que esos usuarios recibían 403 project_scope_required al detener.
 */

const PORT = 9881;
const ENGINE_PORT = 9882;
let server: Server;
let engine: Server;
let engineBodies: unknown[] = [];

beforeAll(async () => {
  const fakeEngine = express();
  fakeEngine.use(express.json());
  fakeEngine.post('/api/recordings/:recordingId/stop', (req, res) => {
    engineBodies.push(req.body);
    res.json({ ok: true, summary: { recordingId: req.params.recordingId } });
  });
  await new Promise<void>((resolve) => {
    engine = fakeEngine.listen(ENGINE_PORT, resolve);
  });
  process.env.SCENARIO_PREVIEW_BASE_URL = `http://localhost:${ENGINE_PORT}`;

  const { default: recordingsRouter } = await import('./recordings');
  const app = express();
  app.use(express.json());
  app.use('/api/recordings', recordingsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

afterAll(() => {
  server?.close();
  engine?.close();
});

const stop = (body: unknown) =>
  fetch(`http://localhost:${PORT}/api/recordings/rec-1/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('recordings router — stop', () => {
  it('forwards the projectSlug to the engine', async () => {
    engineBodies = [];
    const res = await stop({ projectSlug: 'kiosko' });
    expect(res.status).toBe(200);
    expect(engineBodies).toEqual([{ projectSlug: 'kiosko' }]);
  });

  it('rejects a stop without projectSlug instead of calling the engine', async () => {
    engineBodies = [];
    const res = await stop({});
    expect(res.status).toBe(400);
    expect(engineBodies).toEqual([]);
  });
});
