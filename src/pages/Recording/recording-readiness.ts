import type { RecordedDataField, RecordedScenario, RecordingReadiness, RuntimeInputRequirement } from '../../services/recordings/types';

export function isQaOverridableRuntimeInput(requirement: Pick<RuntimeInputRequirement, 'valueRole' | 'readOnly' | 'computed' | 'systemGenerated'>): boolean {
  return requirement.valueRole !== 'runtime_derived_oracle'
    && requirement.readOnly !== true
    && requirement.computed !== true
    && requirement.systemGenerated !== true;
}

function fallbackRequirement(field: RecordedDataField): RuntimeInputRequirement {
  const derived = field.valueRole === 'runtime_derived_oracle';
  const value = field.exampleValue ?? null;
  return {
    valueKey: field.key,
    semanticField: field.semanticField ?? field.label ?? null,
    ...(field.entityScope ? { entityScope: field.entityScope } : {}),
    valueRole: field.valueRole ?? (field.sensitive ? 'secure_input' : 'action_input'),
    required: !derived,
    value,
    source: derived ? 'RECORDED_CONFIRMED' : value === null ? 'unresolved' : field.source === 'secure' ? 'secure' : 'RECORDED_CONFIRMED',
    resolved: derived || value !== null,
    editable: !derived,
    sensitive: field.sensitive,
    masked: field.sensitive,
    stepIndex: field.stepIndex,
    ...(field.technicalTargetRefs ? { technicalTargetRefs: field.technicalTargetRefs } : {}),
    ...(field.sourceEventRefs ? { sourceEventRefs: field.sourceEventRefs } : {}),
    ...(field.validatedByInteraction ? { validatedByInteraction: true } : {}),
    readOnly: derived,
    computed: derived,
  };
}

export function runtimeRequirementsForScenario(scenario: RecordedScenario): RuntimeInputRequirement[] {
  const rawSource = scenario.runtimeInputRequirements ?? scenario.requiredData.map(fallbackRequirement);
  const scopedSuffixes = new Set(rawSource.map((requirement) => requirement.valueKey).filter((key) => key.includes('.')).map((key) => key.slice(key.indexOf('.') + 1)));
  const source = rawSource.filter((requirement) => requirement.valueKey.includes('.') || !scopedSuffixes.has(requirement.valueKey));
  const byKey = new Map<string, RuntimeInputRequirement>();
  for (const requirement of source) {
    const normalized = {
      ...requirement,
      editable: requirement.editable ?? isQaOverridableRuntimeInput(requirement),
      masked: requirement.masked ?? requirement.sensitive === true,
    };
    const previous = byKey.get(requirement.valueKey);
    byKey.set(requirement.valueKey, previous
      ? { ...previous, value: previous.value ?? normalized.value, resolved: previous.resolved || normalized.resolved, editable: previous.editable || normalized.editable, technicalTargetRefs: [...new Set([...(previous.technicalTargetRefs ?? []), ...(normalized.technicalTargetRefs ?? [])])] }
      : normalized);
  }
  return [...byKey.values()];
}

