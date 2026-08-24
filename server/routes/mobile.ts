import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  startEmulator, getEmulatorStatus, stopEmulator, getAppiumStatus,
  requestMobileScenarioPreview, requestMobileScenarioGeneration, getMobileScenarioGenerationStatus,
  requestMobileLaunchExecution, requestMobileRunExecute,
} from '../mobile-provider';
import type { MobileProviderResponse } from '../mobile-provider';

const router = Router();

console.log('[mobile] route registered');

function sendJson(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

function statusCodeFor(result: MobileProviderResponse, timeoutStatus = 504): number {
  if (result.status) return result.status;
  if (result.errorCode?.endsWith('NOT_CONFIGURED')) return 503;
  if (result.errorCode === 'TIMEOUT') return timeoutStatus;
  return 502;
}

function forward(res: Response, result: MobileProviderResponse, okStatus = 200): void {
  if (!result.ok) {
    sendJson(res, statusCodeFor(result), {
      ok: false,
      errorCode: result.errorCode,
      error: result.error,
      message: result.message,
      ...(result.body ?? {}),
    });
    return;
  }
  sendJson(res, result.status ?? okStatus, { ok: true, ...(result.body ?? {}) });
}

// ── Emulator ─────────────────────────────────────────────────────────────

router.post('/emulator/start', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const payload = {
    avdName: typeof body?.avdName === 'string' ? body.avdName : undefined,
    headless: typeof body?.headless === 'boolean' ? body.headless : undefined,
  };
  console.log(`[mobile] emulator/start request avdName=${payload.avdName ?? '—'} headless=${payload.headless ?? '—'}`);
  const result = await startEmulator(payload);
  forward(res, result, 202);
});

router.get('/emulator/status', async (_req: Request, res: Response) => {
  const result = await getEmulatorStatus();
  forward(res, result);
});

router.post('/emulator/stop', async (_req: Request, res: Response) => {
  const result = await stopEmulator();
  forward(res, result);
});

// ── Appium ───────────────────────────────────────────────────────────────

router.get('/appium/status', async (_req: Request, res: Response) => {
  const result = await getAppiumStatus();
  forward(res, result);
});

// ── Scenarios ────────────────────────────────────────────────────────────

router.post('/scenarios/preview', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const projectKey = String(body?.projectKey ?? '');

  if (!projectKey) {
    sendJson(res, 400, { ok: false, error: 'projectKey is required', errorCode: 'MISSING_PROJECT_KEY' });
    return;
  }

  const sprintId = body?.sprintId ? Number(body.sprintId) : undefined;
  const activeSprint = body?.activeSprint === true || body?.activeSprint === 'true';

  if (!sprintId && !activeSprint) {
    sendJson(res, 400, { ok: false, error: 'sprintId or activeSprint is required', errorCode: 'MISSING_SPRINT' });
    return;
  }

  const payload = {
    projectKey,
    ...(sprintId ? { sprintId } : { activeSprint: true }),
    status: String(body?.status ?? '') || undefined,
    maxResults: body?.maxResults ? Number(body.maxResults) : undefined,
    appSlug: String(body?.appSlug ?? '') || undefined,
  };

  console.log(`[mobile] scenarios/preview request projectKey=${projectKey} sprintId=${sprintId ?? '—'} activeSprint=${activeSprint} appSlug=${payload.appSlug ?? '—'}`);
  const result = await requestMobileScenarioPreview(payload);
  forward(res, result);
});

router.post('/scenarios/generation', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const projectKey = String(body?.projectKey ?? '');
  if (!projectKey) {
    sendJson(res, 400, { ok: false, error: 'projectKey is required', errorCode: 'MISSING_PROJECT_KEY' });
    return;
  }

  const sprintId = body?.sprintId ? Number(body.sprintId) : undefined;
  const activeSprint = body?.activeSprint === true || body?.activeSprint === 'true';
  if (!sprintId && !activeSprint) {
    sendJson(res, 400, { ok: false, error: 'sprintId or activeSprint is required', errorCode: 'MISSING_SPRINT' });
    return;
  }

  const payload = {
    projectKey,
    ...(sprintId ? { sprintId } : { activeSprint: true }),
    status: String(body?.status ?? '') || undefined,
    maxResults: body?.maxResults ? Number(body.maxResults) : undefined,
    appSlug: String(body?.appSlug ?? '') || undefined,
    selectedIssueKeys: Array.isArray(body?.selectedIssueKeys)
      ? body.selectedIssueKeys.map((entry) => String(entry ?? '').trim()).filter(Boolean)
      : undefined,
    sourceRevision: String(body?.sourceRevision ?? '') || undefined,
    launchDraftId: String(body?.launchDraftId ?? '') || undefined,
  };

  console.log(
    `[mobile] scenarios/generation request requestId=${String(req.headers['x-request-id'] ?? payload.launchDraftId ?? '—')} projectKey=${projectKey} sprintId=${sprintId ?? '—'} activeSprint=${activeSprint} appSlug=${payload.appSlug ?? '—'} issueKeys=${payload.selectedIssueKeys?.join(',') ?? '-'}`,
  );
  const result = await requestMobileScenarioGeneration(payload);
  forward(res, result, 202);
});

router.get('/scenarios/generation/:generationJobId', async (req: Request, res: Response) => {
  const generationJobId = String(req.params.generationJobId ?? '').trim();
  if (!generationJobId) {
    sendJson(res, 400, { ok: false, error: 'generationJobId is required', errorCode: 'MISSING_GENERATION_JOB_ID' });
    return;
  }
  const result = await getMobileScenarioGenerationStatus(generationJobId);
  forward(res, result);
});

// ── Runs: publish + execute ─────────────────────────────────────────────

router.post('/runs/launch-execution', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const scenarios: unknown[] = Array.isArray(body?.scenarios) ? body.scenarios : [];

  if (scenarios.length === 0) {
    sendJson(res, 400, { ok: false, error: 'scenarios is required and cannot be empty', errorCode: 'MISSING_SCENARIOS' });
    return;
  }

  console.log(`[mobile] runs/launch-execution request appSlug=${body?.appSlug ?? '—'} projectId=${body?.projectId ?? '—'} scenarios=${scenarios.length}`);
  const result = await requestMobileLaunchExecution(body);
  forward(res, result);
});

router.post('/runs/execute', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const scenarios: unknown[] = Array.isArray(body?.scenarios) ? body.scenarios : [];

  if (!body?.launchId || !body?.testRunId) {
    sendJson(res, 400, { ok: false, error: 'launchId and testRunId are required', errorCode: 'MISSING_LAUNCH_CONTEXT' });
    return;
  }

  if (scenarios.length === 0) {
    sendJson(res, 400, { ok: false, error: 'scenarios is required and cannot be empty', errorCode: 'MISSING_SCENARIOS' });
    return;
  }

  console.log(`[mobile] runs/execute request launchId=${body?.launchId} testRunId=${body?.testRunId} scenarios=${scenarios.length}`);
  const result = await requestMobileRunExecute(body);
  forward(res, result, 202);
});

export default router;
