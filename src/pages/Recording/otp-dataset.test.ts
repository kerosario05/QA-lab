import { describe, expect, it } from 'vitest';
import type { RuntimeInputRequirement } from '../../services/recordings/types';
import { groupOtpDatasetRequirements, otpSegmentValues } from './otp-dataset';

const fields = (): RuntimeInputRequirement[] => Array.from({ length: 6 }, (_, i) => ({
  valueKey: `code_${i + 1}`, semanticField: i === 0 ? 'Please enter verification code. Digit 1' : `OTP digit ${i + 1}`,
  valueRole: 'secure_input', required: true, resolved: false, value: null, source: 'unresolved', stepIndex: 10 + i,
}));

describe('OTP dataset presentation and per-step transport', () => {
  it('offers one field for six explicit contiguous OTP digits and keeps each original key', () => {
    const grouped = groupOtpDatasetRequirements(fields());
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sensitive).toBe(true);
    expect(otpSegmentValues(grouped[0].otpSegmentKeys!, '739205')).toEqual([
      ['code_1', '7'], ['code_2', '3'], ['code_3', '9'], ['code_4', '2'], ['code_5', '0'], ['code_6', '5'],
    ]);
    expect(otpSegmentValues(grouped[0].otpSegmentKeys!, '')).toEqual(fields().map((field) => [field.valueKey, '']));
  });
  it('preserves ordinary inputs and rejects incomplete, reordered, mixed-scope or noncontiguous groups', () => {
    const native = { ...fields()[0], semanticField: 'Document' };
    expect(groupOtpDatasetRequirements([native, ...fields()])).toHaveLength(2);
    for (const variant of [fields().slice(0, 5), fields().reverse(), fields().map((f, i) => i === 2 ? { ...f, entityScope: 'other' } : f), fields().map((f, i) => i === 2 ? { ...f, stepIndex: 99 } : f)]) {
      expect(groupOtpDatasetRequirements(variant).every((field) => !field.otpSegmentKeys)).toBe(true);
    }
  });
});
