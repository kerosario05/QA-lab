import { Router, type Request, type Response } from 'express';
import { engineBaseUrl, engineHeaders } from '../engine-auth';

/**
 * Transparent proxy for the engine's identity surface.
 *
 * The browser never talks to the engine directly (CORS and the engine's port are
 * not public), so login, the forced password change and the whole admin module
 * have to travel through the BFF. Nothing is interpreted here: bodies, status
 * codes and error shapes are passed straight back, which keeps the contract the
 * engine already tests as the single source of truth.
 */

export const identityRouter = Router();

const PREFIXES = ['/api/auth', '/api/users', '/api/roles', '/api/permissions'];

async function proxy(req: Request, res: Response): Promise<void> {
  const base = engineBaseUrl();
  if (!base) {
    res.status(503).json({
      ok: false,
      error: 'engine_not_configured',
      message: 'SCENARIO_PREVIEW_BASE_URL no está configurado en el servidor de QA Lab',
    });
    return;
  }

  const target = `${base}${req.originalUrl}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...engineHeaders(),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(text || '{}');
  } catch (err: any) {
    // A refused connection here almost always means the engine is not running;
    // say so plainly instead of surfacing a bare fetch error in the login box.
    const message = err?.cause?.code === 'ECONNREFUSED'
      ? `No se pudo conectar con el motor de automatización en ${base}. ¿Está corriendo?`
      : err?.message ?? String(err);
    console.error(`[identity-proxy] ${req.method} ${target} -> ${message}`);
    res.status(502).json({ ok: false, error: 'engine_unreachable', message });
  }
}

for (const prefix of PREFIXES) {
  identityRouter.all(prefix, proxy);
  identityRouter.all(`${prefix}/*splat`, proxy);
}

console.log(`[identity-proxy] rutas registradas: ${PREFIXES.join(', ')}`);
