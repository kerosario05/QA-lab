import { Router, type Request, type Response } from 'express';
import { engineBaseUrl, engineHeaders } from '../engine-auth';
import { fetchEngineRequest } from './identity-proxy-fetch';

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

// /api/test-design is not identity, but it is the same pass-through contract: the
// engine owns the module (drafts, generation, publishing) and enforces its permissions.
const PREFIXES = ['/api/auth', '/api/users', '/api/roles', '/api/permissions', '/api/test-design', '/api/local-agent'];

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
    // Retry only idempotent reads on transient failures. Generation and publish
    // requests are never replayed automatically, even if they appear to time out.
    const upstream = await fetchEngineRequest(fetch, target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...engineHeaders(),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    }, { retryRead: !hasBody, timeoutMs: hasBody ? 6 * 60_000 : 45_000 });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(text || '{}');
  } catch (err: any) {
    const code = err?.cause?.code ?? (err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'ETIMEDOUT' : 'UNKNOWN');
    const message = code === 'ETIMEDOUT'
      ? 'El motor de automatización tardó demasiado en responder. Intenta de nuevo; la solicitud no se reenvió automáticamente.'
      : `No se pudo conectar con el motor de automatización (${code}). Verifica que el backend esté activo y que SCENARIO_PREVIEW_BASE_URL apunte al servicio correcto.`;
    // Do not log query strings or request bodies; requests can carry test data.
    console.error(`[identity-proxy] ${req.method.toUpperCase()} ${req.path} -> ${code}`);
    res.status(502).json({ ok: false, error: 'engine_unreachable', message, retryable: !hasBody });
  }
}

for (const prefix of PREFIXES) {
  identityRouter.all(prefix, proxy);
  identityRouter.all(`${prefix}/*splat`, proxy);
}

console.log(`[identity-proxy] rutas registradas: ${PREFIXES.join(', ')}`);
