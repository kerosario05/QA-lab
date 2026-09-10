export type FieldCapability = {
  kind: 'text' | 'password' | 'number' | 'email' | 'tel' | 'date' | 'datetime' | 'select' | 'checkbox' | 'radio' | 'file' | 'unknown';
  allowedValues?: string[];
  optionSource?: 'contract' | 'runtime_observed' | 'unknown';
  constraints?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
  };
};

export type InputRequirement = {
  key: string;
  label?: string;
  displayLabel?: string;
  technicalLabel?: string;
  semanticField?: string;
  entityDisplayName?: string;
  controlType?: string;
  required?: boolean;
  sensitive?: boolean;
  allowedValues?: string[];
  semanticType?: string;
  datasetIdentity?: string;
  datasetOrdinal?: number;
  value?: string | number | boolean;
  generated?: boolean;
  verified?: boolean;
  editable?: boolean;
  fieldCapability?: FieldCapability;
  inputRole?: 'scenario' | 'supporting';
  valuePolicy?: 'scenario_controlled' | 'safe_synthetic' | 'trusted_required' | 'unresolved';
  scenarioDataPolicy?: string;
  source?: 'contract' | 'runtime_inferred' | string;
  provenance?: string;
  inputUsage?: Array<'action' | 'assertion' | 'expected' | string>;
};

type RequirementCase = {
  id: number;
  inputRequirements?: InputRequirement[];
};

export function composeSelectedInputRequirements(
  cases: RequirementCase[],
  selectedCaseIds: number[],
): { shared: InputRequirement[]; byCase: Record<string, InputRequirement[]> } {
  const selected = new Set(selectedCaseIds.map((id) => String(id)));
  const selectedCases = cases.filter((c) => selected.has(String(c.id)));
  if (selectedCases.length === 0) {
    return { shared: [], byCase: {} };
  }

  const byCase: Record<string, InputRequirement[]> = {};
  const keyInfo = new Map<string, { caseIds: Set<string>; representative: InputRequirement }>();

  for (const c of selectedCases) {
    const caseId = String(c.id);
    const requirements = dedupeInputRequirements(c.inputRequirements ?? []);
    byCase[caseId] = requirements;

    for (const requirement of requirements) {
      const canonicalKey = canonicalInputKey(requirement.key);
      const existing = keyInfo.get(canonicalKey);
      if (!existing) {
        keyInfo.set(canonicalKey, { caseIds: new Set([caseId]), representative: requirement });
      } else {
        existing.caseIds.add(caseId);
      }
    }
  }

  if (selectedCases.length < 2) {
    return { shared: [], byCase };
  }

  const allSelectedIds = new Set(selectedCases.map((c) => String(c.id)));
  const shared: InputRequirement[] = [];
  for (const info of keyInfo.values()) {
    let presentInAll = true;
    for (const caseId of allSelectedIds) {
      if (!info.caseIds.has(caseId)) {
        presentInAll = false;
        break;
      }
    }
    if (presentInAll) shared.push({ ...info.representative });
  }

  const sharedKeys = new Set(shared.map((r) => canonicalInputKey(r.key)));
  const scopedByCase: Record<string, InputRequirement[]> = {};
  for (const [caseId, requirements] of Object.entries(byCase)) {
    scopedByCase[caseId] = requirements.filter((r) => !sharedKeys.has(canonicalInputKey(r.key)));
  }

  return { shared, byCase: scopedByCase };
}

