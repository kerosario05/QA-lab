import { canonicalInputKey, type InputRequirement } from './input-requirements';

export type RuntimeEntry = {
  key: string;
  value: string;
  source: string;
  sensitive: boolean;
  provenance?: string;
  semanticType?: string;
  fieldKind?: string;
  datasetIdentity?: string;
  contractVersion?: string;
};

export type RuntimeInputValue = string;
export type RuntimeCommonInputValues = Record<string, RuntimeInputValue>;
export type RuntimeInputOverridesByCaseId = Record<string, Record<string, RuntimeInputValue>>;

export type InputRequirementValues = {
  shared: Record<string, string>;
  byCase: Record<string, Record<string, string>>;
};

export type RuntimeInputValuesByCaseId = Record<string, Record<string, string>>;

type RequirementCase = { id: number; inputRequirements?: InputRequirement[] };
type RuntimeInputRequirementState = { status: string; inputRequirements?: InputRequirement[] };

function hasRuntimeInputValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function getValueByCanonicalKey(values: Record<string, string> | undefined, key: string): string | undefined {
  if (!values) return undefined;
  const canonical = canonicalInputKey(key);
  const found = Object.entries(values).find(([candidate]) => canonicalInputKey(candidate) === canonical);
  return found?.[1];
}

export function hydrateNewlySelectedCaseInputs(input: {
  caseId: number;
  selectedTestRailCaseIds: number[];
  inputRequirementsByCaseId: Record<number, RuntimeInputRequirementState>;
  runtimeInputValuesByCaseId: RuntimeInputValuesByCaseId;
}): RuntimeInputValuesByCaseId {
  const destinationId = String(input.caseId);
  const destinationState = input.inputRequirementsByCaseId[input.caseId];
  if (!destinationState || destinationState.status !== 'loaded') return input.runtimeInputValuesByCaseId;

  const next = { ...input.runtimeInputValuesByCaseId, [destinationId]: { ...(input.runtimeInputValuesByCaseId[destinationId] ?? {}) } };
  for (const requirement of destinationState.inputRequirements ?? []) {
    if (hasRuntimeInputValue(getValueByCanonicalKey(next[destinationId], requirement.key))) continue;
    const candidates = new Set<string>();
    for (const sourceCaseId of input.selectedTestRailCaseIds) {
      if (sourceCaseId === input.caseId) continue;
      const sourceState = input.inputRequirementsByCaseId[sourceCaseId];
      if (sourceState?.status !== 'loaded' || !(sourceState.inputRequirements ?? []).some((source) => canonicalInputKey(source.key) === canonicalInputKey(requirement.key))) continue;
      const value = getValueByCanonicalKey(input.runtimeInputValuesByCaseId[String(sourceCaseId)], requirement.key);
      if (typeof value === 'string' && value.trim() !== '') candidates.add(value);
    }
    if (candidates.size === 1) next[destinationId][requirement.key] = [...candidates][0];
  }
  return next;
}

