import './env';
import express from 'express';
import cors from 'cors';
import testrailRouter from './routes/testrail';
import jiraRouter from './routes/jira';
import scenariosRouter from './routes/scenarios';
import runsRouter from './routes/runs';
import newmanRouter from './routes/newman';
import checklistRouter from './routes/checklist';
import mobileRouter from './routes/mobile';
import executionsRouter from './routes/executions';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: true, credentials: true }));
// Only parse content types that are actually JSON. Never parse multipart, form-encoded,
// text/plain, etc. as JSON — that corrupts the body and breaks proxy forwarding.
app.use(express.json({
  type: (req: any) => {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.startsWith('application/json') || ct.includes('application/')) {
      return ct.includes('json');
    }
    return false;
  }
}));

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
app.all('/api/projects', async (req, res) => proxyProjects(req, res));
app.all('/api/projects/*splat', async (req, res) => proxyProjects(req, res));

app.use('/api/testrail', testrailRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/newman', newmanRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/executions', executionsRouter);
app.use(checklistRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'qa-lab-backend', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[qa-lab-server] API listening on http://localhost:${PORT}`);
  console.log(`[qa-lab-server] routes: /api/testrail/*, /api/jira/*, /api/scenarios/*, /api/runs/*, /api/newman/*, /api/mobile/*, /api/executions/*, /api/checklists/*`);
  const railEnv = { url: !!process.env.TESTRAIL_URL, email: !!process.env.TESTRAIL_EMAIL, key: !!process.env.TESTRAIL_API_KEY };
  console.log(`[qa-lab-server] TESTRAIL_URL=${railEnv.url} TESTRAIL_EMAIL=${railEnv.email} TESTRAIL_API_KEY=${railEnv.key}`);
});
