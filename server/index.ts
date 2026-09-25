import './env';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import testrailRouter from './routes/testrail';
import jiraRouter from './routes/jira';
import scenariosRouter from './routes/scenarios';
import runsRouter from './routes/runs';
import newmanRouter from './routes/newman';
import checklistRouter from './routes/checklist';
import mobileRouter from './routes/mobile';
import executionsRouter from './routes/executions';
import runtimeInputsRouter from './routes/runtime-inputs';
import recordingsRouter from './routes/recordings';
import { captureRequestAuth } from './engine-auth';
import { identityRouter } from './routes/identity';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const JSON_LIMIT = process.env.QA_LAB_JSON_LIMIT ?? '1mb';

app.use(cors({ origin: true, credentials: true }));
// Makes the browser's bearer token visible to every engine call made downstream.
app.use(captureRequestAuth());
// Only parse content types that are actually JSON. Never parse multipart, form-encoded,
// text/plain, etc. as JSON — that corrupts the body and breaks proxy forwarding.
app.use(express.json({
  limit: JSON_LIMIT,
  type: (req: any) => {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.startsWith('application/json') || ct.includes('application/')) {
      return ct.includes('json');
    }
    return false;
  }
}));

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    console.warn(`[qa-lab-transport] 413 method=${req.method} path=${req.path} contentType=${req.headers['content-type'] ?? ''} contentLength=${req.headers['content-length'] ?? 'unknown'} configuredJsonLimit=${JSON_LIMIT}`);
    res.status(413).json({ ok: false, errorCode: 'PAYLOAD_TOO_LARGE', message: 'No se pudo guardar la actualización de Recording porque la solicitud excedió el límite permitido.' });
    return;
  }
  next(err);
});

async function proxyProjects(req: any, res: any) {
  const base = (process.env.SCENARIO_PREVIEW_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return res.status(503).json({ ok: false, errorCode: 'PROJECTS_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });
  const suffix = req.path.replace(/^\/api\/projects\/?/, '');
  const url = suffix ? `${base}/api/projects/${suffix}` : `${base}/api/projects`;
  if (suffix) console.log(`[projects-proxy] ${req.method} ${req.path} -> ${url}`);
  // Log para mobile creation
  if (req.path.includes('mobile') || suffix === 'mobile') {
    console.log(`[mobile-project-create-request] bodyKeys=${Object.keys((req as any).body||{}).join(',')} namePresent=${String(!!(req as any).body?.name)} slugPresent=${String(!!(req as any).body?.slug)}`);
  }
  const contentType = String(req.headers['content-type'] || '');
  const isMultipart = contentType.includes('multipart/form-data');
  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers as Record<string, any>)) {
      if (!v) continue;
      const lk = k.toLowerCase();
      if (['host', 'content-length', 'connection', 'transfer-encoding', 'expect'].includes(lk)) continue;
      if (!isMultipart && lk === 'content-type') continue;
      headers[k] = Array.isArray(v) ? v.join(',') : String(v);
    }
    let fetchInit: any = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (isMultipart) {
        console.log(`[projects-proxy] multipart contentType=${contentType} contentLength=${req.headers['content-length']}`);
        fetchInit.body = req as any;
        (fetchInit as any).duplex = 'half';
      } else {
        const body = JSON.stringify((req as any).body ?? {});
        console.log(`[projects-proxy-json] target=${url} bodyKeys=${Object.keys((req as any).body||{}).join(',')} namePresent=${String(!!(req as any).body?.name)} contentType=application/json forwardedContentLength=auto`);
        headers['Content-Type'] = 'application/json';
        fetchInit.body = body;
      }
    }
    if (!isMultipart) {
      const serializedBody = fetchInit.body as string;
      console.log(`[projects-proxy-json-wire] method=${req.method} target=${url} serializedBytes=${serializedBody?.length ?? 0} serializedHasName=${String(serializedBody?.includes('"name"'))} serializedPreview=${serializedBody?.slice(0,300) ?? ''}`);
    }
    console.log(`[projects-proxy-fetch] method=${req.method} url=${url} bodyType=${typeof fetchInit.body} isBuffer=${Buffer.isBuffer(fetchInit.body)} isStream=${fetchInit.body && typeof fetchInit.body === 'object' && typeof (fetchInit.body as any).pipe === 'function'}`);
    const r: any = await fetch(url, fetchInit);
    console.log(`[projects-proxy-response] status=${r.status} ok=${r.ok}`);
    const body = await r.json().catch((e: any) => { console.log(`[projects-proxy-json-parse-error] ${e.message}`); return {}; });
    res.status(r.status).json(body);
  } catch (err: any) {
    console.log(`[projects-proxy-error] name=${err.name} message=${err.message} cause=${err.cause} code=${(err.cause as any)?.code}`);
    res.status(502).json({ ok: false, errorCode: 'PROXY_ERROR', message: err.message });
  }
}

// /api/projects → automation engine (SQL-backed multi-project storage)
// Identity (login, users, roles) proxied verbatim to the engine.
app.use(identityRouter);

app.all('/api/projects', async (req, res) => proxyProjects(req, res));
app.all('/api/projects/*splat', async (req, res) => proxyProjects(req, res));

app.use('/api/testrail', testrailRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/newman', newmanRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/executions', executionsRouter);
app.use(runtimeInputsRouter);
app.use('/api/recordings', recordingsRouter);
app.use(checklistRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'qa-lab-backend', timestamp: Date.now() });
});

/**
 * Sirve el front compilado desde este mismo proceso.
 *
 * Evita depender de un proxy inverso: con el estático y la API en el mismo
 * origen no hace falta IIS con ARR para unirlos, y de paso desaparece el CORS
 * entre navegador y API.
 *
 * Se monta al final, después de todas las rutas /api, para no taparlas. Sin
 * carpeta dist el servidor sigue funcionando solo como API — que es el caso en
 * desarrollo, donde Vite sirve el front por su cuenta.
 */
// Este proyecto es ESM, donde no existe __dirname. Resolver desde import.meta
// ata la ruta al archivo y no al directorio de trabajo, que como servicio de
// Windows puede ser cualquiera.
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, '..', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(
    express.static(distDir, {
      // index.html nunca se cachea: si no, tras desplegar el navegador seguiría
      // pidiendo los assets de la versión anterior. Los assets sí, llevan hash.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  // Aplicación de una sola página: cualquier ruta que no sea un archivo real ni
  // /api se resuelve con index.html, para que recargar en /checklist/AA-123 no
  // devuelva 404.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  console.log(`[qa-lab-server] front servido desde ${distDir}`);
} else {
  console.log(`[qa-lab-server] sin dist/: solo API (en desarrollo lo sirve Vite)`);
}

app.listen(PORT, () => {
  console.log(`[qa-lab-server] API listening on http://localhost:${PORT}`);
  console.log(`[qa-lab-server] routes: /api/testrail/*, /api/jira/*, /api/scenarios/*, /api/runs/*, /api/newman/*, /api/mobile/*, /api/executions/*, /api/recordings/*, /api/checklists/*`);
  const railEnv = { url: !!process.env.TESTRAIL_URL, email: !!process.env.TESTRAIL_EMAIL, key: !!process.env.TESTRAIL_API_KEY };
  console.log(`[qa-lab-server] TESTRAIL_URL=${railEnv.url} TESTRAIL_EMAIL=${railEnv.email} TESTRAIL_API_KEY=${railEnv.key}`);
});
