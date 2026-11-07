import type { RecordedScenario } from '../../services/recordings/types';
import type {
  BindingField,
  BindingParamValue,
  BindingSegment,
  EffectiveBinding,
  ScenarioServiceView,
  ServiceSuggestion,
} from '../../services/service-catalog';
import { groupOtpDatasetRequirements } from './otp-dataset';
import { runtimeRequirementsForScenario } from './recording-readiness';

/**
 * Presentation rules for catalog services (OTP...) bound to recorded fields.
 *
 * What the user binds is a "bindable field": one field, or the six digit fields the panel
 * already shows as a single "Código OTP (6 dígitos)". The engine stores one binding per
 * valueKey; the digits of a group carry a segment so they share one code at run time.
 */

export type BindableField = {
  /** The key the card shows (the first digit for a group). */
  primaryKey: string;
  /** Every valueKey the binding is written to. */
  keys: string[];
  label: string;
};

export type FieldServiceEntry = { effective: EffectiveBinding | null; suggestion: ServiceSuggestion | null };

function datasetRequirements(scenario: RecordedScenario) {
  return runtimeRequirementsForScenario(scenario).filter((requirement) => requirement.valueRole !== 'runtime_derived_oracle');
}

export function bindableFieldsForScenario(scenario: RecordedScenario): BindableField[] {
  return groupOtpDatasetRequirements(datasetRequirements(scenario)).map((requirement) => ({
    primaryKey: requirement.valueKey,
    keys: requirement.otpSegmentKeys ?? [requirement.valueKey],
    label: requirement.semanticField ?? requirement.valueKey,
  }));
}

/** What the engine needs to suggest services and spot missing fields. Values are never sent. */
export function bindingFieldsForScenario(scenario: RecordedScenario): BindingField[] {
  // Typed one character per box: the digits of a grouped code, or one field whose steps
  // carry a segmentPosition (an OTP recorded as "SMS" typed box by box).
  const digitKeys = new Set(bindableFieldsForScenario(scenario).flatMap((field) => (field.keys.length > 1 ? field.keys : [])));
  for (const step of scenario.testRailSteps ?? []) {
    if (step.valueKey && step.segmentPosition) digitKeys.add(step.valueKey);
  }
  return datasetRequirements(scenario).map((requirement) => ({
    key: requirement.valueKey,
    label: requirement.semanticField,
    semanticField: requirement.semanticField,
    controlType: requirement.controlType ?? null,
    sensitive: requirement.sensitive === true,
    segmented: digitKeys.has(requirement.valueKey),
    required: requirement.required,
  }));
}

/** One binding per key; the digits of a group point to the group's first key. */
export function segmentsFor(keys: string[]): Array<{ key: string; segment: BindingSegment | null }> {
  if (keys.length < 2) return keys.map((key) => ({ key, segment: null }));
  return keys.map((key, index) => ({ key, segment: { group: keys[0], position: index + 1 } }));
}

export function fieldEntry(view: ScenarioServiceView | undefined, field: BindableField): FieldServiceEntry | undefined {
  const entry = view?.fields.find((candidate) => candidate.valueKey === field.primaryKey);
  return entry ? { effective: entry.effective, suggestion: entry.suggestion } : undefined;
}

/** Keys a service fills in this scenario: the card hides their input and readiness counts them. */
export function serviceBoundKeys(view: ScenarioServiceView | undefined): Set<string> {
  return new Set((view?.fields ?? []).filter((field) => field.effective?.serviceKey).map((field) => field.valueKey));
}

/**
 * Readiness only: a field the service fills at run time counts as filled. Never sent to the
 * engine, which adds its own placeholder and fetches the real value at the step.
 */
export function withServicePlaceholders(
  values: Record<string, string | undefined>,
  boundKeys: Set<string>,
): Record<string, string | undefined> {
  if (boundKeys.size === 0) return values;
  const result = { ...values };
  for (const key of boundKeys) {
    if (!result[key]?.trim()) result[key] = '000000';
  }
  return result;
}

export function describeBindingParams(
  params: Record<string, BindingParamValue>,
  labelFor: (valueKey: string) => string,
): string {
  const parts: string[] = [];
  const identity = params.identity;
  if (identity && typeof identity === 'object' && 'fromKey' in identity) parts.push(`Identidad ← ${labelFor(identity.fromKey)}`);
  else if (identity && typeof identity === 'object' && 'value' in identity) parts.push(`Identidad fija ${identity.value}`);
  else if (typeof identity === 'string') parts.push(`Identidad fija ${identity}`);
  if (typeof params.channel === 'string' && params.channel) parts.push(`Canal ${params.channel}`);
  if (params.mode === 'latest') parts.push('lee el último token');
  return parts.join(' · ');
}
