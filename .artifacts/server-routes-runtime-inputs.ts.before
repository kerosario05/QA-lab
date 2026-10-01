import { Router } from 'express';
import type { Request, Response } from 'express';

type Fetcher = (url: string, init?: RequestInit) => Promise<globalThis.Response>;

function upstreamBase(): string {
  return (process.env.RUN_PROVIDER_BASE_URL || process.env.SCENARIO_PREVIEW_BASE_URL || '').replace(/\/+$/, '');
}

export async function proxyScenarioAutofill(
  req: Request,
  res: Response,
  fetcher: Fetcher = (url, init) => fetch(url, init),
) {
  const base = upstreamBase();
  if (!base) return res.status(503).json({ ok: false, errorCode: 'SCENARIO_PREVIEW_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });

  try {
    const upstream = await fetcher(`${base}/api/runtime-inputs/scenario-autofill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await upstream.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
    return res.status(upstream.status).json(body);
  } catch (error) {
    return res.status(502).json({ ok: false, errorCode: 'PROXY_ERROR', message: error instanceof Error ? error.message : String(error) });
  }
}

export async function proxyCaseInputRequirements(
  req: Request,
  res: Response,
  fetcher: Fetcher = (url, init) => fetch(url, init),
) {
  const base = upstreamBase();
  const projectSlug = String(req.params.projectSlug ?? '').trim();
  const caseId = String(req.params.caseId ?? '').trim();
  if (!projectSlug || !caseId) {
    return res.status(400).json({ ok: false, errorCode: 'INVALID_INPUT_REQUIREMENTS_REFERENCE' });
  }
  if (!base) return res.status(503).json({ ok: false, errorCode: 'SCENARIO_PREVIEW_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });

  try {
    const upstream = await fetcher(`${base}/api/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/input-requirements`);
    const text = await upstream.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
    return res.status(upstream.status).json(body);
  } catch (error) {
    return res.status(502).json({ ok: false, errorCode: 'PROXY_ERROR', message: error instanceof Error ? error.message : String(error) });
  }
}

export async function proxySaveCaseInputRequirements(
  req: Request,
  res: Response,
  fetcher: Fetcher = (url, init) => fetch(url, init),
) {
  const projectSlug = String(req.params.projectSlug ?? '').trim();
  const caseId = String(req.params.caseId ?? '').trim();
  const inputRequirements = req.body?.inputRequirements;
  if (!projectSlug || !/^\d+$/.test(caseId) || Number(caseId) <= 0 || !Number.isSafeInteger(Number(caseId))) {
    return res.status(400).json({ ok: false, errorCode: 'INVALID_INPUT_REQUIREMENTS_REFERENCE' });
  }
  if (!Array.isArray(inputRequirements)) {
    return res.status(400).json({ ok: false, errorCode: 'INVALID_INPUT_REQUIREMENTS_PAYLOAD' });
  }

  const base = upstreamBase();
  if (!base) return res.status(503).json({ ok: false, errorCode: 'SCENARIO_PREVIEW_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });

  try {
    const upstream = await fetcher(`${base}/api/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/input-requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputRequirements }),
    });
    const text = await upstream.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
    return res.status(upstream.status).json(body);
  } catch (error) {
    return res.status(502).json({ ok: false, errorCode: 'PROXY_ERROR', message: error instanceof Error ? error.message : String(error) });
  }
}

const router = Router();
router.post('/api/runtime-inputs/scenario-autofill', (req, res) => proxyScenarioAutofill(req, res));
router.get('/api/projects/:projectSlug/cases/:caseId/input-requirements', (req, res) => proxyCaseInputRequirements(req, res));
router.put('/api/projects/:projectSlug/cases/:caseId/input-requirements', (req, res) => proxySaveCaseInputRequirements(req, res));

export default router;
