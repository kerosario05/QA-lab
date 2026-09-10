import { describe, it, expect } from 'vitest';
import { composeSelectedInputRequirements } from './input-requirements';
import { groupRuntimeInputRequirements } from './input-requirements';
import {
  buildRuntimeEntriesByCase,
  createInputRequirementValues,
  getCommonRequirementKeys,
  isLaunchBlocked,
  resolveRuntimeInputValue,
  setByCaseValue,
  setSharedValue,
} from './input-requirements-values';

describe('composeSelectedInputRequirements', () => {
  it('promotes keys present in all selected cases to shared and keeps the rest per case', () => {
    const cases = [
      {
        id: 1,
        inputRequirements: [
          { key: 'auth.username', label: 'Usuario', controlType: 'text', required: true, sensitive: false },
          { key: 'auth.password', label: 'Contraseña', controlType: 'password', required: true, sensitive: true },
        ],
      },
      {
        id: 2,
        inputRequirements: [
          { key: 'auth.username', label: 'Usuario', controlType: 'text', required: true, sensitive: false },
          { key: 'employee.document', label: 'Documento', controlType: 'text', required: true, sensitive: true },
        ],
      },
    ];
    const result = composeSelectedInputRequirements(cases as any, [1, 2]);
    expect(result.shared.map((r) => r.key)).toEqual(['auth.username']);
    expect(result.byCase['1'].map((r) => r.key)).toEqual(['auth.password']);
    expect(result.byCase['2'].map((r) => r.key)).toEqual(['employee.document']);
  });

  it('shares the same exact key even when display metadata differs', () => {
    const cases = [
      { id: 1, inputRequirements: [{ key: 'auth.password', sensitive: true, controlType: 'password' }] },
      { id: 2, inputRequirements: [{ key: 'auth.password', sensitive: false, controlType: 'text' }] },
    ];
    const result = composeSelectedInputRequirements(cases as any, [1, 2]);
    expect(result.shared).toEqual([{ key: 'auth.password', sensitive: true, controlType: 'password' }]);
    expect(result.byCase['1']).toEqual([]);
    expect(result.byCase['2']).toEqual([]);
  });

  it('returns empty output when no cases are selected', () => {
    const cases = [{ id: 1, inputRequirements: [{ key: 'auth.username' }] }];
    const result = composeSelectedInputRequirements(cases as any, []);
    expect(result.shared).toEqual([]);
    expect(result.byCase).toEqual({});
  });

  it('does not classify requirements as common when only one case is selected', () => {
    const result = composeSelectedInputRequirements([
      { id: 1, inputRequirements: [{ key: 'auth.username' }, { key: 'auth.password' }] },
    ] as any, [1]);

    expect(result.shared).toEqual([]);
    expect(result.byCase['1'].map((requirement) => requirement.key)).toEqual(['auth.username', 'auth.password']);
  });

  it('dedupes only by canonical key and preserves same-label fields', () => {
    const result = composeSelectedInputRequirements([
      { id: 1, inputRequirements: [
        { key: 'entity_1.document', label: 'Colaborador', required: true },
        { key: 'entity_2.document', label: 'Colaborador', required: true },
        { key: 'entity_2.document', label: 'Duplicado', required: true },
      ] },
    ], [1]);

    expect(result.byCase['1'].map((requirement) => requirement.key)).toEqual([
      'entity_1.document', 'entity_2.document',
    ]);
    const grouped = groupRuntimeInputRequirements(result.byCase['1']);
    expect(grouped.groups.map((group) => group.label)).toEqual(['Dataset/Entidad 1', 'Dataset/Entidad 2']);
    expect(grouped.groups.flatMap((group) => group.requirements.map((item) => item.inputKey))).toEqual([
      'entity_1.document', 'entity_2.document',
    ]);
    expect(grouped.groups.flatMap((group) => group.requirements.map((item) => item.displayLabel))).toEqual([
      'Colaborador', 'Colaborador',
    ]);
  });

  it('supports bracket-indexed datasets without depending on the entity name', () => {
    const grouped = groupRuntimeInputRequirements([
      { key: 'item[0].value', label: 'Valor' },
      { key: 'item[1].value', label: 'Valor' },
    ]);
    expect(grouped.groups.map((group) => group.label)).toEqual(['Dataset/Entidad 0', 'Dataset/Entidad 1']);
  });
});

