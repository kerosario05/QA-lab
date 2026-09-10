export interface TRProject {
  id: number;
  name: string;
  announcement: string | null;
  show_announcement: boolean;
  is_completed: boolean;
  completed_on: number | null;
  suite_mode: 1 | 2 | 3; // 1=single, 2=baseline, 3=multiple
  url: string;
}

export interface TRSuite {
  id: number;
  name: string;
  description: string | null;
  project_id: number;
  is_master: boolean;
  is_baseline: boolean;
  is_completed: boolean;
  completed_on: number | null;
  url: string;
}

export interface TRSection {
  id: number;
  suite_id: number;
  parent_id: number | null;
  name: string;
  description: string | null;
  depth: number;
  display_order: number;
}

export interface TRCase {
  id: number;
  title: string;
  section_id: number;
  suite_id: number;
  priority_id: number;
  type_id: number;
  refs: string | null;
  created_by: number;
  created_on: number;
  updated_by: number;
  updated_on: number;
  estimate: string | null;
  estimate_forecast: string | null;
  milestone_id: number | null;
  custom_steps: string | null;
  custom_expected: string | null;
  custom_preconds: string | null;
  normalizedScenario?: unknown;
  inputRequirements?: Array<{
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
    source?: string;
    generated?: boolean;
    verified?: boolean;
    editable?: boolean;
    fieldCapability?: {
      kind: 'text' | 'password' | 'number' | 'email' | 'tel' | 'date' | 'datetime' | 'select' | 'checkbox' | 'radio' | 'file' | 'unknown';
      allowedValues?: string[];
      optionSource?: 'contract' | 'runtime_observed' | 'unknown';
      constraints?: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string; format?: string };
    };
    inputRole?: 'scenario' | 'supporting';
    valuePolicy?: 'scenario_controlled' | 'safe_synthetic' | 'trusted_required' | 'unresolved';
    scenarioDataPolicy?: string;
    provenance?: string;
    inputUsage?: Array<'action' | 'assertion' | 'expected' | string>;
  }>;
  unresolvedPlaceholders?: string[];
  conflicts?: unknown[];
  runtimeTransformStatus?: 'success' | 'error';
  runtimeTransformErrorCode?: string;
}

export interface TRMilestone {
  id: number;
  name: string;
  description: string | null;
  project_id: number;
  is_completed: boolean;
  is_started: boolean;
  completed_on: number | null;
  due_on: number | null;
  started_on: number | null;
  url: string;
}

export interface TRRun {
  id: number;
  suite_id: number;
  name: string;
  description: string | null;
  milestone_id: number | null;
  assignedto_id: number | null;
  include_all: boolean;
  is_completed: boolean;
  completed_on: number | null;
  config: string | null;
  config_ids: number[];
  passed_count: number;
  blocked_count: number;
  untested_count: number;
  retest_count: number;
  failed_count: number;
  custom_status1_count: number;
  project_id: number;
  plan_id: number | null;
  created_by: number;
  created_on: number;
  url: string;
}

export interface TRTest {
  id: number;
  case_id: number;
  run_id: number;
  title: string;
  status_id: TRStatusId;
  assignedto_id: number | null;
  milestone_id: number | null;
  priority_id: number;
  type_id: number;
  refs: string | null;
  estimate: string | null;
  estimate_forecast: string | null;
}

export interface TRResult {
  id: number;
  test_id: number;
  status_id: TRStatusId;
  created_by: number;
  created_on: number;
  assignedto_id: number | null;
  comment: string | null;
  version: string | null;
  elapsed: string | null;
  defects: string | null;
  custom_step_results?: TRStepResult[];
}

export interface TRStepResult {
  content: string;
  expected: string;
  actual: string;
  status_id: TRStatusId;
}

export interface TRAddRunPayload {
  suite_id: number;
  name: string;
  description?: string;
  milestone_id?: number;
  assignedto_id?: number;
  include_all?: boolean;
  case_ids?: number[];
  refs?: string;
}

export interface TRAddResultPayload {
  status_id: TRStatusId;
  comment?: string;
  version?: string;
  elapsed?: string;
  defects?: string;
  assignedto_id?: number;
}

export interface TRAddResultsForCasesPayload {
  results: Array<TRAddResultPayload & { case_id: number }>;
}

export interface TRPaginatedResponse<T> {
  offset: number;
  limit: number;
  size: number;
  _links: { next: string | null; prev: string | null };
  cases?: T[];
  tests?: T[];
  results?: T[];
  runs?: T[];
}

export const TR_STATUS = {
  PASSED: 1,
  BLOCKED: 2,
  UNTESTED: 3,
  RETEST: 4,
  FAILED: 5,
} as const;

export type TRStatusId = (typeof TR_STATUS)[keyof typeof TR_STATUS];