export function canonicalInputKey(key: string): string {
  return String(key ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function mergeRequirementMetadata(first: InputRequirement, incoming: InputRequirement): InputRequirement {
  const merged = { ...first };
  for (const field of ['label', 'displayLabel', 'technicalLabel', 'semanticField', 'entityDisplayName', 'controlType', 'required', 'sensitive', 'allowedValues', 'semanticType', 'datasetIdentity', 'datasetOrdinal', 'value', 'generated', 'verified', 'editable', 'fieldCapability', 'inputRole', 'valuePolicy', 'scenarioDataPolicy', 'source', 'provenance', 'inputUsage'] as const) {
    if (merged[field] === undefined && incoming[field] !== undefined) {
      (merged as Record<string, unknown>)[field] = Array.isArray(incoming[field]) ? [...incoming[field] as unknown[]] : incoming[field];
    }
  }
  return merged;
}

/** Dedupe only by structured key. Labels and visual metadata are never identity. */
export function dedupeInputRequirements(requirements: InputRequirement[]): InputRequirement[] {
  const result: InputRequirement[] = [];
  const indexByKey = new Map<string, number>();
  for (const requirement of requirements) {
    if (!requirement || typeof requirement.key !== 'string' || requirement.key.trim() === '') continue;
    const canonicalKey = canonicalInputKey(requirement.key);
    const existingIndex = indexByKey.get(canonicalKey);
    if (existingIndex === undefined) {
      indexByKey.set(canonicalKey, result.length);
      result.push({ ...requirement, key: requirement.key.trim() });
    } else {
      result[existingIndex] = mergeRequirementMetadata(result[existingIndex], requirement);
    }
  }
  return result;
}

type IndexedScope = { base: string; index: string; path: string };

function findIndexedScope(key: string): IndexedScope | undefined {
  const segments = key.split('.');
  const path: string[] = [];
  for (const segment of segments) {
    const match = segment.match(/^(.*?)(?:[_-](\d+)|\[(\d+)\])$/);
    if (!match) {
      path.push(segment);
      continue;
    }
    const base = [...path, match[1]].filter(Boolean).join('.');
    return { base: base || match[1], index: match[2] ?? match[3], path: [...path, segment].join('.') };
  }
  return undefined;
}

function humanizeKeyPart(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export type RuntimeInputPresentation = {
  inputKey: string;
  displayLabel: string;
  requirement: InputRequirement;
  groupKey?: string;
  groupLabel?: string;
};

export type RuntimeInputGroup = {
  key: string;
  label: string;
  requirements: RuntimeInputPresentation[];
};

export type RuntimeInputGroups = {
  general: RuntimeInputPresentation[];
  groups: RuntimeInputGroup[];
};

/**
 * Builds a display model without changing the transport identity. Indexed
 * scopes are detected from the key shape, so this works for any dataset name.
 */
export function groupRuntimeInputRequirements(requirements: InputRequirement[]): RuntimeInputGroups {
  const unique = dedupeInputRequirements(requirements);
  const scopes = unique.map((requirement) => findIndexedScope(requirement.key));
  const repeatedScopeKeys = new Set<string>();
  const indexesByScope = new Map<string, Set<string>>();
  scopes.forEach((scope) => {
    if (!scope) return;
    const indexes = indexesByScope.get(scope.base) ?? new Set<string>();
    indexes.add(scope.index);
    indexesByScope.set(scope.base, indexes);
  });
  for (const [base, indexes] of indexesByScope) {
    if (indexes.size > 1) repeatedScopeKeys.add(base);
  }

  const general: RuntimeInputPresentation[] = [];
  const groupsByKey = new Map<string, RuntimeInputGroup>();
  unique.forEach((requirement, index) => {
    const scope = scopes[index];
    const isGrouped = scope !== undefined && repeatedScopeKeys.has(scope.base);
    const baseLabel = requirement.displayLabel?.trim()
      || requirement.semanticField?.trim()
      || requirement.label?.trim()
      || humanizeKeyPart(requirement.key.split('.').at(-1) ?? requirement.key);
    const groupKey = isGrouped ? `${scope!.base}:${scope!.index}` : undefined;
    const entityName = requirement.entityDisplayName?.trim();
    const groupLabel = isGrouped
      ? entityName ? `${entityName.toUpperCase()} ${requirement.datasetOrdinal ?? scope!.index}` : `Dataset/Entidad ${scope!.index}`
      : undefined;
    const presentation: RuntimeInputPresentation = {
      inputKey: requirement.key,
      displayLabel: baseLabel,
      requirement,
      ...(groupKey ? { groupKey } : {}),
      ...(groupLabel ? { groupLabel } : {}),
    };
    if (!isGrouped) {
      general.push(presentation);
      return;
    }
    const group = groupsByKey.get(groupKey!);
    if (group) group.requirements.push(presentation);
    else groupsByKey.set(groupKey!, { key: groupKey!, label: groupLabel!, requirements: [presentation] });
  });

  return { general, groups: [...groupsByKey.values()] };
}
