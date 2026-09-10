import type {
  DeriveResult,
  RecordedScenario,
  RecordingLive,
  RecordingSummary,
  TestRailPublishResult,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

/**
 * Recording API.
 *
 * Every call carries the project slug because the project — not a typed package name or URL —
 * is what determines the app under record. The UI never gets to name a target of its own.
 */
export const recordingsApi = {
  list: (projectSlug: string) =>
    request<{ recordings: RecordingSummary[]; appSlug: string }>(
      `/api/recordings?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  start: (projectSlug: string, label?: string) =>
    request<{ recordingId: string; jobId: string; summary: RecordingSummary }>('/api/recordings/start', {
      method: 'POST',
      body: JSON.stringify({ projectSlug, label }),
    }),

  status: (recordingId: string, projectSlug: string) =>
    request<{ active: boolean; summary: RecordingSummary; live?: RecordingLive }>(
      `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  stop: (recordingId: string, projectSlug: string) =>
    request<{ summary: RecordingSummary }>(`/api/recordings/${encodeURIComponent(recordingId)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug }),
    }),

  derive: (recordingId: string, projectSlug: string, title?: string) =>
    request<DeriveResult>(`/api/recordings/${encodeURIComponent(recordingId)}/derive`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, title }),
    }),

  scenarios: (recordingId: string, projectSlug: string) =>
    request<{ scenarios: RecordedScenario[] }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/scenarios?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  saveScenarios: (recordingId: string, projectSlug: string, scenarios: RecordedScenario[]) =>
    request<{ scenarios: RecordedScenario[] }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/scenarios`,
      { method: 'PUT', body: JSON.stringify({ projectSlug, scenarios }) },
    ),

  trace: (recordingId: string, projectSlug: string) =>
    request<{ trace: { narrative?: string } }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/trace?projectSlug=${encodeURIComponent(projectSlug)}`,
    ),

  /**
   * Publishes the selected scenarios as TestRail cases.
   *
   * `destination` overrides where they land. Omitting it keeps the project's configured
   * section, which is what the panel does until someone picks another one; sending the
   * project and suite alongside the section lets the engine refuse a mismatched pair rather
   * than filing the cases in another team's project.
   */
  publishToTestRail: (
    recordingId: string,
    projectSlug: string,
    scenarioIds?: string[],
    destination?: { sectionId?: string; projectId?: string; suiteId?: string },
  ) =>
    request<TestRailPublishResult>(`/api/recordings/${encodeURIComponent(recordingId)}/testrail`, {
      method: 'POST',
      body: JSON.stringify({ projectSlug, scenarioIds, ...destination }),
    }),

  /**
   * Replays a recorded web walkthrough in a real browser.
   *
   * Answers with a job id, not with the outcome: the replay walks the whole flow, so the
   * panel follows it on the job endpoint like every other long operation.
   */
  execute: (
    recordingId: string,
    projectSlug: string,
    scenarioIds: string[],
    dataOverrides?: Record<string, Record<number, string>>,
  ) =>
    request<{ jobId: string; scenarioCount: number }>(
      `/api/recordings/${encodeURIComponent(recordingId)}/execute`,
      { method: 'POST', body: JSON.stringify({ projectSlug, scenarioIds, dataOverrides }) },
    ),

  remove: (recordingId: string, projectSlug: string) =>
    request<{ ok: boolean }>(
      `/api/recordings/${encodeURIComponent(recordingId)}?projectSlug=${encodeURIComponent(projectSlug)}`,
      { method: 'DELETE' },
    ),
};

export type * from './types';
