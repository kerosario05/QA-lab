import type { InputRequirement } from './input-requirements';

const PROXY = import.meta.env.VITE_API_URL ?? '';

export type InputRequirementLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; inputRequirements: InputRequirement[]; runtimeValues?: Record<string, string | number | boolean>; inputRequirementsSyncVersion?: number }
  | { status: 'error'; error: string };

export type EnrichedInputRequirementCase<T> = T & {
  requirementsLoadStatus: InputRequirementLoadState['status'];
  requirementsLoadError?: string;
  inputRequirements?: InputRequirement[];
};

type InputRequirementsResponse = {
  inputRequirements?: InputRequirement[];
  runtimeValues?: Record<string, string | number | boolean>;
  inputRequirementsSyncVersion?: number;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type RawTestRailCase = {
  id: number;
  title?: unknown;
  custom_preconds?: unknown;
  custom_steps?: unknown;
  custom_expected?: unknown;
  custom_steps_separated?: unknown;
};

type RuntimeTestRailCase = RawTestRailCase & {
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
        ...(body.inputRequirementsSyncVersion === 2 ? { inputRequirementsSyncVersion: 2 } : {}),
        ...(body.runtimeValues && typeof body.runtimeValues === 'object' && !Array.isArray(body.runtimeValues)
          ? { runtimeValues: body.runtimeValues }
          : {}),
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
    const rawFields = rawTestRailCase as unknown as Record<string, unknown>;
    const sourceCase = Object.fromEntries(
      ['id', 'title', 'custom_preconds', 'custom_steps', 'custom_expected', 'custom_steps_separated']
        .flatMap((key) => rawFields[key] === undefined ? [] : [[key, rawFields[key]]]),
    );
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawTestRailCase: sourceCase }),
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
  // `init` must be forwarded: the sync step POSTs the case text. Dropping it turned that POST into
  // a bodyless GET (403 route_not_authorized), so a case with no persisted requirements never got any.
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Record<number, InputRequirementLoadState>> {
  const persistedStates = await loadInputRequirementsByCaseId(projectSlug, caseIds, fetcher);
  const casesNeedingSync = caseIds.flatMap((caseId) => {
    const rawCase = rawCases.find((candidate) => candidate.id === caseId);
    const persistedState = persistedStates[caseId];
    const hasCaseText = Boolean(rawCase && (
      rawCase.custom_preconds || rawCase.custom_steps || rawCase.custom_expected || rawCase.custom_steps_separated
    ));
    return persistedState?.status === 'loaded'
      // Older engines replace the whole contract with fill-only inference. Only
      // ask them to initialize an empty contract; v2 safely completes partial ones.
      && (persistedState.inputRequirementsSyncVersion === 2
        || (persistedState.inputRequirements.length === 0 && (rawCase?.inputRequirements?.length ?? 0) === 0))
      && hasCaseText
      && rawCase
      ? [rawCase]
      : [];
  });
  const syncedStates = casesNeedingSync.length > 0
    ? await syncInputRequirementsByCaseId(projectSlug, casesNeedingSync, fetcher)
    : {};
  const syncedCaseIds = casesNeedingSync
    .filter((rawCase) => syncedStates[rawCase.id]?.status === 'loaded'
      && (syncedStates[rawCase.id] as Extract<InputRequirementLoadState, { status: 'loaded' }>).inputRequirements.length > 0)
    .map((rawCase) => rawCase.id);
  const refreshedStates = syncedCaseIds.length > 0
    ? await loadInputRequirementsByCaseId(projectSlug, syncedCaseIds, fetcher)
    : {};
  const states: Record<number, InputRequirementLoadState> = {};
  for (const caseId of caseIds) {
    const rawCase = rawCases.find((candidate) => candidate.id === caseId);
    const persistedState = persistedStates[caseId];
    const syncedState = syncedStates[caseId];
    const refreshedState = refreshedStates[caseId];
    if (syncedState?.status === 'error') {
      states[caseId] = syncedState;
      continue;
    }
    const mergedRequirements = new Map<string, InputRequirement>();
    for (const requirement of persistedState?.status === 'loaded' ? persistedState.inputRequirements : []) {
      mergedRequirements.set(requirement.key.trim().toLowerCase(), requirement);
    }
    for (const requirement of syncedState?.status === 'loaded' ? syncedState.inputRequirements : []) {
      mergedRequirements.set(requirement.key.trim().toLowerCase(), requirement);
    }
    for (const requirement of refreshedState?.status === 'loaded' ? refreshedState.inputRequirements : []) {
      mergedRequirements.set(requirement.key.trim().toLowerCase(), requirement);
    }
    for (const requirement of rawCase?.inputRequirements ?? []) {
      mergedRequirements.set(requirement.key.trim().toLowerCase(), requirement);
    }
    // A successful sync returns the current complete contract, including any
    // removal of inferred aliases. Older snapshots must not resurrect them.
    if (syncedState?.status === 'loaded' && syncedState.inputRequirements.length > 0) {
      mergedRequirements.clear();
      for (const requirement of syncedState.inputRequirements) {
        mergedRequirements.set(requirement.key.trim().toLowerCase(), requirement);
      }
    }
    if (rawCase?.runtimeTransformStatus === 'success' || mergedRequirements.size > 0) {
      const runtimeValues = (refreshedState?.status === 'loaded' ? refreshedState.runtimeValues : undefined)
        ?? (persistedState?.status === 'loaded' ? persistedState.runtimeValues : undefined);
      states[caseId] = {
        status: 'loaded',
        inputRequirements: [...mergedRequirements.values()],
        ...(runtimeValues && Object.keys(runtimeValues).length > 0
          ? { runtimeValues }
          : {}),
      };
      continue;
    }
    if (refreshedState?.status === 'error') {
      states[caseId] = refreshedState;
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
