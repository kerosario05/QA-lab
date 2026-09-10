import { getScenarioPreviewConfig } from './scenario-preview-provider';

/**
 * Bridge to the automation engine's recording endpoints.
 *
 * Deliberately thin: the engine owns every decision about what gets recorded and what a
 * recording produces. This layer only forwards, so the two services cannot drift into
 * disagreeing about the shape of a trace.
 *
 * The timeout is raised well above the shared default because starting a recording boots an
 * emulator and launches an app — minutes, not seconds — while the browser or device is
 * prepared for the person who is about to use it.
 */

export interface RecordingsProviderResponse {
  ok: boolean;
  status?: number;
  body?: any;
  errorCode?: string;
  error?: string;
  message?: string;
}

const START_TIMEOUT_MS = 5 * 60_000;

async function callRecordingEndpoint(
  logTag: string,
  path: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<RecordingsProviderResponse> {
  const config = getScenarioPreviewConfig();

  if (!config.baseUrl) {
    return {
      ok: false,
      errorCode: 'RECORDINGS_NOT_CONFIGURED',
      error: 'SCENARIO_PREVIEW_BASE_URL is not set',
    };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const effectiveTimeout = timeoutMs ?? config.timeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);

    const rawBody = await res.text();
    let parsed: any = null;
    if (rawBody.trim()) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        console.log(`[${logTag}] error code=INVALID_RESPONSE status=${res.status} preview=${rawBody.slice(0, 120)}`);
        return {
          ok: false,
          status: res.status,
          errorCode: 'INVALID_RESPONSE',
          error: 'Invalid JSON from provider',
          message: `HTTP ${res.status}: not JSON`,
        };
      }
    }

    console.log(`[${logTag}] response status=${res.status} ok=${res.ok}`);
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.log(`[${logTag}] error code=TIMEOUT timeout=${effectiveTimeout}ms`);
      return {
        ok: false,
        errorCode: 'TIMEOUT',
        error: 'Provider request timed out',
        message: `Timeout after ${effectiveTimeout}ms`,
      };
    }
    const errMsg = err?.message ?? 'Unknown provider error';
    console.log(`[${logTag}] error code=PROVIDER_ERROR message=${errMsg.slice(0, 200)}`);
    return { ok: false, errorCode: 'PROVIDER_ERROR', error: 'Provider request failed', message: errMsg };
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export function listRecordings(projectSlug: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-list',
    `/api/recordings?projectSlug=${encodeURIComponent(projectSlug)}`,
    { method: 'GET' },
  );
}

export function startRecording(payload: Record<string, unknown>): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-start',
    '/api/recordings/start',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    START_TIMEOUT_MS,
  );
}

export function getRecordingStatus(recordingId: string, projectSlug: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-status',
    `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
    { method: 'GET' },
  );
}

export function stopRecording(recordingId: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-stop',
    `/api/recordings/${encodeURIComponent(recordingId)}/stop`,
    { method: 'POST', headers: jsonHeaders, body: '{}' },
    START_TIMEOUT_MS,
  );
}

/** Derivation runs an AI round-trip, so it gets the long timeout too. */
export function deriveScenarios(recordingId: string, payload: Record<string, unknown>): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-derive',
    `/api/recordings/${encodeURIComponent(recordingId)}/derive`,
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    START_TIMEOUT_MS,
  );
}

export function getRecordingScenarios(recordingId: string, projectSlug: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-scenarios',
    `/api/recordings/${encodeURIComponent(recordingId)}/scenarios?projectSlug=${encodeURIComponent(projectSlug)}`,
    { method: 'GET' },
  );
}

export function saveRecordingScenarios(recordingId: string, payload: Record<string, unknown>): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-scenarios-save',
    `/api/recordings/${encodeURIComponent(recordingId)}/scenarios`,
    { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(payload) },
  );
}

export function getRecordingTrace(recordingId: string, projectSlug: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-trace',
    `/api/recordings/${encodeURIComponent(recordingId)}/trace?projectSlug=${encodeURIComponent(projectSlug)}`,
    { method: 'GET' },
  );
}

export function publishToTestRail(recordingId: string, payload: Record<string, unknown>): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-testrail',
    `/api/recordings/${encodeURIComponent(recordingId)}/testrail`,
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
    START_TIMEOUT_MS,
  );
}

/**
 * Starts the replay of a recorded web walkthrough.
 *
 * Returns as soon as the engine has queued the job, not when the browser finishes: a replay
 * walks the whole flow, so progress is followed on the job endpoint like every other run.
 */
export function executeRecording(recordingId: string, payload: Record<string, unknown>): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-execute',
    `/api/recordings/${encodeURIComponent(recordingId)}/execute`,
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
  );
}

export function deleteRecording(recordingId: string, projectSlug: string): Promise<RecordingsProviderResponse> {
  return callRecordingEndpoint(
    'recordings-delete',
    `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
    { method: 'DELETE' },
  );
}
