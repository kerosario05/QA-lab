import type { InputRequirement } from './input-requirements';
import type { InputRequirementLoadState } from './input-requirements-loader';
import type { RuntimeInputValuesByCaseId } from './input-requirements-values';
import { resolveRuntimeInputValue, type RuntimeCommonInputValues, type RuntimeInputOverridesByCaseId } from './input-requirements-values';

export type InputRequirementsReadiness = {
  ready: boolean;
  unresolvedCaseIds: number[];
  missingRequiredInputs: Array<{ caseId: number; key: string }>;
  missingTrustedInputs?: Array<{ caseId: number; key: string }>;
  unresolvedInputs?: Array<{ caseId: number; key: string }>;
};

function hasRuntimeValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== 'string' || value.trim() !== '';
}

export function evaluateInputRequirementsReadiness(
  selectedCaseIds: number[],
  inputRequirementsByCaseId: Record<number, InputRequirementLoadState>,
  runtimeInputValuesByCaseId: RuntimeInputValuesByCaseId,
  runtimeCommonInputValues: RuntimeCommonInputValues = {},
  runtimeInputOverridesByCaseId: RuntimeInputOverridesByCaseId = {},
): InputRequirementsReadiness {
  const unresolvedCaseIds: number[] = [];
  const missingRequiredInputs: Array<{ caseId: number; key: string }> = [];
  const missingTrustedInputs: Array<{ caseId: number; key: string }> = [];
  const unresolvedInputs: Array<{ caseId: number; key: string }> = [];

  for (const caseId of selectedCaseIds) {
    const state = inputRequirementsByCaseId[caseId];
    if (!state || state.status !== 'loaded') {
      unresolvedCaseIds.push(caseId);
      continue;
    }

    for (const requirement of state.inputRequirements as InputRequirement[]) {
      const value = resolveRuntimeInputValue({
        caseId,
        key: requirement.key,
        commonValues: runtimeCommonInputValues,
        overridesByCaseId: runtimeInputOverridesByCaseId,
        existingByCase: runtimeInputValuesByCaseId,
      });
      if (requirement.required !== true || hasRuntimeValue(value)) continue;
      if (requirement.valuePolicy === 'safe_synthetic' && requirement.inputRole === 'supporting') continue;
      const missing = { caseId, key: requirement.key };
      missingRequiredInputs.push(missing);
      if (requirement.valuePolicy === 'trusted_required') missingTrustedInputs.push(missing);
      if (requirement.valuePolicy === 'unresolved') unresolvedInputs.push(missing);
    }
  }

  return {
    ready: unresolvedCaseIds.length === 0 && missingRequiredInputs.length === 0,
    unresolvedCaseIds,
    missingRequiredInputs,
    ...(missingTrustedInputs.length > 0 ? { missingTrustedInputs } : {}),
    ...(unresolvedInputs.length > 0 ? { unresolvedInputs } : {}),
  };
}
