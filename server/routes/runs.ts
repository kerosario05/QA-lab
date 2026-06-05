import { Router } from 'express';
import type { Request, Response } from 'express';
import { getRunProviderConfig, requestDiscoveryBatch, requestScenarioPreviewRun } from '../runs-provider';

const router = Router();

function sendJson(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

console.log('[runs] route registered');

// POST /api/runs/from-scenarios
router.post('/from-scenarios', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const stories: Array<Record<string, unknown>> = Array.isArray(body?.stories) ? body.stories : [];
  const existingCaseIds: number[] = Array.isArray(body?.existingCaseIds) ? body.existingCaseIds.filter((id: unknown) => typeof id === 'number') : [];

  const hasStoriesWithScenarios = stories.some(s => Array.isArray(s.scenarios) && (s.scenarios as unknown[]).length > 0);
  const hasCaseIds = existingCaseIds.length > 0;

  console.log(`[runs] from-scenarios request stories=${stories.length} existingCaseIds=${existingCaseIds.length}`);

  if (!hasStoriesWithScenarios && !hasCaseIds) {
    return sendJson(res, 400, { ok: false, error: 'No hay escenarios ni casos seleccionados', errorCode: 'INVALID_RUN_REQUEST' });
  }

  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    console.log(`[runs] error code=RUN_PROVIDER_NOT_CONFIGURED`);
    return sendJson(res, 503, {
      ok: false,
      error: 'Run provider not configured',
      errorCode: 'RUN_PROVIDER_NOT_CONFIGURED',
      message: 'RUN_PROVIDER_BASE_URL or SCENARIO_PREVIEW_BASE_URL is not set',
    });
  }

  try {
    let result;

    if (hasCaseIds) {
      console.log(`[runs] delegating to discovery-batch caseIds=${existingCaseIds.length}`);
      const projectId = Number(body?.projectId ?? 0);
      result = await requestDiscoveryBatch(existingCaseIds);
    } else {
      console.log(`[runs] delegating to scenario-preview stories=${stories.length}`);
      const projectId = Number(body?.projectId ?? 0);
      const suiteId = Number(body?.suiteId ?? 0);
      const sectionId = body?.sectionId ? Number(body.sectionId) : undefined;
      result = await requestScenarioPreviewRun(stories as any, projectId, suiteId, sectionId);
    }

    if (!result.ok) {
      const statusCode = result.errorCode === 'RUN_PROVIDER_NOT_CONFIGURED' ? 503
        : result.errorCode === 'RUN_PROVIDER_TIMEOUT' ? 504
        : result.errorCode === 'RUN_PROVIDER_ERROR' ? 502
        : 502;
      console.log(`[runs] error code=${result.errorCode}`);
      return sendJson(res, statusCode, { ok: false, errorCode: result.errorCode, error: result.error, message: result.message });
    }

    console.log(`[runs] provider response jobId=${result.jobId} status=${result.status}`);
    return sendJson(res, 200, { ok: true, jobId: result.jobId, status: result.status });
  } catch (err: any) {
    console.log(`[runs] error code=RUN_PROVIDER_ERROR message=${(err?.message ?? '').slice(0, 200)}`);
    return sendJson(res, 502, { ok: false, errorCode: 'RUN_PROVIDER_ERROR', error: 'Run provider request failed', message: err?.message ?? '' });
  }
});

// GET /api/runs/:jobId/logs — SSE proxy to MCP runner
router.get('/:jobId/logs', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(req.params.jobId)}/logs`;

  try {
    const upstreamRes = await fetch(upstreamUrl);
    if (!upstreamRes.ok) {
      const bodyText = await upstreamRes.text().catch(() => '');
      let parsed: any;
      try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
      return sendJson(res, upstreamRes.status, parsed ?? { ok: false, error: 'Provider error', errorCode: `PROVIDER_${upstreamRes.status}` });
    }

    const upstreamBody = upstreamRes.body;
    if (!upstreamBody) {
      return sendJson(res, 502, { ok: false, error: 'No response body from provider', errorCode: 'RUN_PROVIDER_INVALID_RESPONSE' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = upstreamBody.getReader();
    let aborted = false;
    req.on('close', () => { aborted = true; });

    while (true) {
      const { done, value } = await reader.read();
      if (done || aborted) break;
      res.write(value);
    }

    if (!aborted) res.end();
  } catch (err: any) {
    if (!res.headersSent) {
      return sendJson(res, 502, { ok: false, error: 'Provider proxy error', errorCode: 'RUN_PROVIDER_ERROR', message: err?.message ?? '' });
    }
    if (!res.writableEnded) res.end();
  }
});

// GET /api/runs/:jobId — status proxy
router.get('/:jobId', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(req.params.jobId)}`;

  try {
    const upstreamRes = await fetch(upstreamUrl);
    const bodyText = await upstreamRes.text();
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
    return sendJson(res, upstreamRes.status, parsed ?? { ok: false, error: 'Invalid JSON from provider' });
  } catch (err: any) {
    return sendJson(res, 502, { ok: false, error: 'Provider proxy error', errorCode: 'RUN_PROVIDER_ERROR', message: err?.message ?? '' });
  }
});

export default router;
