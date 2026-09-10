import type { InputRequirement } from './input-requirements';

const PROXY = import.meta.env.VITE_API_URL ?? '';

export type InputRequirementLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; inputRequirements: InputRequirement[] }
  | { status: 'error'; error: string };

export type EnrichedInputRequirementCase<T> = T & {
  requirementsLoadStatus: InputRequirementLoadState['status'];
  requirementsLoadError?: string;
  inputRequirements?: InputRequirement[];
};

type InputRequirementsResponse = {
  inputRequirements?: InputRequirement[];
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type RawTestRailCase = { id: number; [key: string]: unknown };

type RuntimeTestRailCase = {
  id: number;
  runtimeTransformStatus?: 'success' | 'error';
  runtimeTransformErrorCode?: string;
  inputRequirements?: InputRequirement[];
};

export async function loadInputRequirementsByCaseId(
  projectSlug: string,
  caseIds: number[],
  fetcher: Fetcher = (url) => fetch(url),
): Promise<Record<number, InputRequirementLoadState>> {
  const results = await Promise.all(caseIds.map(async (caseId) => {
    const url = `${PROXY}/api/projects/${encodeURIComponent(projectSlug)}/cases/${caseId}/input-requirements`;
    try {
      const response = await fetcher(url);
      const body = await response.json().catch(() => ({})) as InputRequirementsResponse & { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.message || body.error || `${response.status} ${response.statusText}`);
      }
      return [caseId, {
        status: 'loaded',
        inputRequirements: Array.isArray(body.inputRequirements) ? body.inputRequirements : [],
      }] as const;
    } catch (error) {
      return [caseId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }] as const;
    }
  }));

  return Object.fromEntries(results);
}

export async function saveCaseInputRequirements(
  projectSlug: string,
  caseId: number,
  inputRequirements: InputRequirement[],
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<InputRequirementsResponse> {
  const url = `${PROXY}/api/projects/${encodeURIComponent(projectSlug)}/cases/${caseId}/input-requirements`;
  const response = await fetcher(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputRequirements }),
  });
  const body = await response.json().catch(() => ({})) as InputRequirementsResponse & { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message || body.error || `${response.status} ${response.statusText}`);
  return body;
}

export async function syncInputRequirementsByCaseId(
  projectSlug: string,
  cases: RawTestRailCase[],
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Record<number, InputRequirementLoadState>> {
  const results = await Promise.all(cases.map(async (rawTestRailCase) => {
    const caseId = rawTestRailCase.id;
    const url = `${PROXY}/api/projects/${encodeURIComponent(projectSlug)}/cases/${caseId}/input-requirements/sync`;
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawTestRailCase }),
      });
      const body = await response.json().catch(() => ({})) as InputRequirementsResponse & { message?: string; error?: string };
      if (!response.ok) throw new Error(body.message || body.error || `${response.status} ${response.statusText}`);
      return [caseId, {
        status: 'loaded',
        inputRequirements: Array.isArray(body.inputRequirements) ? body.inputRequirements : [],
      }] as const;
    } catch (error) {
      return [caseId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }] as const;
    }
  }));
  return Object.fromEntries(results);
}

export async function loadRequirementsAfterSelection(
  projectSlug: string,
  caseIds: number[],
  rawCases: RuntimeTestRailCase[],
): Promise<Record<number, InputRequirementLoadState>> {
  void projectSlug;
  const states: Record<number, InputRequirementLoadState> = {};
  for (const caseId of caseIds) {
    const rawCase = rawCases.find((candidate) => candidate.id === caseId);
    if (rawCase?.runtimeTransformStatus === 'success') {
      states[caseId] = {
        status: 'loaded',
        inputRequirements: rawCase.inputRequirements ?? [],
      };
      continue;
    }
    states[caseId] = {
      status: 'error',
      error: rawCase?.runtimeTransformErrorCode ?? 'runtime_transform_status_missing',
    };
  }
  return states;
}

export function enrichCasesWithInputRequirements<T extends { id: number }>(
  cases: T[],
  states: Record<number, InputRequirementLoadState>,
): Array<EnrichedInputRequirementCase<T>> {
  return cases.map((item) => {
    const state = states[item.id] ?? { status: 'loading' as const };
    if (state.status === 'loaded') {
      return { ...item, requirementsLoadStatus: 'loaded' as const, inputRequirements: state.inputRequirements };
    }
    if (state.status === 'error') {
      return { ...item, requirementsLoadStatus: 'error' as const, requirementsLoadError: state.error };
    }
    return { ...item, requirementsLoadStatus: 'loading' as const };
  });
}
