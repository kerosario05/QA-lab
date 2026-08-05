import { Router } from 'express';
import type { Request, Response } from 'express';
import { getRunProviderConfig, requestDiscoveryBatch, requestScenarioPreviewRun } from '../runs-provider';
import { resolveTestRailProjectName, shouldMigrateAppConfig, normalizeAppSlug } from '../app-config-service';
import { TestRailClient } from '../testrail-client';

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
    const projectId = Number(body?.projectId ?? 0);

    // Resolver nombre del proyecto TestRail para migración automática de perfil
    let testRailProjectName = body?.testRailProjectName as string | undefined;
    if (!testRailProjectName && projectId > 0) {
      const trClient = new TestRailClient({
        url: process.env.TESTRAIL_URL || '',
        email: process.env.TESTRAIL_EMAIL || '',
        apiKey: process.env.TESTRAIL_API_KEY || '',
      });
      testRailProjectName = await resolveTestRailProjectName(projectId, null, trClient).catch(() => null) ?? undefined;
    }

    // Loggear si se migrará el perfil
    if (testRailProjectName) {
      const appSlug = normalizeAppSlug(testRailProjectName);
      if (shouldMigrateAppConfig(appSlug)) {
        console.log(`[runs] app-config migration: projectId=${projectId} name="${testRailProjectName}" slug="${appSlug}"`);
      }
    }

    let result;

    if (hasCaseIds) {
      console.log(`[runs] delegating to discovery-batch caseIds=${existingCaseIds.length}`);
      result = await requestDiscoveryBatch(existingCaseIds, undefined, testRailProjectName);
    } else {
      console.log(`[runs] delegating to scenario-preview stories=${stories.length}`);
      const suiteId = Number(body?.suiteId ?? 0);
      const sectionId = body?.sectionId ? Number(body.sectionId) : undefined;
      const sectionName = body?.sectionName as string | undefined;
      const sectionSlug = body?.sectionSlug as string | undefined;
      const launchId = body?.launchId as string | undefined;
      const testRunId = body?.testRunId ? Number(body.testRunId) : undefined;
      const publishedCases = Array.isArray(body?.publishedCases)
        ? (body.publishedCases as Array<{ scenarioId: string; caseId: number; title?: string }>)
        : undefined;
      const jiraKey = body?.jiraKey as string | undefined;
      const pubCaseIds = (publishedCases ?? []).map(pc => pc.caseId).join(",");
      console.log(`[runs] forwarding launch metadata launchId=${launchId ?? '—'} testRunId=${testRunId ?? '—'} publishedCases=${publishedCases?.length ?? 0} caseIds=${pubCaseIds} jiraKey=${jiraKey ?? '—'}`);
      result = await requestScenarioPreviewRun(stories as any, projectId, suiteId, sectionId, testRailProjectName, sectionName, sectionSlug, launchId, testRunId, publishedCases, jiraKey);
    }

    if (!result.ok) {
      const statusCode = result.errorCode === 'RUN_PROVIDER_NOT_CONFIGURED' ? 503
        : result.errorCode === 'RUN_PROVIDER_TIMEOUT' ? 504
        : result.errorCode === 'RUN_PROVIDER_ERROR' ? 502
        : 502;
      console.log(`[runs] error code=${result.errorCode}`);
      return sendJson(res, statusCode, { ok: false, errorCode: result.errorCode, error: result.error, message: result.message });
    }

    console.log(`[runs] provider response jobId=${result.jobId} status=${result.status} issueKey=${result.issueKey ?? '—'}`);
    return sendJson(res, 200, {
      ok: true,
      jobId: result.jobId,
      status: result.status,
      issueKey: result.issueKey,
      checklistUrl: result.checklistUrl,
      defectCount: result.defectCount,
    });
  } catch (err: any) {
    console.log(`[runs] error code=RUN_PROVIDER_ERROR message=${(err?.message ?? '').slice(0, 200)}`);
    return sendJson(res, 502, { ok: false, errorCode: 'RUN_PROVIDER_ERROR', error: 'Run provider request failed', message: err?.message ?? '' });
  }
});

// POST /api/runs/launch-execution — proxy to MCP runner
router.post('/launch-execution', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const body = req.body as Record<string, unknown>;
  const scenarios = Array.isArray(body.selectedScenarios) ? body.selectedScenarios : [];
  console.log(`[launch] proxy launch-execution request scenarios=${scenarios.length} sectionId=${body.sectionId ?? body.testrailSectionId ?? "(none)"}`);

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/launch-execution`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const bodyText = await upstreamRes.text();
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch { parsed = null; }

    if (!upstreamRes.ok) {
      console.log(`[launch] proxy launch-execution failed status=${upstreamRes.status} error=${parsed?.error ?? bodyText.slice(0, 200)}`);
      return sendJson(res, upstreamRes.status, parsed ?? { ok: false, error: 'Provider error', errorCode: `PROVIDER_${upstreamRes.status}` });
    }

    const caseIds = parsed?.publishedCases?.map((pc: any) => pc.caseId).join(",");
    console.log(`[launch] proxy launch-execution success launchId=${parsed?.launchId} testRunId=${parsed?.testRunId} publishedCases=${parsed?.publishedCases?.length} caseIds=${caseIds}`);
    return sendJson(res, 200, parsed);
  } catch (err: any) {
    console.log(`[launch] proxy launch-execution failed error=${(err?.message ?? '').slice(0, 200)}`);
    return sendJson(res, 502, { ok: false, error: 'Provider proxy error', errorCode: 'RUN_PROVIDER_ERROR', message: err?.message ?? '' });
  }
});

// POST /api/runs/:jobId/rerun — proxy to MCP runner
router.post('/:jobId/rerun', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }
  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(String(req.params.jobId))}/rerun`;
  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || { mode: 'all' }),
    });
    const bodyText = await upstreamRes.text();
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
    if (!upstreamRes.ok) {
      return sendJson(res, upstreamRes.status, parsed ?? { ok: false, error: 'Provider error' });
    }
    return sendJson(res, 200, parsed);
  } catch (err: any) {
    return sendJson(res, 502, { ok: false, error: 'rerun_proxy_error', message: err?.message ?? '' });
  }
});

