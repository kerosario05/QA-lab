import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

/**
 * 9/cache304 root cause: these routes serve mutable per-recording state (scenarios/trace/
 * semantic) at a URL that never changes. Express's default ETag support let the browser
 * revalidate and receive a bodyless 304, which the client's `request()` wrapper cannot tell
 * apart from "no data" -- intermittently making the Escenarios section fail to reappear when
 * reopening a historical recording. Every response from this router must forbid that caching so
 * a conditional GET can never come back as 304 in the first place.
 */

const PORT = 9879;
let app: ReturnType<typeof express>;
let server: Server;

beforeAll(async () => {
  const { default: recordingsRouter } = await import('./recordings');
  app = express();
  app.use(express.json());
  app.use('/api/recordings', recordingsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

afterAll(() => {
  server?.close();
});

const api = (path: string) => `http://localhost:${PORT}${path}`;

describe('recordings router — cache headers', () => {
  it('scenarios GET response forbids caching/revalidation', async () => {
    const res = await fetch(api('/api/recordings/rec-1/scenarios?projectSlug=demo'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('trace GET response forbids caching/revalidation', async () => {
    const res = await fetch(api('/api/recordings/rec-1/trace?projectSlug=demo'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('semantic GET response forbids caching/revalidation', async () => {
    const res = await fetch(api('/api/recordings/rec-1/semantic?projectSlug=demo'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('even an early-validation error response (missing projectSlug) forbids caching', async () => {
    const res = await fetch(api('/api/recordings/rec-1/scenarios'));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('no-store also prevents Express from emitting a validator a browser could revalidate against', async () => {
    const res = await fetch(api('/api/recordings/rec-1/scenarios?projectSlug=demo'));
    // no-store is defined to forbid storing the response at all, which makes an ETag/If-None-Match
    // revalidation round-trip (and therefore a 304) impossible regardless of body content.
    expect(res.status).not.toBe(304);
  });
});
