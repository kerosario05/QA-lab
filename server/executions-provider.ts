import { getScenarioPreviewConfig } from './scenario-preview-provider';

export interface ExecutionsProviderResponse {
  ok: boolean;
  status?: number;
  body?: any;
  errorCode?: string;
  error?: string;
  message?: string;
}

async function callExecutionsEndpoint(logTag: string, path: string): Promise<ExecutionsProviderResponse> {
  const config = getScenarioPreviewConfig();

  if (!config.baseUrl) {
    return { ok: false, errorCode: 'EXECUTIONS_NOT_CONFIGURED', error: 'SCENARIO_PREVIEW_BASE_URL is not set' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
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

export function listExecutions(): Promise<ExecutionsProviderResponse> {
  return callExecutionsEndpoint('executions-list', '/api/executions');
}

export function getExecution(launchId: string): Promise<ExecutionsProviderResponse> {
  return callExecutionsEndpoint('executions-detail', `/api/executions/${encodeURIComponent(launchId)}`);
}
