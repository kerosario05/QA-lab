import { Router } from 'express';
import type { Request, Response } from 'express';
import { requestScenarioPreview, getScenarioPreviewConfig } from '../scenario-preview-provider';
import type { ScenarioPreviewPayload } from '../scenario-preview-provider';

const router = Router();

function sendJson(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

console.log('[scenario-preview] route registered');

// POST /api/scenarios/preview
router.post('/preview', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const projectKey = String(body?.projectKey ?? '');
  const sprintId = body?.sprintId ? Number(body.sprintId) : undefined;
  const activeSprint = body?.activeSprint === true || body?.activeSprint === 'true';
  const status = String(body?.status ?? '');

  console.log(`[scenario-preview] request projectKey=${projectKey || '—'} sprintId=${sprintId ?? '—'} activeSprint=${activeSprint} status=${status || '—'}`);
  console.log(`[scenario-preview-proxy-in] bodyAppSlug=${body?.appSlug ?? 'undefined'}`);

  if (!projectKey) {
    sendJson(res, 400, { ok: false, error: 'projectKey is required', errorCode: 'MISSING_PROJECT_KEY' });
    return;
  }

  if (!sprintId && !activeSprint) {
    sendJson(res, 400, { ok: false, error: 'sprintId or activeSprint is required', errorCode: 'MISSING_SPRINT' });
    return;
  }

  const config = getScenarioPreviewConfig();
  if (!config.baseUrl) {
    console.log(`[scenario-preview] error status=503 reason=scenario_preview_not_configured`);
    sendJson(res, 503, { ok: false, error: 'Scenario preview not configured', errorCode: 'PREVIEW_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });
    return;
  }

  const payload: ScenarioPreviewPayload = {
    projectKey,
    ...(sprintId ? { sprintId } : { activeSprint: true }),
    ...(status ? { status } : {}),
    sourceMode: String(body?.sourceMode ?? body?.mode ?? ''),
    jiraIssueKey: String(body?.jiraIssueKey ?? body?.jiraKey ?? '') || undefined,
    jiraSummary: String(body?.jiraSummary ?? '') || undefined,
    jiraDescription: String(body?.jiraDescription ?? '') || undefined,
    testrailProjectId: body?.testrailProjectId ? Number(body.testrailProjectId) : undefined,
    testrailSuiteId: body?.testrailSuiteId ? Number(body.testrailSuiteId) : undefined,
    testrailSectionId: body?.testrailSectionId ? Number(body.testrailSectionId) : undefined,
    testrailSectionName: String(body?.testrailSectionName ?? '') || undefined,
    appSlug: String(body?.appSlug ?? '') || undefined,
    effectiveTargetAppSlug: String(body?.effectiveTargetAppSlug ?? '') || undefined,
    maxResults: body?.maxResults ? Number(body.maxResults) : 50,
  };

  console.log(`[scenario-preview-proxy-out] payloadAppSlug=${payload.appSlug ?? 'undefined'}`);
  const providerResponse = await requestScenarioPreview(payload);

  if (!providerResponse.ok) {
    const statusCode = providerResponse.errorCode === 'PREVIEW_NOT_CONFIGURED' ? 503
      : providerResponse.errorCode === 'PREVIEW_TIMEOUT' ? 504
      : providerResponse.errorCode === 'PREVIEW_PROVIDER_ERROR' ? 502
      : 502;
    sendJson(res, statusCode, {
      ok: false,
      errorCode: providerResponse.errorCode,
      error: providerResponse.error,
      message: providerResponse.message,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    stories: providerResponse.stories ?? [],
    totalScenarios: providerResponse.totalScenarios ?? 0,
    rejected: providerResponse.rejected,
    rawShape: providerResponse.rawShape,
  });
});

export default router;