describe('inputRequirements values', () => {
  const composition = {
    shared: [{ key: 'auth.username', label: 'Usuario', controlType: 'text', required: true, sensitive: false }],
    byCase: {
      '1': [{ key: 'auth.password', label: 'Contraseña', controlType: 'password', required: true, sensitive: true }],
      '2': [{ key: 'employee.document', label: 'Documento', controlType: 'text', required: true, sensitive: true }],
    },
  };

  it('copies a shared value to every selected case in runtimeEntriesByCase', () => {
    let values = createInputRequirementValues();
    values = setSharedValue(values, 'auth.username', 'user-a');
    values = setByCaseValue(values, '1', 'auth.password', 'secret-1');
    values = setByCaseValue(values, '2', 'employee.document', 'DOC-2');

    const entries = buildRuntimeEntriesByCase(composition as any, values, [1, 2]);
    expect(entries?.['1']).toContainEqual({ key: 'auth.username', value: 'user-a', source: 'manual_runtime', sensitive: false });
    expect(entries?.['2']).toContainEqual({ key: 'auth.username', value: 'user-a', source: 'manual_runtime', sensitive: false });
  });

  it('keeps a case-specific requirement scoped to its own caseId', () => {
    let values = createInputRequirementValues();
    values = setSharedValue(values, 'auth.username', 'user-a');
    values = setByCaseValue(values, '2', 'employee.document', 'DOC-2');

    const entries = buildRuntimeEntriesByCase(composition as any, values, [1, 2]);
    expect(entries?.['1'].map((e) => e.key)).not.toContain('employee.document');
    expect(entries?.['2'].map((e) => e.key)).toContain('employee.document');
  });

  it('preserves key-to-value mapping when visual labels are identical', () => {
    let values = createInputRequirementValues();
    values = setByCaseValue(values, '1', 'entity_1.document', 'value-one');
    values = setByCaseValue(values, '1', 'entity_2.document', 'value-two');
    const entries = buildRuntimeEntriesByCase({
      shared: [],
      byCase: {
        '1': [
          { key: 'entity_1.document', label: 'Dato', required: true },
          { key: 'entity_2.document', label: 'Dato', required: true },
        ],
      },
    } as any, values, [1]);

    expect(entries?.['1']).toEqual([
      expect.objectContaining({ key: 'entity_1.document', value: 'value-one' }),
      expect.objectContaining({ key: 'entity_2.document', value: 'value-two' }),
    ]);
  });

  it('blocks the launch when a required value is missing', () => {
    let values = createInputRequirementValues();
    values = setSharedValue(values, 'auth.username', '');
    const blocked = isLaunchBlocked(composition as any, values);
    expect(blocked).toBe(true);
  });

  it('does not block the launch when all required values are complete', () => {
    let values = createInputRequirementValues();
    values = setSharedValue(values, 'auth.username', 'user-a');
    values = setByCaseValue(values, '1', 'auth.password', 'secret-1');
    values = setByCaseValue(values, '2', 'employee.document', 'DOC-2');
    const blocked = isLaunchBlocked(composition as any, values);
    expect(blocked).toBe(false);
  });

  it('detects common requirements by exact key, never by label', () => {
    const result = getCommonRequirementKeys([
      { id: 1, inputRequirements: [{ key: 'auth.username', label: 'Usuario' }, { key: 'auth.password', label: 'Clave' }] },
      { id: 2, inputRequirements: [{ key: 'auth.username', label: 'Nombre' }, { key: 'account.password', label: 'Clave' }] },
    ], [1, 2]);

    expect(result).toEqual(['auth.username']);
  });

  it('resolves override before common and existing case values', () => {
    expect(resolveRuntimeInputValue({
      caseId: 2,
      key: 'auth.username',
      commonValues: { 'auth.username': 'common' },
      overridesByCaseId: { '2': { 'auth.username': 'override' } },
      existingByCase: { '2': { 'auth.username': 'existing' } },
    })).toBe('override');
    expect(resolveRuntimeInputValue({
      caseId: 1,
      key: 'auth.username',
      commonValues: { 'auth.username': 'common' },
      overridesByCaseId: {},
      existingByCase: { '1': { 'auth.username': 'existing' } },
    })).toBe('common');
  });

  it('resolves runtime values by canonical key without using labels or positions', () => {
    expect(resolveRuntimeInputValue({
      caseId: 1,
      key: 'Entity_1.Email',
      commonValues: {},
      overridesByCaseId: {},
      existingByCase: { '1': { 'entity_1.email': 'known@example.test' } },
    })).toBe('known@example.test');
  });

  it('materializes common values and preserves a per-case override', () => {
    let values = createInputRequirementValues();
    values = setSharedValue(values, 'auth.username', 'user1');
    const entries = buildRuntimeEntriesByCase(
      { shared: [{ key: 'auth.username', sensitive: false }], byCase: {} } as any,
      values,
      [1, 2],
      { '2': { 'auth.username': 'user2' } },
    );

    expect(entries?.['1'][0].value).toBe('user1');
    expect(entries?.['2'][0].value).toBe('user2');
  });
});
