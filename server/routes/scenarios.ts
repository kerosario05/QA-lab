import { Router } from 'express';
import type { Request, Response } from 'express';
import { requestScenarioPreview, getScenarioPreviewConfig, requestRouteDiscoveryRun } from '../scenario-preview-provider';
import type { ScenarioPreviewPayload, RouteDiscoveryPayload } from '../scenario-preview-provider';

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

  console.log(
    `[scenario-preview] request projectKey=${projectKey || '—'} sprintId=${sprintId ?? '—'} activeSprint=${activeSprint} ` +
    `status=${status || '—'} selectedIssueKeys=${Array.isArray(body?.selectedIssueKeys) ? JSON.stringify(body.selectedIssueKeys) : 'undefined'}`
  );

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
    selectedIssueKeys: Array.isArray(body?.selectedIssueKeys) ? body.selectedIssueKeys.map(k => String(k)) : undefined, // NEW: Forward selected issues
  };

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

  // ── Diagnostic: log raw engine response shape for onboarding detection ──
  const engineRaw = providerResponse.rawEngineResponse as Record<string, unknown> | undefined;
  const onboarding = engineRaw?.onboardingRequired as Record<string, unknown> | undefined;
  const blockedScenariosRaw = engineRaw?.blockedScenarios as Array<Record<string, unknown>> | undefined;
  const rejectedRaw = providerResponse.rejected as Array<Record<string, unknown>> | undefined;
  const guidedRd = engineRaw?.guidedRouteDiscovery as Record<string, unknown> | undefined;

  const onboardingCheck = {
    hasRaw: !!engineRaw,
    rawKeys: engineRaw ? Object.keys(engineRaw).join(',') : 'none',
    hasOnboarding: !!onboarding,
    required: onboarding?.required === true,
    hasGuided: !!guidedRd,
    blockedCount: Array.isArray(blockedScenariosRaw) ? blockedScenariosRaw.length : 0,
    rejectedCount: Array.isArray(rejectedRaw) ? rejectedRaw.length : 0,
  };

  console.log(`[scenario-preview] onboardingCheck hasRaw=${onboardingCheck.hasRaw} rawKeys=${onboardingCheck.rawKeys}`);
  console.log(`[scenario-preview] onboardingCheck hasOnboarding=${onboardingCheck.hasOnboarding} required=${onboardingCheck.required} hasGuided=${onboardingCheck.hasGuided} blocked=${onboardingCheck.blockedCount} rejected=${onboardingCheck.rejectedCount}`);

  // ── Auto-orchestrate route discovery if preview detected onboardingRequired ──
  let routeDiscoveryRun: Record<string, unknown> | undefined;
  let routeDiscoverySkipReason: string | undefined;

  if (onboardingCheck.required) {
    // Resolve issueKey with fallback chain
    const b0 = Array.isArray(blockedScenariosRaw) ? blockedScenariosRaw[0] as Record<string, unknown> | undefined : undefined;
    const r0 = Array.isArray(rejectedRaw) ? rejectedRaw[0] as Record<string, unknown> | undefined : undefined;
    const issueKeys = Array.isArray(onboarding?.issueKeys) ? (onboarding?.issueKeys as string[]) : [];

    const issueKey = String(b0?.sourceIssueKey ?? b0?.issueKey ?? r0?.sourceIssueKey ?? r0?.issueKey ?? issueKeys[0] ?? '');
    const reasonCode = String(b0?.reasonCode ?? b0?.reason ?? r0?.reasonCode ?? r0?.reason ?? onboarding?.reasonCode ?? '');
    const huIntent = String(guidedRd?.huIntent ?? b0?.huIntent ?? r0?.huIntent ?? onboarding?.huIntent ?? '');
    const appSlug = String(engineRaw?.appSlug ?? engineRaw?.targetAppSlug ?? payload.appSlug ?? '');

    console.log(`[scenario-preview] onboardingCheck firstBlocked issue=${issueKey} reason=${reasonCode} huIntent=${huIntent}`);

    if (!issueKey) { routeDiscoverySkipReason = 'missing_issue_key'; }
    else if (!reasonCode) { routeDiscoverySkipReason = 'missing_reason_code'; }
    else if (!huIntent) { routeDiscoverySkipReason = 'missing_hu_intent'; }
    else if (!appSlug) { routeDiscoverySkipReason = 'missing_app_slug'; }

    if (routeDiscoverySkipReason) {
      console.log(`[scenario-preview] routeDiscoveryRun skip reason=${routeDiscoverySkipReason}`);
    } else {
      console.log(
        `[scenario-preview] onboarding detected routeDiscoveryRun=auto issue=${issueKey} appSlug=${appSlug} reason=${reasonCode}`
      );

      const discoveryResult = await requestRouteDiscoveryRun({
        appSlug,
        issueKey,
        huIntent,
        reasonCode,
        dryRun: false,
        mode: "candidate_only",
      });

      if (discoveryResult.ok && discoveryResult.body) {
        routeDiscoveryRun = discoveryResult.body as Record<string, unknown>;
        console.log(`[scenario-preview] routeDiscoveryRun attached status=${routeDiscoveryRun.status}`);
      } else {
        const errCode = discoveryResult.errorCode ?? 'unknown';
        routeDiscoveryRun = {
          ok: false,
          status: 'engine_unavailable',
          message: `Auto route discovery failed: ${errCode}`,
          dryRun: false,
        };
        console.log(`[scenario-route-discovery] engine unavailable reason=${errCode}`);
      }

      if (providerResponse.totalScenarios && providerResponse.totalScenarios > 0) {
        console.log(`[scenario-preview] routeDiscoveryRun attached status=${routeDiscoveryRun?.status ?? "?"} preservedScenarios=${providerResponse.totalScenarios} persisted=${(routeDiscoveryRun as any)?.persisted === true}`);
        if ((routeDiscoveryRun as any)?.persisted !== true) {
          console.log(`[scenario-preview] candidate route unpersisted, preserving routePending scenarios count=${providerResponse.totalScenarios}`);
        }
      } else {
        console.log(`[scenario-preview] scenarios remain empty reason=route_not_persisted_or_no_candidate`);
      }
    }
  } else {
    routeDiscoverySkipReason = 'onboarding_not_required';
    console.log(`[scenario-preview] routeDiscoveryRun skip reason=${routeDiscoverySkipReason}`);
  }

  const response: Record<string, unknown> = {
    ok: true,
    stories: providerResponse.stories ?? [],
    totalScenarios: providerResponse.totalScenarios ?? 0,
    rejected: providerResponse.rejected,
    rawShape: providerResponse.rawShape,
  };

  // Attach onboarding/discovery metadata when present
  if (onboarding) response.onboardingRequired = onboarding;
  if (blockedScenariosRaw) response.blockedScenarios = blockedScenariosRaw;
  if (engineRaw?.guidedRouteDiscovery) response.guidedRouteDiscovery = engineRaw.guidedRouteDiscovery;
  if (routeDiscoveryRun) response.routeDiscoveryRun = routeDiscoveryRun;
  if (response.totalScenarios === 0 && onboarding) {
    if (!response.warnings) response.warnings = [];
    (response.warnings as string[]).push('No scenarios generated: route profile incompatible. Discovery result attached in routeDiscoveryRun.');
  }

  sendJson(res, 200, response);
});

