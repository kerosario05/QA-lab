import { describe, expect, it } from 'vitest';
import type { RecordedScenario, RuntimeInputRequirement } from '../../services/recordings/types';
import type { ScenarioServiceView } from '../../services/service-catalog';
import {
  bindableFieldsForScenario,
  bindingFieldsForScenario,
  describeBindingParams,
  segmentsFor,
  serviceBoundKeys,
  withServicePlaceholders,
} from './service-binding-ui';

const digits = (): RuntimeInputRequirement[] => Array.from({ length: 6 }, (_, i) => ({
  valueKey: `code_${i + 1}`, semanticField: `OTP digit ${i + 1}`, valueRole: 'secure_input' as const,
  required: true, resolved: false, value: null, source: 'unresolved' as const, stepIndex: i + 4,
}));

const cedula: RuntimeInputRequirement = {
  valueKey: 'cedula', semanticField: 'Cédula', valueRole: 'action_input', required: true,
  resolved: true, value: '001', source: 'RECORDED_CONFIRMED', stepIndex: 1,
};

const scenario = (requirements: RuntimeInputRequirement[]) => ({
  scenarioId: 'sc-1', requiredData: [], runtimeInputRequirements: requirements,
} as unknown as RecordedScenario);

describe('service binding presentation rules', () => {
  it('binds the six digit fields of one code as a single field', () => {
    const fields = bindableFieldsForScenario(scenario([cedula, ...digits()]));
    expect(fields.map((field) => field.keys.length)).toEqual([1, 6]);
    expect(fields[1].primaryKey).toBe('code_1');
    expect(fields[1].label).toBe('Código OTP (6 dígitos)');
  });

  it('tells the engine which fields are digits, never their values', () => {
    const fields = bindingFieldsForScenario(scenario([cedula, ...digits()]));
    expect(fields.find((field) => field.key === 'code_3')?.segmented).toBe(true);
    expect(fields.find((field) => field.key === 'cedula')?.segmented).toBe(false);
    expect(fields.every((field) => !('value' in field))).toBe(true);
  });

  it('a single field typed box by box counts as segmented too (OTP recorded as "SMS")', () => {
    const sms: RuntimeInputRequirement = { ...cedula, valueKey: 'sms', semanticField: 'SMS', valueRole: 'secure_input', value: null };
    const s = { ...scenario([cedula, sms]), testRailSteps: [1, 2].map((segmentPosition) => ({ content: 'x', expected: '', valueKey: 'sms', segmentPosition })) } as unknown as RecordedScenario;
    expect(bindingFieldsForScenario(s).find((field) => field.key === 'sms')?.segmented).toBe(true);
    expect(bindableFieldsForScenario(s).map((field) => field.keys)).toEqual([['cedula'], ['sms']]);
  });

  it('gives each digit its position in the group and a single field none', () => {
    expect(segmentsFor(['otp'])).toEqual([{ key: 'otp', segment: null }]);
    expect(segmentsFor(['d1', 'd2', 'd3'])[2]).toEqual({ key: 'd3', segment: { group: 'd1', position: 3 } });
  });

  it('counts a field the service fills as filled, only for readiness', () => {
    const view: ScenarioServiceView = {
      scenarioId: 'sc-1',
      missing: [],
      fields: [
        { valueKey: 'otp', effective: { valueKey: 'otp', origin: 'general', serviceKey: 'otp.x', params: {}, segment: null, bindingId: 'b' }, suggestion: null },
        { valueKey: 'pin', effective: { valueKey: 'pin', origin: 'manual', serviceKey: null, params: {}, segment: null, bindingId: 'm' }, suggestion: null },
      ],
    };
    const bound = serviceBoundKeys(view);
    expect([...bound]).toEqual(['otp']);
    const values = { otp: '', pin: '', cedula: '001' };
    expect(withServicePlaceholders(values, bound)).toEqual({ otp: '000000', pin: '', cedula: '001' });
    expect(values.otp).toBe('');
    expect(withServicePlaceholders(values, new Set())).toBe(values);
  });

  it('describes the parameters in the words of the form', () => {
    const label = (key: string) => (key === 'cedula' ? 'Cédula' : key);
    expect(describeBindingParams({ identity: { fromKey: 'cedula' }, channel: 'APP' }, label)).toBe('Identidad ← Cédula · Canal APP');
    expect(describeBindingParams({ identity: { value: '009' }, mode: 'latest' }, label)).toBe('Identidad fija 009 · lee el último token');
  });
});