// GET /api/runs/:jobId/logs — SSE proxy to MCP runner
router.get('/:jobId/logs', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(String(req.params.jobId))}/logs`;

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

// GET /api/runs/:jobId/evidence-docx — evidence download proxy
router.get('/:jobId/evidence-docx', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(String(req.params.jobId))}/evidence-docx`;

  try {
    const upstreamRes = await fetch(upstreamUrl);

    if (!upstreamRes.ok) {
      const bodyText = await upstreamRes.text().catch(() => '');
      let parsed: any;
      try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
      return sendJson(res, upstreamRes.status, parsed ?? { ok: false, error: 'Provider error', errorCode: `PROVIDER_${upstreamRes.status}` });
    }

    // Forward headers
    const contentType = upstreamRes.headers.get('Content-Type');
    const contentDisposition = upstreamRes.headers.get('Content-Disposition');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

    // Stream the file
    const upstreamBody = upstreamRes.body;
    if (!upstreamBody) {
      return sendJson(res, 502, { ok: false, error: 'No response body from provider', errorCode: 'RUN_PROVIDER_INVALID_RESPONSE' });
    }

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

// GET /api/runs/:jobId/evidence-docx/status — lightweight availability probe
router.get('/:jobId/evidence-docx/status', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const jobId = encodeURIComponent(String(req.params.jobId));
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const upstreamStatusUrl = `${baseUrl}/api/runs/${jobId}/evidence-docx/status`;
  const upstreamDocxUrl = `${baseUrl}/api/runs/${jobId}/evidence-docx`;

  try {
    const statusProbe = await fetch(upstreamStatusUrl, { headers: { Accept: 'application/json' } });
    const rawBody = await statusProbe.text();
    let parsed: any = null;
    try { parsed = rawBody ? JSON.parse(rawBody) : null; } catch { parsed = null; }

    const normalizedStatus = (parsed?.status as string | undefined)?.trim().toLowerCase();
    const isStructuredStatus = typeof normalizedStatus === 'string' && normalizedStatus.length > 0;
    const isStructuredJobNotFound = statusProbe.status === 404 && parsed?.reasonCode === 'job_not_found';

    if (isStructuredStatus || isStructuredJobNotFound) {
      const documentReady = parsed?.documentReady === true || normalizedStatus === 'ready';
      const status = normalizedStatus ?? (isStructuredJobNotFound ? 'not_found' : 'failed');
      return sendJson(res, statusProbe.status, {
        ok: statusProbe.status < 500,
        jobId: parsed?.jobId ?? req.params.jobId,
        status,
        documentReady,
        reasonCode: parsed?.reasonCode,
        jobStatus: parsed?.jobStatus,
        appSlug: parsed?.appSlug,
        sectionSlug: parsed?.sectionSlug,
      });
    }

    // Backward-compatible fallback for providers that still don't expose /status.
    const headProbe = await fetch(upstreamDocxUrl, { method: 'HEAD' });
    const statusCode = headProbe.status;
    if (statusCode === 200) {
      return sendJson(res, 200, {
        ok: true,
        jobId: req.params.jobId,
        status: 'ready',
        documentReady: true,
        reasonCode: 'ready',
      });
    }
    if (statusCode === 404) {
      return sendJson(res, 200, {
        ok: true,
        jobId: req.params.jobId,
        status: 'preparing',
        documentReady: false,
        reasonCode: 'document_preparing',
      });
    }
    if (statusCode >= 500) {
      return sendJson(res, 200, {
        ok: true,
        jobId: req.params.jobId,
        status: 'failed',
        documentReady: false,
        reasonCode: 'provider_status_error',
      });
    }
    return sendJson(res, 200, {
      ok: true,
      jobId: req.params.jobId,
      status: 'unavailable',
      documentReady: false,
      reasonCode: 'document_status_unavailable',
    });
  } catch (err: any) {
    return sendJson(res, 502, {
      ok: false,
      jobId: req.params.jobId,
      status: 'failed',
      documentReady: false,
      reasonCode: 'provider_proxy_error',
      error: 'Provider proxy error',
      errorCode: 'RUN_PROVIDER_ERROR',
      message: err?.message ?? '',
    });
  }
});

// GET /api/runs/:jobId — status proxy
router.get('/:jobId', async (req: Request, res: Response) => {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return sendJson(res, 503, { ok: false, error: 'Run provider not configured', errorCode: 'RUN_PROVIDER_NOT_CONFIGURED' });
  }

  const upstreamUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(String(req.params.jobId))}`;

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
