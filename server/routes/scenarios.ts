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

  console.log(`[server:scenario-preview-body] bodyKeys=${Object.keys(body).join(",")} selectedIssueKeys=${body?.selectedIssueKeys ? (Array.isArray(body.selectedIssueKeys) ? (body.selectedIssueKeys as string[]).join(",") : String(body.selectedIssueKeys)) : "none"} privateArtifacts=${body?.privateDiscoveryArtifacts ? "present" : "absent"} sourceMode=${body?.sourceMode ?? "none"}`);

  const projectKey = String(body?.projectKey ?? '');
  const sprintId = body?.sprintId ? Number(body.sprintId) : undefined;
  const activeSprint = body?.activeSprint === true || body?.activeSprint === 'true';
  const status = String(body?.status ?? '');
  const privateDiscoveryArtifacts = body?.privateDiscoveryArtifacts as Record<string, unknown> | undefined;
  const normalizedSelectedIssueKeys = Array.isArray(body?.selectedIssueKeys)
    ? (body.selectedIssueKeys as unknown[]).filter((k): k is string => typeof k === 'string' && k.length > 0)
    : [];
  const appSlug = String(body?.appSlug ?? '') || undefined;

  console.log(`[scenario-preview] request projectKey=${projectKey || '—'} sprintId=${sprintId ?? '—'} activeSprint=${activeSprint} status=${status || '—'} selectedIssueKeys=${normalizedSelectedIssueKeys.join(",") || "none"} appSlug=${appSlug ?? "none"} privateArtifacts=${Boolean(privateDiscoveryArtifacts)}`);

  if (!projectKey) {
    sendJson(res, 400, { ok: false, error: 'projectKey is required', errorCode: 'MISSING_PROJECT_KEY' });
    return;
  }

  if (!sprintId && !activeSprint) {
    sendJson(res, 400, { ok: false, error: 'sprintId or activeSprint is required', errorCode: 'MISSING_SPRINT' });
    return;
  }

  const source = String(body?.source ?? 'jira');
  const testrailProjectId = body?.testrailProjectId ? Number(body.testrailProjectId) : undefined;
  const testrailSuiteId = body?.testrailSuiteId ? Number(body.testrailSuiteId) : undefined;
  const testrailSectionId = body?.testrailSectionId ? Number(body.testrailSectionId) : undefined;

  if (normalizedSelectedIssueKeys.length === 0 && !testrailProjectId && !sprintId && !activeSprint) {
    console.log(`[server:scenario-preview-skip] reason=insufficient_filter projectKey=${projectKey} selectedIssueKeys=empty testrailProjectId=${testrailProjectId} sprintId=${sprintId} activeSprint=${activeSprint}`);
    sendJson(res, 400, { ok: false, reasonCode: 'insufficient_filter', message: 'Se requiere seleccionar HUs, configurar TestRail, o un sprint válido.' });
    return;
  }

  const previewMode = normalizedSelectedIssueKeys.length > 0 ? 'selected_issues' : 'sprint_filter';
  console.log("[server:scenario-preview-mode]", {
    mode: previewMode,
    projectKey,
    sprintId,
    status,
    source,
    testrailProjectId,
    testrailSuiteId,
    testrailSectionId,
  });

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
    source,
    sourceMode: String(body?.sourceMode ?? body?.mode ?? ''),
    jiraIssueKey: String(body?.jiraIssueKey ?? body?.jiraKey ?? '') || undefined,
    jiraSummary: String(body?.jiraSummary ?? '') || undefined,
    jiraDescription: String(body?.jiraDescription ?? '') || undefined,
    testrailProjectId,
    testrailSuiteId,
    testrailSectionId,
    testrailSectionName: String(body?.testrailSectionName ?? '') || undefined,
    appSlug,
    effectiveTargetAppSlug: String(body?.effectiveTargetAppSlug ?? '') || undefined,
    maxResults: body?.maxResults ? Number(body.maxResults) : 50,
    ...(normalizedSelectedIssueKeys.length > 0 ? { selectedIssueKeys: normalizedSelectedIssueKeys } : {}),
    ...(privateDiscoveryArtifacts ? { privateDiscoveryArtifacts } : {}),
  };

  console.log(`[qa-lab:scenario-preview-provider-payload] bodyKeys=${Object.keys(payload).join(",")} selectedIssueKeys=${normalizedSelectedIssueKeys.join(",") || "none"} appSlug=${appSlug ?? "none"} privateArtifacts=${Boolean(privateDiscoveryArtifacts)}`);

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
    blockedScenarios: (providerResponse as any).blockedScenarios,
    warnings: (providerResponse as any).warnings,
    rawShape: providerResponse.rawShape,
  });
});

router.post('/private-discovery', async (req: Request, res: Response) => {
  try {
    const config = getScenarioPreviewConfig();
    if (!config.baseUrl) {
      sendJson(res, 503, { ok: false, error: 'Scenario preview not configured', errorCode: 'PREVIEW_NOT_CONFIGURED', message: 'SCENARIO_PREVIEW_BASE_URL is not set' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const url = `${config.baseUrl.replace(/\/+$/, '')}/api/discovery/private`;
    console.log(`[qa-lab:private-discovery-request] bodyKeys=${Object.keys(body).join(",")} appSlug=${body?.appSlug ?? "none"} issueKey=${body?.issueKey ?? "none"} intent=${body?.intent ?? "none"}`);

    // Force headless mode for QA Lab internal discovery calls
    const upstreamBody = {
      ...body,
      headless: true,
      headed: false,
      source: 'qa_lab_internal',
    };
    console.log(`[qa-lab:private-discovery-upstream] headless=true source=qa_lab_internal`);

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    });
    const rawBody = await upstream.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = rawBody.trim() ? JSON.parse(rawBody) : { ok: false, error: 'empty_private_discovery_response' };
    } catch {
      parsed = { ok: false, error: 'invalid_private_discovery_response', message: rawBody.slice(0, 200) };
    }

    sendJson(res, upstream.status, parsed);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: 'private_discovery_proxy_error', message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