export function resolveScenarioReadiness(scenario: RecordedScenario, values: Readonly<Record<string, string | undefined>>): RecordingReadiness {
  const requirements = runtimeRequirementsForScenario(scenario).map((requirement) => {
    if (requirement.valueRole === 'runtime_derived_oracle') return { ...requirement, required: false, resolved: true, readOnly: true };
    const value = values[requirement.valueKey] ?? requirement.value ?? null;
    return {
      ...requirement,
      value,
      source: values[requirement.valueKey] !== undefined ? 'CURRENT_QA_EDIT' : requirement.source,
      authority: values[requirement.valueKey] !== undefined ? 'explicit_qa_edit' : requirement.authority,
      authorityValue: values[requirement.valueKey] !== undefined ? value : requirement.authorityValue,
      resolved: typeof value === 'string' ? value.trim().length > 0 : false,
    };
  });
  const missingByKey = new Map<string, RuntimeInputRequirement>();
  for (const requirement of requirements) {
    if (requirement.required && !requirement.resolved && !missingByKey.has(requirement.valueKey)) missingByKey.set(requirement.valueKey, requirement);
  }
  const missingInputs = [...missingByKey.values()];
  const normalizedLogicalKey = (valueKey: string) => {
    const parts = valueKey.split('.');
    return (parts.length > 1 ? parts.slice(1).join('.') : valueKey).replace(/_valor$/i, '').toLocaleLowerCase();
  };
  const uniqueConstraintViolation = requirements.some((requirement) => {
    const unique = (requirement.constraints ?? []).some((constraint) => {
      const normalized = String(constraint.type ?? '').trim().toLocaleLowerCase().replace(/[\s-]/g, '_');
      return constraint.uniqueWithinCollection === true || normalized === 'uniquewithincollection' || normalized === 'unique_within_collection' || normalized === 'distinct_within_collection';
    });
    if (!unique || !requirement.resolved || typeof requirement.value !== 'string') return false;
    const value = requirement.value.trim().toLocaleLowerCase();
    return requirements.some((candidate) => candidate.valueKey !== requirement.valueKey
      && normalizedLogicalKey(candidate.valueKey) === normalizedLogicalKey(requirement.valueKey)
      && candidate.resolved
      && typeof candidate.value === 'string'
      && candidate.value.trim().toLocaleLowerCase() === value);
  });
  const dataReadiness = missingInputs.length === 0 && !uniqueConstraintViolation;
  const functionalReadiness = scenario.readiness?.functionalReadiness ?? scenario.testRailSteps.length > 0;
  // FIRST_LOSS fix (recordingId a1282e09-65a1-45cc-b4e0-62832a5a7985): mirrors the backend's own
  // `hasExecutionAuthority` (`interaction.executionAuthority ?? !interaction.technicalOnly`)
  // EXACTLY. This filter used to check only `!technicalOnly`, never `executionAuthority` --  a
  // functional selection's display-only "select" projection row (compoundRole: "selection",
  // locators: [], `technicalOnly` never set on IT specifically -- only on the raw owner/option
  // clicks it summarizes) was never `technicalOnly`, so it passed this filter and was then judged
  // on its own (nonexistent) technical target, wrongly failing `executionActionReadiness` for
  // every scenario containing a combobox selection, even though the backend's authoritative
  // `evaluateRecordedScenarioExecutionReadiness` already correctly excludes it via
  // `executionAuthority: false`.
  const hasExecutionAuthority = (interaction: Record<string, unknown>): boolean =>
    typeof interaction.executionAuthority === 'boolean' ? interaction.executionAuthority : !interaction.technicalOnly;
  const canonicalActions = (scenario.canonicalInteractions ?? []).filter((interaction) =>
    hasExecutionAuthority(interaction) && interaction.action !== 'system_observation' && interaction.action !== 'navigation',
  );
  const hasCertifiedTarget = (interaction: (typeof canonicalActions)[number]) => {
    const refs = Array.isArray(interaction.technicalTargetRefs) ? interaction.technicalTargetRefs : [];
    const candidates = Array.isArray(interaction.technicalTargetCandidates)
      ? interaction.technicalTargetCandidates.filter((candidate): candidate is { locatorCandidates?: unknown[]; structuralContext?: unknown; stableAttributes?: unknown } => Boolean(candidate) && typeof candidate === 'object')
      : [];
    return refs.length > 0 || candidates.some((candidate) =>
      Array.isArray(candidate.locatorCandidates) && candidate.locatorCandidates.length > 0 && Boolean(candidate.structuralContext || candidate.stableAttributes),
    );
  };
  // Honest, unconditional signal: does every action already carry a CERTIFIED technical target.
  // Deliberately never true for a `runtime_resolution_required` action -- see its own field doc
  // on `CanonicalInteraction` in the backend contract. Used only for the informational
  // "CONOCIMIENTO TÉCNICO INCOMPLETO" badge; it must never gate execution by itself (that is
  // exactly the first-loss this fixes -- reconstructing executionReady from raw target counts
  // instead of consulting `resolutionState`, which drops the runtime-resolution carve-out the
  // backend's own `evaluateRecordedScenarioExecutionReadiness` already applies).
  const canonicalTechnicalReadiness = canonicalActions.length === 0 || canonicalActions.every(hasCertifiedTarget);
  // Execution-facing per-action gate: mirrors the backend's `allActionsReady` carve-out. An
  // action whose `resolutionState` is `runtime_resolution_required` is not yet certified but is
  // still eligible for Recording Replay to attempt live structural discovery/materialization at
  // runtime -- it must not block execution the way a truly missing/ambiguous/rejected target does.
  const canonicalExecutionActionReadiness = canonicalActions.length === 0 || canonicalActions.every((interaction) =>
    interaction.resolutionState === 'runtime_resolution_required' || hasCertifiedTarget(interaction),
  );
  // The stored readiness projection can lag behind a repaired canonical contract. Recompute
  // execution-facing technical readiness from the action targets and state sequence instead.
  const technicalReadiness = canonicalTechnicalReadiness && scenario.stateSequenceValid !== false;
  const executionActionReadiness = canonicalExecutionActionReadiness && scenario.stateSequenceValid !== false;
  const reviewedOracle = scenario.reviewStatus === 'APPROVED' && Boolean((scenario.reviewedExpectedResult ?? scenario.testRailSteps.at(-1)?.expected)?.trim());
  const oracleReadiness = reviewedOracle || (scenario.readiness?.oracleReadiness ?? scenario.oracleAuthority !== 'review_required');
  const mutationEffectReadiness = scenario.mutationDiagnostics?.rejectionReason !== 'MUTATION_NO_EFFECT'
    && scenario.mutationDiagnostics?.rejectionReason !== 'RUNTIME_DATA_CONSTRAINT_VIOLATION';
  const executionReadiness = functionalReadiness && dataReadiness && executionActionReadiness && mutationEffectReadiness;
  // Promotion (spec generation/reuse/publication) demands full certification: no action may
  // still be pending live re-verification by the runtime resolver, unlike a Recording Replay
  // execution attempt.
  const promotionReadiness = executionReadiness && technicalReadiness;
  const publicationContentReadiness = functionalReadiness && mutationEffectReadiness && scenario.testRailSteps.every((step) => Boolean(step.content?.trim()));
  return { functionalReadiness, dataReadiness, technicalReadiness, oracleReadiness, reviewReadiness: oracleReadiness, publicationContentReadiness, executionReadiness, promotionReadiness, publicationReadiness: functionalReadiness && dataReadiness && publicationContentReadiness, missingInputs };
}

export function readinessBadge(readiness: RecordingReadiness): string {
  if (readiness.missingInputs.length > 0) return `FALTAN ${readiness.missingInputs.length} DATOS`;
  if (readiness.publicationReadiness && !readiness.executionReadiness) return 'LISTO PARA TESTRAIL';
  if (!readiness.oracleReadiness) return 'RESULTADO PENDIENTE DE REVISIÓN';
  if (!readiness.technicalReadiness) return 'CONOCIMIENTO TÉCNICO INCOMPLETO';
  if (!readiness.functionalReadiness) return 'FLUJO FUNCIONAL INCOMPLETO';
  if (readiness.executionReadiness) return 'MCP LISTO';
  return 'BLOQUEADO';
}

export function missingInputLabel(input: RuntimeInputRequirement): string {
  return [input.entityScope, input.semanticField ?? input.valueKey].filter(Boolean).join(' · ');
}
