import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { engineBaseUrl } from './engine-auth';

/**
 * `/descargas/*` → engine, streamed.
 *
 * The local agent on each PC downloads Chromium (~180 MB) from here, and IT's installer the
 * agent itself; only this port is reachable from the PCs. Unlike the JSON proxies the body is
 * piped without buffering, and Content-Length is kept so the agent can show progress.
 */
const PASS_HEADERS = ['content-type', 'content-length', 'last-modified', 'etag', 'cache-control', 'accept-ranges', 'content-range'];

export async function proxyDownload(req: Request, res: Response): Promise<void> {
  const base = engineBaseUrl();
  if (!base) {
    res.status(503).json({ ok: false, error: 'engine_not_configured' });
    return;
  }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    const headers: Record<string, string> = {};
    if (typeof req.headers.range === 'string') headers.Range = req.headers.range;
    const upstream = await fetch(`${base}${req.originalUrl}`, { headers, signal: controller.signal });
    res.status(upstream.status);
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as any).on('error', () => res.destroy()).pipe(res);
  } catch (err: any) {
    if (controller.signal.aborted) return;
    console.error(`[downloads-proxy] ${req.originalUrl} -> ${err?.message ?? err}`);
    if (!res.headersSent) res.status(502).json({ ok: false, error: 'engine_unreachable' });
    else res.destroy();
  }
}
