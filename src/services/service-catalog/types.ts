/** Mirrors the engine's service catalog contract (src/service-catalog in the automation engine). */

export type ServiceCategory = 'otp' | 'token' | 'codigo';

export interface ServiceSettingDefinition {
  key: string;
  label: string;
  description?: string;
  kind: 'text' | 'list' | 'environments';
  required: boolean;
}

export interface ServiceParamDefinition {
  key: string;
  label: string;
  description?: string;
  /** `field_ref`: taken from another field of the same scenario (e.g. the cédula). */
  kind: 'text' | 'field_ref' | 'select';
  required: boolean;
  options?: string[];
}

export interface ServiceAvailability {
  available: boolean;
  reasons: string[];
  environment: string;
}

export interface CatalogService {
  key: string;
  name: string;
  category: ServiceCategory;
  description: string;
  source: string;
  output: { kind: 'code'; length?: number; segmented: boolean };
  settings: ServiceSettingDefinition[];
  params: ServiceParamDefinition[];
  availability: ServiceAvailability;
  /** Projects (the caller may see) where the service is configured. */
  projects: Array<{ slug: string; enabled: boolean; legacy: boolean }>;
}

export interface OtpServiceSettings {
  defaultChannel: string | null;
  allowedChannels: string[];
  enabledEnvironments: string[];
}

export interface ProjectServiceEntry {
  serviceKey: string;
  name: string;
  category: ServiceCategory;
  configured: boolean;
  enabled: boolean;
  settings: OtpServiceSettings & Record<string, unknown>;
  /** Read from the old per-project OTP table; saving moves it to the catalog. */
  legacy: boolean;
  updatedAt: string | null;
}

export interface ServiceTestResult {
  ok: true;
  /** The code the service generated; only the test call returns it. */
  value: string;
  valueLength: number;
  meta: Record<string, string | number | boolean>;
  durationMs: number;
}

// --- bindings (which service fills which scenario field) --------------------

export type BindingOwnerType = 'recording' | 'test_design_story' | 'case';

export type BindingParamValue = string | { fromKey: string } | { value: string };

/** One character of a code recorded as separate fields (OTP digit 1..6): all share one value. */
export interface BindingSegment {
  group: string;
  position: number;
}

export interface ServiceBinding {
  id: string;
  projectSlug: string;
  ownerType: BindingOwnerType;
  ownerId: string;
  /** '' = general form of the owner. */
  scenarioId: string;
  targetValueKey: string;
  /** null = this scenario types the value by hand. */
  serviceKey: string | null;
  params: Record<string, BindingParamValue>;
  segment: BindingSegment | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface BindingOwnerRef {
  projectSlug: string;
  ownerType: BindingOwnerType;
  ownerId: string;
}

export interface BindingField {
  key: string;
  label?: string | null;
  semanticField?: string | null;
  controlType?: string | null;
  sensitive?: boolean;
  segmented?: boolean;
  required?: boolean;
  value?: string | null;
}

export interface EffectiveBinding {
  valueKey: string;
  origin: 'scenario' | 'general' | 'manual';
  serviceKey: string | null;
  params: Record<string, BindingParamValue>;
  segment: BindingSegment | null;
  bindingId: string;
}

export interface ServiceSuggestion {
  serviceKey: string;
  params: Record<string, BindingParamValue>;
  reason: string;
}

export interface ScenarioServiceView {
  scenarioId: string;
  fields: Array<{ valueKey: string; effective: EffectiveBinding | null; suggestion: ServiceSuggestion | null }>;
  missing: string[];
}

export interface ServiceBindingsView {
  enabledServices: Array<Pick<CatalogService, 'key' | 'name' | 'category' | 'params'>>;
  general: ServiceBinding[];
  scenarios: ScenarioServiceView[];
}
