import type { RuntimeInputRequirement } from '../../services/recordings/types';

export type DatasetDisplayRequirement = RuntimeInputRequirement & { otpSegmentKeys?: string[] };

// Presentation grouping only. Each observed action keeps its own locator and value binding.
export function groupOtpDatasetRequirements(requirements: RuntimeInputRequirement[]): DatasetDisplayRequirement[] {
  const result: DatasetDisplayRequirement[] = [];
  for (let index = 0; index < requirements.length; index += 1) {
    const group = requirements.slice(index, index + 6);
    const complete = group.length === 6 && group.every((field, position) => {
      const label = field.semanticField ?? '';
      const digit = label.match(/(?:digit|dígito|digito)\s*(\d+)\s*$/i);
      return /(?:\botp\b|verification code|c[oó]digo de verificaci[oó]n)/i.test(label)
        && Number(digit?.[1]) === position + 1
        && field.entityScope === group[0].entityScope
        && typeof field.stepIndex === 'number'
        && field.stepIndex === (group[0].stepIndex ?? -1) + position
        && field.valueRole !== 'runtime_derived_oracle';
    }) && new Set(group.map((field) => field.valueKey)).size === 6;
    if (!complete) { result.push(requirements[index]); continue; }
    result.push({ ...group[0], semanticField: 'Código OTP (6 dígitos)', sensitive: true, masked: true,
      required: group.some((field) => field.required),
      editable: group.every((field) => field.editable !== false && !field.readOnly && !field.computed && !field.systemGenerated),
      otpSegmentKeys: group.map((field) => field.valueKey) });
    index += 5;
  }
  return result;
}

export function otpSegmentValues(keys: readonly string[], value: string): Array<[string, string]> {
  return keys.map((key, index) => [key, value[index] ?? '']);
}
