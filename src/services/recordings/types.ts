export type RecordingPlatform = 'web' | 'android';

export type RecordingStatus =
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'derived'
  | 'failed';

export interface RecordingSummary {
  recordingId: string;
  projectSlug: string;
  appSlug: string;
  platform: RecordingPlatform;
  label?: string;
  status: RecordingStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  eventCount: number;
  screenCount: number;
  actionCount: number;
  hasNarrative: boolean;
  scenarioCount: number;
  errorMessage?: string;
}

/** What the recorder has seen so far — polled while the session is open. */
export interface RecordingLive {
  events: number;
  screens: number;
  currentScreen: string;
}

export interface RecordedScenarioStep {
  content: string;
  expected: string;
}

export interface RecordedDataField {
  key: string;
  label: string;
  stepIndex: number;
  exampleValue?: string;
  sensitive: boolean;
}

/** The identifier one executable step will act on. */
export interface RecordedStepTarget {
  stepIndex: number;
  description: string;
  strategy: string;
  value: string;
  /** The element's identity was shared with others, so this locator rests on its position. */
  ambiguous?: boolean;
}

export interface RecordedScenario {
  scenarioId: string;
  title: string;
  description: string;
  preconditions: string[];
  kind: 'happy_path' | 'negative';
  /**
   * `observed` — every step was performed during the recording, so it can be run back as is.
   * `derived` — the recording justifies the case but never walked it, so its expected result
   * has to be confirmed before the case is executed.
   *
   * Optional because a recording derived before this existed has no value for it.
   */
  provenance?: 'observed' | 'derived';
  /** `segment` scenarios cover the flow up to the end of one screen block. */
  scope?: 'end_to_end' | 'segment';
  mobileSteps: Array<Record<string, unknown>>;
  webSteps: Array<Record<string, unknown>>;
  testRailSteps: RecordedScenarioStep[];
  requiredData: RecordedDataField[];
  /** Locator behind each executable step, for review before automating. */
  stepTargets?: RecordedStepTarget[];
  sourceRecordingId: string;
  /** True when a step rests on an approximate hit test rather than a real locator. */
  hasUncertainSteps: boolean;
  /** Present once the scenario has been published as a TestRail case. */
  testRailCaseId?: number;
}

export interface DeriveResult {
  summary: RecordingSummary;
  scenarios: RecordedScenario[];
  narrative: string;
}

export interface TestRailPublishResult {
  ok: boolean;
  sectionId: string;
  /** Resolved from TestRail when the section could be read — nicer to show than the id. */
  sectionName?: string;
  projectId?: string;
  suiteId?: string;
  created: Array<{ scenarioId: string; caseId: number; title: string }>;
  failed: Array<{ scenarioId: string; message: string }>;
}
