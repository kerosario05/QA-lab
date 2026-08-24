import { getScenarioPreviewConfig } from './scenario-preview-provider';

export interface MobileProviderResponse {
  ok: boolean;
  status?: number;
  body?: any;
  errorCode?: string;
  error?: string;
  message?: string;
}

async function callMobileEndpoint(
  logTag: string,
  path: string,
  init: RequestInit,
  notConfiguredCode: string,
): Promise<MobileProviderResponse> {
  const config = getScenarioPreviewConfig();

  if (!config.baseUrl) {
    return { ok: false, errorCode: notConfiguredCode, error: 'SCENARIO_PREVIEW_BASE_URL is not set' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawBody = await res.text();
    let parsed: any = null;

    if (rawBody.trim()) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        console.log(`[${logTag}] error code=INVALID_RESPONSE status=${res.status} body_preview=${rawBody.slice(0, 100)}`);
        return { ok: false, status: res.status, errorCode: 'INVALID_RESPONSE', error: 'Invalid JSON from provider', message: `HTTP ${res.status}: not JSON` };
      }
    }

    console.log(`[${logTag}] response status=${res.status} ok=${res.ok}`);

    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.log(`[${logTag}] error code=TIMEOUT timeout=${config.timeoutMs}ms`);
      return { ok: false, errorCode: 'TIMEOUT', error: 'Provider request timed out', message: `Timeout after ${config.timeoutMs}ms` };
    }

    const errMsg = err?.message ?? 'Unknown provider error';
    console.log(`[${logTag}] error code=PROVIDER_ERROR message=${errMsg.slice(0, 200)}`);
    return { ok: false, errorCode: 'PROVIDER_ERROR', error: 'Provider request failed', message: errMsg };
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

// ── Emulator ─────────────────────────────────────────────────────────────

export function startEmulator(payload: { avdName?: string; headless?: boolean }): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-emulator-start',
    '/api/mobile/emulator/start',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    'EMULATOR_NOT_CONFIGURED',
  );
}

export function getEmulatorStatus(): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-emulator-status',
    '/api/mobile/emulator/status',
    { method: 'GET' },
    'EMULATOR_NOT_CONFIGURED',
  );
}

export function stopEmulator(): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-emulator-stop',
    '/api/mobile/emulator/stop',
    { method: 'POST' },
    'EMULATOR_NOT_CONFIGURED',
  );
}

// ── Appium ───────────────────────────────────────────────────────────────

export function getAppiumStatus(): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-appium-status',
    '/api/mobile/appium/status',
    { method: 'GET' },
    'APPIUM_NOT_CONFIGURED',
  );
}

// ── Scenarios ────────────────────────────────────────────────────────────

export interface MobileScenarioPreviewPayload {
  projectKey: string;
  sprintId?: number;
  activeSprint?: boolean;
  status?: string;
  maxResults?: number;
  appSlug?: string;
  selectedIssueKeys?: string[];
  sourceRevision?: string;
  launchDraftId?: string;
}

export function requestMobileScenarioPreview(payload: MobileScenarioPreviewPayload): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-scenarios-preview',
    '/api/mobile/scenarios/preview',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    'MOBILE_SCENARIOS_NOT_CONFIGURED',
  );
}

export function requestMobileScenarioGeneration(payload: MobileScenarioPreviewPayload): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-scenarios-generation',
    '/api/mobile/scenarios/generation',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    'MOBILE_SCENARIOS_NOT_CONFIGURED',
  );
}

export function getMobileScenarioGenerationStatus(generationJobId: string): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-scenarios-generation-status',
    `/api/mobile/scenarios/generation/${encodeURIComponent(generationJobId)}`,
    { method: 'GET' },
    'MOBILE_SCENARIOS_NOT_CONFIGURED',
  );
}

// ── Runs: publish + execute ─────────────────────────────────────────────

export function requestMobileLaunchExecution(payload: Record<string, unknown>): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-runs-launch-execution',
    '/api/mobile/runs/launch-execution',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    'MOBILE_RUNS_NOT_CONFIGURED',
  );
}

export function requestMobileRunExecute(payload: Record<string, unknown>): Promise<MobileProviderResponse> {
  return callMobileEndpoint(
    'mobile-runs-execute',
    '/api/mobile/runs/execute',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    'MOBILE_RUNS_NOT_CONFIGURED',
  );
}
