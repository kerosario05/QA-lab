import { canonicalInputKey, type InputRequirement } from './input-requirements';

const PROXY = import.meta.env.VITE_API_URL ?? '';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type ResolvedInput = {
  key?: unknown;
  status?: unknown;
  value?: unknown;
  source?: unknown;
  generated?: unknown;
  verified?: unknown;
  sensitive?: unknown;
  editable?: unknown;
  displayLabel?: unknown;
  technicalLabel?: unknown;
  datasetIdentity?: unknown;
};

export type ScenarioAutofillContext = {
  title?: string;
  preconditions?: unknown;
  steps?: unknown;
  expected?: unknown;
};

export function isScenarioEnrichmentCandidate(requirement: InputRequirement): boolean {
  const inputIntent = (requirement as InputRequirement & { inputIntent?: { mode?: string }; explicitValue?: unknown }).inputIntent;
  return requirement.inputRole === 'scenario'
    && requirement.valuePolicy === 'scenario_controlled'
    && requirement.sensitive !== true
    && requirement.fieldCapability?.kind !== 'password'
    && requirement.scenarioDataPolicy !== 'trusted_required'
    && (inputIntent === undefined || inputIntent.mode === 'set_value')
    && (requirement as InputRequirement & { explicitValue?: unknown }).explicitValue === undefined;
}

/**
 * The autofill transport must not depend on optional classification metadata
 * being present on every TestRail field. The backend is the authority for
 * resolution; here we only exclude values that must remain user/trusted
 * supplied or sensitive. This keeps the request complete when older or
 * partially enriched contracts omit inputRole/valuePolicy.
 */
export function isSafeAutofillCandidate(requirement: InputRequirement): boolean {
  const inputIntent = (requirement as InputRequirement & { inputIntent?: { mode?: string } }).inputIntent;
  const controlType = String(requirement.controlType ?? '').trim().toLowerCase();
  return requirement.required !== false
    && requirement.sensitive !== true
    && requirement.fieldCapability?.kind !== 'password'
    && !['password', 'secret', 'token', 'otp', 'pin'].includes(controlType)
    && requirement.valuePolicy !== 'trusted_required'
    && requirement.scenarioDataPolicy !== 'trusted_required'
    && (inputIntent === undefined || inputIntent.mode === 'set_value')
    && (requirement as InputRequirement & { explicitValue?: unknown }).explicitValue === undefined;
}

export async function hydrateScenarioSyntheticInputs(input: {
  projectId?: string;
  caseId: number;
  seed: string;
  scenarioContext?: ScenarioAutofillContext;
  requirements: InputRequirement[];
  values: Record<string, string>;
  fetcher?: Fetcher;
  onResolved?: (fields: ResolvedInput[]) => void;
}): Promise<Record<string, string>> {
  const fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
  const next = { ...input.values };
  const hasValue = (key: string) => typeof next[key] === 'string' && next[key].trim() !== '';
  const eligible = input.requirements.filter((requirement) => isSafeAutofillCandidate(requirement) && !hasValue(requirement.key));
  if (eligible.length === 0) return next;

  try {
    const response = await fetcher(`${PROXY}/api/runtime-inputs/scenario-autofill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(input.projectId ? { projectId: input.projectId } : {}), caseId: input.caseId, seed: input.seed, requirements: eligible, ...(input.scenarioContext ? { scenarioContext: input.scenarioContext } : {}) }),
    });
    if (!response.ok) return next;
    const body = await response.json().catch(() => ({})) as { resolved?: ResolvedInput[]; generated?: ResolvedInput[] };
    const resolved = Array.isArray(body.resolved) ? body.resolved : (body.generated ?? []);
    const eligibleByKey = new Map(eligible.map((requirement) => [canonicalInputKey(requirement.key), requirement.key]));
    const applicable = resolved.filter((field) => {
      if (typeof field.key !== 'string' || field.value === undefined) return false;
      const canonicalKey = canonicalInputKey(field.key);
      const declaredKey = eligibleByKey.get(canonicalKey);
      return declaredKey !== undefined && !hasValue(declaredKey);
    });
    input.onResolved?.(applicable);
    for (const field of applicable) {
      if (typeof field.key !== 'string' || field.value === undefined) continue;
      const declaredKey = eligibleByKey.get(canonicalInputKey(field.key));
      if (declaredKey !== undefined && !hasValue(declaredKey)) next[declaredKey] = String(field.value);
    }
  } catch {
    return next;
  }
  return next;
}