export function getCommonRequirementKeys(cases: RequirementCase[], selectedCaseIds: number[]): string[] {
  const selected = cases.filter((c) => selectedCaseIds.includes(c.id));
  if (selected.length < 2) return [];
  const counts = new Map<string, number>();
  for (const currentCase of selected) {
    for (const requirement of currentCase.inputRequirements ?? []) {
      const key = canonicalInputKey(requirement.key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count === selected.length).map(([key]) => key);
}

export function propagateRuntimeInputChange(
  values: RuntimeInputValuesByCaseId,
  editedCaseId: number | string,
  key: string,
  value: string,
  cases: RequirementCase[],
  selectedCaseIds: number[],
): RuntimeInputValuesByCaseId {
  const next = updateRuntimeInput(values, editedCaseId, key, value);
  if (value.trim() === '') return next;

  for (const currentCase of cases) {
    if (currentCase.id === Number(editedCaseId) || !selectedCaseIds.includes(currentCase.id)) continue;
    if (!(currentCase.inputRequirements ?? []).some((requirement) => canonicalInputKey(requirement.key) === canonicalInputKey(key))) continue;
    if (getValueByCanonicalKey(next[String(currentCase.id)], key)?.trim()) continue;
    next[String(currentCase.id)] = { ...(next[String(currentCase.id)] ?? {}), [key]: value };
  }
  return next;
}

export function resolveRuntimeInputValue(input: {
  caseId: number | string;
  key: string;
  commonValues: RuntimeCommonInputValues;
  overridesByCaseId: RuntimeInputOverridesByCaseId;
  existingByCase: RuntimeInputValuesByCaseId;
}): RuntimeInputValue | undefined {
  return getValueByCanonicalKey(input.overridesByCaseId[String(input.caseId)], input.key)
    ?? getValueByCanonicalKey(input.commonValues, input.key)
    ?? getValueByCanonicalKey(input.existingByCase[String(input.caseId)], input.key);
}

export function updateRuntimeInput(
  values: RuntimeInputValuesByCaseId,
  caseId: number | string,
  key: string,
  value: string,
): RuntimeInputValuesByCaseId {
  const id = String(caseId);
  return {
    ...values,
    [id]: { ...(values[id] ?? {}), [key]: value },
  };
}

export type InputRequirementsComposition = {
  shared: InputRequirement[];
  byCase: Record<string, InputRequirement[]>;
};

export function createInputRequirementValues(): InputRequirementValues {
  return { shared: {}, byCase: {} };
}

export function setSharedValue(values: InputRequirementValues, key: string, value: string): InputRequirementValues {
  return { ...values, shared: { ...values.shared, [key]: value } };
}

export function setByCaseValue(
  values: InputRequirementValues,
  caseId: string,
  key: string,
  value: string,
): InputRequirementValues {
  return {
    ...values,
    byCase: {
      ...values.byCase,
      [caseId]: { ...(values.byCase[caseId] ?? {}), [key]: value },
    },
  };
}

function hasRequiredValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export function isLaunchBlocked(composition: InputRequirementsComposition, values: InputRequirementValues): boolean {
  for (const requirement of composition.shared) {
    if (requirement.valuePolicy === 'safe_synthetic' && requirement.inputRole === 'supporting') continue;
    if (requirement.required === true && !hasRequiredValue(values.shared[requirement.key])) return true;
  }
  for (const [caseId, requirements] of Object.entries(composition.byCase)) {
    const caseValues = values.byCase[caseId] ?? {};
    for (const requirement of requirements) {
      if (requirement.valuePolicy === 'safe_synthetic' && requirement.inputRole === 'supporting') continue;
      if (requirement.required === true && !hasRequiredValue(caseValues[requirement.key])) return true;
    }
  }
  return false;
}

export function buildRuntimeEntriesByCase(
  composition: InputRequirementsComposition,
  values: InputRequirementValues,
  selectedCaseIds: number[],
  overridesByCaseId: RuntimeInputOverridesByCaseId = {},
): Record<string, RuntimeEntry[]> | undefined {
  const sharedSet = new Set(composition.shared.map((r) => canonicalInputKey(r.key)));
  const result: Record<string, RuntimeEntry[]> = {};

  for (const id of selectedCaseIds) {
    const caseId = String(id);
    const entries: RuntimeEntry[] = [];
    const sharedRequirements = composition.shared;
    const caseRequirements = composition.byCase[caseId] ?? [];

    for (const requirement of [...sharedRequirements, ...caseRequirements]) {
      const isShared = sharedSet.has(canonicalInputKey(requirement.key));
      const raw = resolveRuntimeInputValue({
        caseId,
        key: requirement.key,
        commonValues: isShared ? values.shared : {},
        overridesByCaseId,
        existingByCase: values.byCase,
      });
      if (!hasRequiredValue(raw)) continue;
      entries.push({
        key: requirement.key,
        value: raw as string,
        source: 'manual_runtime',
        sensitive: requirement.sensitive === true,
        ...(requirement.source === 'confirmed_replay' ? { provenance: 'confirmed_case_runtime' } : {}),
        ...(requirement.source === 'user_entered' ? { provenance: 'user_entered' } : {}),
        ...(requirement.provenance ? { provenance: requirement.provenance } : {}),
        ...(requirement.semanticType ? { semanticType: requirement.semanticType } : {}),
        ...(requirement.fieldCapability?.kind ? { fieldKind: requirement.fieldCapability.kind } : {}),
        ...(requirement.datasetIdentity ? { datasetIdentity: requirement.datasetIdentity } : {}),
      });
    }

    if (entries.length > 0) result[caseId] = entries;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
