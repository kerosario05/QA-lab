import { describe, expect, it } from 'vitest';
import { isQaOverridableRuntimeInput, readinessBadge, resolveScenarioReadiness, runtimeRequirementsForScenario } from './recording-readiness';
import type { RecordedScenario } from '../../services/recordings/types';

function scenario(): RecordedScenario {
  return {
    scenarioId: 'repeat',
    title: 'repeat',
    description: 'repeat',
    preconditions: [],
    kind: 'happy_path',
    provenance: 'derived',
    mobileSteps: [],
    webSteps: [],
    testRailSteps: [{ content: 'final', expected: '' }],
    requiredData: [],
    sourceRecordingId: 'recording-test',
    hasUncertainSteps: false,
    readiness: {
      functionalReadiness: true,
      dataReadiness: false,
      technicalReadiness: true,
      oracleReadiness: false,
      executionReadiness: false,
      publicationReadiness: false,
      missingInputs: [],
    },
    runtimeInputRequirements: [
      { valueKey: 'entity_2.document', semanticField: 'Document', entityScope: 'entity_2', valueRole: 'action_input', required: true, value: null, source: 'unresolved', resolved: false },
      { valueKey: 'entity_2.oracle', semanticField: 'Oracle', entityScope: 'entity_2', valueRole: 'runtime_derived_oracle', required: false, value: null, source: 'RECORDED_CONFIRMED', resolved: true, readOnly: true },
    ],
  };
}

describe('Recording runtime input gate', () => {
  it('keeps prefilled business runtime inputs editable', () => {
    const result = runtimeRequirementsForScenario({
      ...scenario(),
      runtimeInputRequirements: [{ valueKey: 'entity_1.name', semanticField: 'Name', valueRole: 'action_input', required: true, value: 'Alice', source: 'RECORDED_CONFIRMED', resolved: true }],
    })[0]!;
    expect(result.editable).toBe(true);
    expect(isQaOverridableRuntimeInput(result)).toBe(true);
  });

  it('keeps sensitive business inputs editable while masked', () => {
    const result = runtimeRequirementsForScenario({
      ...scenario(),
      runtimeInputRequirements: [{ valueKey: 'auth.password', semanticField: 'Password', valueRole: 'secure_input', required: true, value: 'secret', source: 'secure', resolved: true, sensitive: true, masked: true }],
    })[0]!;
    expect(result.editable).toBe(true);
    expect(result.masked).toBe(true);
    expect(isQaOverridableRuntimeInput(result)).toBe(true);
  });

  it('blocks only explicit derived/read-only metadata', () => {
    expect(isQaOverridableRuntimeInput({ valueRole: 'runtime_derived_oracle', readOnly: true })).toBe(false);
    expect(isQaOverridableRuntimeInput({ valueRole: 'action_input', computed: true })).toBe(false);
    expect(isQaOverridableRuntimeInput({ valueRole: 'action_input', systemGenerated: true })).toBe(false);
  });

  it('keeps the value-key edit source as CURRENT_QA_EDIT in readiness', () => {
    const readiness = resolveScenarioReadiness(scenario(), { 'entity_2.document': 'ABC' });
    expect(readiness.missingInputs).toHaveLength(0);
    const edited = runtimeRequirementsForScenario(scenario()).find((input) => input.valueKey === 'entity_2.document');
    expect(edited?.valueKey).toBe('entity_2.document');
  });

  it('materializes unresolved new entity inputs and blocks MCP/TestRail', () => {
    const readiness = resolveScenarioReadiness(scenario(), {});
    expect(runtimeRequirementsForScenario(scenario())[0]?.value).toBeNull();
    expect(readiness.missingInputs.map((input) => input.valueKey)).toEqual(['entity_2.document']);
    expect(readiness.dataReadiness).toBe(false);
    expect(readiness.executionReadiness).toBe(false);
    expect(readiness.publicationReadiness).toBe(false);
  });

  it('unblocks exploratory execution after QA fills data while oracle stays missing', () => {
    const readiness = resolveScenarioReadiness(scenario(), { 'entity_2.document': 'ABC' });
    expect(readiness.dataReadiness).toBe(true);
    expect(readiness.executionReadiness).toBe(true);
    expect(readiness.oracleReadiness).toBe(false);
    expect(readiness.publicationReadiness).toBe(true);
    expect(readiness.missingInputs).toHaveLength(0);
  });

  it('revalidates unique runtime inputs by valueKey instead of the visible label', () => {
    const uniqueRepeat = {
      ...scenario(),
      runtimeInputRequirements: [
        { valueKey: 'entity_1.colaborador', semanticField: 'Colaborador', entityScope: 'entity_1', valueRole: 'action_input' as const, required: true, value: 'A', source: 'RECORDED_CONFIRMED' as const, resolved: true },
        { valueKey: 'entity_2.colaborador', semanticField: 'Colaborador adicional', entityScope: 'entity_2', valueRole: 'action_input' as const, required: true, value: null, source: 'unresolved' as const, resolved: false, editable: true, constraints: [{ type: 'uniqueWithinCollection', uniqueWithinCollection: true }] },
      ],
    };
    const duplicate = resolveScenarioReadiness(uniqueRepeat, { 'entity_2.colaborador': 'A' });
    expect(duplicate.dataReadiness).toBe(false);
    expect(duplicate.executionReadiness).toBe(false);

    const distinct = resolveScenarioReadiness(uniqueRepeat, { 'entity_2.colaborador': 'C' });
    expect(distinct.dataReadiness).toBe(true);
    expect(distinct.executionReadiness).toBe(true);
    expect(runtimeRequirementsForScenario(uniqueRepeat).find((input) => input.valueKey === 'entity_2.colaborador')?.editable).toBe(true);
  });

  it('does not render a false blocked zero-input badge when only oracle review is missing', () => {
    const readiness = resolveScenarioReadiness(scenario(), { 'entity_2.document': 'ABC' });
    expect(readiness.missingInputs).toHaveLength(0);
    expect(readiness.oracleReadiness).toBe(false);
    expect(readinessBadge(readiness)).toBe('RESULTADO PENDIENTE DE REVISIÓN');
    expect(readinessBadge(readiness)).not.toContain('0 INPUTS');
  });

  it('keeps a mutation with no materialization effect blocked', () => {
    const candidate = { ...scenario(), runtimeInputRequirements: [], mutationDiagnostics: {
      materializedSemanticSignature: 'same',
      primarySemanticSignature: 'same',
      stepsAdded: 0,
      stepsRemoved: 0,
      stepsReplaced: 0,
      entityScopesAdded: [],
      valueKeysAdded: [],
      valueKeysRemoved: [],
      rejectionReason: 'MUTATION_NO_EFFECT' as const,
    } };
    const readiness = resolveScenarioReadiness(candidate, {});
    expect(readiness.executionReadiness).toBe(false);
    expect(readinessBadge(readiness)).toBe('RESULTADO PENDIENTE DE REVISIÓN');
  });

  it('allows explicit QA oracle review to unlock publication', () => {
    const reviewed = { ...scenario(), reviewStatus: 'APPROVED' as const, reviewedExpectedResult: 'El registro queda disponible' };
    const readiness = resolveScenarioReadiness(reviewed, { 'entity_2.document': 'ABC' });
    expect(readiness.oracleReadiness).toBe(true);
    expect(readiness.publicationReadiness).toBe(true);
  });
});
