import { normalizeScenarioPreviewResponse } from '../src/services/scenarios/normalize';

export interface ScenarioPreviewProviderConfig {
  baseUrl: string;
  endpoint: string;
  timeoutMs: number;
}

export interface ScenarioPreviewPayload {
  projectKey: string;
  status?: string;
  maxResults?: number;
  sourceMode?: string;
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  sprintId?: number;
  activeSprint?: boolean;
  testrailProjectId?: number;
  testrailSuiteId?: number;
  testrailSectionId?: number;
  testrailSectionName?: string;
  appSlug?: string;
  effectiveTargetAppSlug?: string;
}

export interface ProviderResponse {
  ok: boolean;
  stories?: any[];
  totalScenarios?: number;
  rejected?: any[];
  errorCode?: string;
  error?: string;
  message?: string;
  rawShape?: string;
}

export function getScenarioPreviewConfig(): ScenarioPreviewProviderConfig {
  const baseUrl = process.env.SCENARIO_PREVIEW_BASE_URL ?? '';
  const endpoint = process.env.SCENARIO_PREVIEW_ENDPOINT ?? '/api/scenarios/preview';
  const timeoutMs = parseInt(process.env.SCENARIO_PREVIEW_TIMEOUT_MS ?? '180000', 10);
  return { baseUrl, endpoint, timeoutMs };
}

export async function requestScenarioPreview(payload: ScenarioPreviewPayload): Promise<ProviderResponse> {
  const config = getScenarioPreviewConfig();

  if (!config.baseUrl) {
    return { ok: false, errorCode: 'PREVIEW_NOT_CONFIGURED', error: 'SCENARIO_PREVIEW_BASE_URL is not set' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${config.endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  console.log(`[scenario-preview] provider request projectKey=${payload.projectKey} sprintId=${payload.sprintId ?? '—'} activeSprint=${!!payload.activeSprint} endpoint=${config.endpoint}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawBody = await res.text();

    if (!rawBody.trim()) {
      console.log(`[scenario-preview] provider error code=PREVIEW_EMPTY_RESPONSE status=${res.status}`);
      return { ok: false, errorCode: 'PREVIEW_EMPTY_RESPONSE', error: 'Empty response from provider', message: `HTTP ${res.status}` };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      console.log(`[scenario-preview] provider error code=PREVIEW_INVALID_RESPONSE status=${res.status} body_preview=${rawBody.slice(0, 100)}`);
      return { ok: false, errorCode: 'PREVIEW_INVALID_RESPONSE', error: 'Invalid JSON from provider', message: `HTTP ${res.status}: not JSON` };
    }

    if (!res.ok) {
      const errorCode = parsed?.errorCode ?? parsed?.error ?? `PROVIDER_${res.status}`;
      const errorMsg = parsed?.message ?? parsed?.error ?? `Provider returned ${res.status}`;
      console.log(`[scenario-preview] provider error code=${errorCode} status=${res.status}`);
      return { ok: false, errorCode, error: errorMsg, message: `HTTP ${res.status}` };
    }

    const rawScenariosCount = Array.isArray(parsed.scenarios) ? parsed.scenarios.length : 0;
    const rawRejectedCount = Array.isArray(parsed.rejected) ? parsed.rejected.length : 0;
    const firstKeys = rawScenariosCount > 0
      ? (parsed.scenarios as any[]).slice(0, 3).map((s: any) => s.sourceIssueKey ?? s.jiraKey ?? s.title ?? '?').join(',')
      : 'none';

    console.log(`[scenario-preview] provider rawShape=${Object.keys(parsed).join(',')}`);
    console.log(`[scenario-preview] provider counts scenarios=${rawScenariosCount} rejected=${rawRejectedCount}`);
    if (rawScenariosCount > 0) {
      console.log(`[scenario-preview] provider firstScenarioKeys=${firstKeys}`);
    }
    if (rawRejectedCount > 0) {
      const firstReasons = (parsed.rejected as any[]).slice(0, 3).map((r: any) => r.reason ?? '?').join(' | ');
      console.log(`[scenario-preview] provider firstRejectedReasons=${firstReasons}`);
    }

    const normalized = normalizeScenarioPreviewResponse(parsed);
    console.log(`[scenario-preview] normalized stories=${normalized.stories.length} totalScenarios=${normalized.totalScenarios}`);

    return {
      ok: true,
      stories: normalized.stories,
      totalScenarios: normalized.totalScenarios,
      rejected: Array.isArray(parsed.rejected) ? parsed.rejected : undefined,
      rawShape: normalized.rawShape,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.log(`[scenario-preview] provider error code=PREVIEW_TIMEOUT timeout=${config.timeoutMs}ms`);
      return { ok: false, errorCode: 'PREVIEW_TIMEOUT', error: 'Provider request timed out', message: `Timeout after ${config.timeoutMs}ms` };
    }

    const errMsg = err?.message ?? 'Unknown provider error';
    console.log(`[scenario-preview] provider error code=PREVIEW_PROVIDER_ERROR message=${errMsg.slice(0, 200)}`);
    return { ok: false, errorCode: 'PREVIEW_PROVIDER_ERROR', error: 'Provider request failed', message: errMsg };
  }
}