// POST /api/scenarios/route-discovery/run — Proxy to Automation Engine
router.post('/route-discovery/run', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  console.log(
    `[scenario-route-discovery] request issue=${body.issueKey ?? '—'} appSlug=${body.appSlug ?? '—'} ` +
    `huIntent=${body.huIntent ?? '—'} dryRun=${body.dryRun !== false}`
  );

  const config = getScenarioPreviewConfig();
  if (!config.baseUrl) {
    console.log(`[scenario-route-discovery] engine unavailable reason=not_configured`);
    sendJson(res, 503, {
      ok: false,
      status: 'engine_unavailable',
      discoveryType: 'intent_route_discovery',
      recommendedMode: 'guided_route_discovery',
      nextAction: 'configure_engine_base_url',
      dryRun: body.dryRun !== false,
      message: 'Automation Engine route discovery endpoint is unavailable: SCENARIO_PREVIEW_BASE_URL not set.',
    });
    return;
  }

  const payload: RouteDiscoveryPayload = {
    appSlug: String(body.appSlug ?? ''),
    issueKey: String(body.issueKey ?? ''),
    huIntent: String(body.huIntent ?? ''),
    reasonCode: String(body.reasonCode ?? ''),
    currentRouteProfileName: String(body.currentRouteProfileName ?? '') || undefined,
    jiraSummary: String(body.jiraSummary ?? '') || undefined,
    jiraDescription: String(body.jiraDescription ?? '') || undefined,
    acceptanceCriteria: String(body.acceptanceCriteria ?? '') || undefined,
    dryRun: body.dryRun !== false,
    mode: String(body.mode ?? '') || undefined,
  };

  if (!payload.appSlug || !payload.issueKey || !payload.huIntent || !payload.reasonCode) {
    sendJson(res, 400, { ok: false, status: 'insufficient_payload', message: 'appSlug, issueKey, huIntent, reasonCode are required' });
    return;
  }

  const engineResponse = await requestRouteDiscoveryRun(payload);

  if (!engineResponse.ok) {
    if (engineResponse.errorCode === 'ENGINE_TIMEOUT' || engineResponse.errorCode === 'ENGINE_UNAVAILABLE' || engineResponse.errorCode === 'ENGINE_NOT_CONFIGURED') {
      const statusCode = engineResponse.errorCode === 'ENGINE_TIMEOUT' ? 504 : 503;
      sendJson(res, statusCode, {
        ok: false,
        status: 'engine_unavailable',
        discoveryType: 'intent_route_discovery',
        recommendedMode: 'guided_route_discovery',
        nextAction: 'check_engine_connectivity',
        dryRun: payload.dryRun,
        message: 'Automation Engine route discovery endpoint is unavailable.',
      });
      return;
    }

    // Forward engine error status if available
    if (engineResponse.status && engineResponse.body) {
      sendJson(res, engineResponse.status, engineResponse.body);
      return;
    }

    sendJson(res, 502, { ok: false, status: 'engine_unavailable', message: 'Engine returned an error.' });
    return;
  }

  // Forward engine response as-is (preserves status, status HTTP, candidateRoute, observations, etc.)
  const statusCode = engineResponse.status ?? 200;
  sendJson(res, statusCode, engineResponse.body ?? { ok: false, status: 'engine_unavailable' });
});

export default router;
