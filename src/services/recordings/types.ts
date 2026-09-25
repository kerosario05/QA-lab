export type RecordingPlatform = 'web' | 'android';

export type RecordingStatus =
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'derived'
  | 'failed';

export interface RecordingDataPolicy {
  persistRecordedValues: boolean;
  persistQaCredentials: boolean;
  includeQaCredentialsInTestRail: boolean;
}

export interface RecordingGoal {
  declaredGoal?: string;
  normalizedGoal?: string;
  provenance: 'USER_DECLARED' | 'LEGACY_LABEL';
  needsReview: boolean;
}

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
  recordingGoal?: string;
  errorMessage?: string;
}

export interface RecordingLifecycle {
  recordingExists: boolean;
  traceReady: boolean;
  semanticReady: boolean;
  scenariosReady: boolean;
}

export interface RecordingScenarioRejection {
  scenarioId: string;
  reasons: string[];
}

export interface RecordingReplayAdmission {
  requestedCount: number;
  eligibleCount: number;
  acceptedCount: number;
  requestedRejectedCount: number;
  requestedRejectedScenarioIds: string[];
  requestedRejectedScenarios: RecordingScenarioRejection[];
  nonRequestedRejectedCandidates: RecordingScenarioRejection[];
}

/** What the recorder has seen so far — polled while the session is open. */
export interface RecordingLive {
  events: number;
  screens: number;
  currentScreen: string;
  semanticRefreshCount?: number;
  noiseRefreshSkipped?: number;
  semanticModel?: SemanticRecordingModel;
  scenarios?: RecordedScenario[];
}

export interface RecordedScenarioStep {
  content: string;
  renderedStep?: string;
  stepTemplate?: string;
  /** Backend-owned display ordinal. The UI must not add a second ordinal. */
  stepNumber?: number;
  isSetup?: boolean;
  valueKey?: string;
  sensitive?: boolean;
  expected: string;
  expectedType?: 'BUSINESS_ORACLE' | 'TECHNICAL_STATE';
  classification?: string;
  entityScope?: string;
  interactionId?: string;
  sourceEventRefs?: string[];
  screenBeforeRef?: string;
  screenAfterRef?: string;
  routeBefore?: string;
  routeAfter?: string;
  stateScope?: string;
}

export interface RuntimeInputRequirement {
  valueKey: string;
  semanticField: string | null;
  entityScope?: string;
  valueRole: 'action_input' | 'secure_input' | 'runtime_derived_oracle';
  required: boolean;
  value: string | null;
  source: 'RECORDED_CONFIRMED' | 'CURRENT_QA_EDIT' | 'QA_EDIT' | 'secure' | 'confirmed_dataset' | 'project_config' | 'unresolved';
  resolved: boolean;
  editable?: boolean;
  sensitive?: boolean;
  stepIndex?: number;
  controlType?: string;
  allowedValues?: string[];
  technicalTargetRefs?: string[];
  sourceEventRefs?: string[];
  validatedByInteraction?: boolean;
  constraints?: Array<{
    type: string;
    uniqueWithinCollection?: boolean;
    value?: string;
    source?: string;
  }>;
  authority?: 'explicit_qa_edit' | 'canonical_logical' | 'canonical_committed' | 'recorded_confirmed' | 'unresolved';
  authorityValue?: string | null;
  sourceAuthority?: 'CLONED_CONFIRMED_VALUE' | 'EXPLICIT_MUTATION' | 'SYSTEM_GENERATED' | 'UNRESOLVED';
  humanLabel?: string;
  entityHumanLabel?: string;
  valueRoleLabel?: string;
  readOnly?: boolean;
  computed?: boolean;
  systemGenerated?: boolean;
  masked?: boolean;
}

export interface RecordingReadiness {
  functionalReadiness: boolean;
  dataReadiness: boolean;
  technicalReadiness: boolean;
  oracleReadiness: boolean;
  reviewReadiness?: boolean;
  publicationContentReadiness?: boolean;
  executionReadiness: boolean;
  /**
   * A Recording Replay execution attempt may proceed with a `runtime_resolution_required`
   * action still pending live re-verification; promotion (spec generation/reuse/publication)
   * never may. False while `executionReadiness` is false OR any action still lacks a certified
   * technical target.
   */
  promotionReadiness?: boolean;
  publicationReadiness: boolean;
  missingInputs: RuntimeInputRequirement[];
}

export interface RecordedDataField {
  key: string;
  label: string;
  semanticField?: string | null;
  stepIndex: number;
  exampleValue?: string;
  sensitive: boolean;
  valueRole?: 'action_input' | 'secure_input' | 'runtime_derived_oracle';
  source?: 'RECORDED_CONFIRMED' | 'secure' | 'OBSERVED';
  confidence?: number;
  needsReview?: boolean;
  reviewReason?: string;
  formatHint?: string;
  entityScope?: string;
  technicalTargetRefs?: string[];
  sourceEventRefs?: string[];
  validatedByInteraction?: boolean;
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
  primary?: boolean;
  status?: 'IN_PROGRESS' | 'COMPLETED';
  goalRelevanceScore?: number;
  goalRelevanceReasons?: string[];
  sourceEventRefs?: string[];
  oracleAuthority?: 'observed_only' | 'review_required';
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedExpectedResult?: string;
  suggestionCategory?: 'DERIVED_ALTERNATIVE' | 'DERIVED_VALIDATION' | 'AI_PROPOSED';
  confidence?: number;
  rationale?: string;
  sharedSetupRef?: string;
  sharedSetupSteps?: RecordedScenarioStep[];
  scenarioSpecificSteps?: RecordedScenarioStep[];
  quality?: {
    hasGoalContext: boolean;
    hasReachableSetup: boolean;
    hasScenarioSpecificIntent: boolean;
    hasEvidence: boolean;
    hasOracleAuthorityOrReview: boolean;
    noInventedControl: boolean;
    noUnsupportedExpectedResult: boolean;
    noGenericNegativeFromFieldOnly: boolean;
    finalDecision: 'accepted' | 'rejected';
    rejectionReason?: string;
  };
  traceBacked?: boolean;
  containsUnexecutedActions?: boolean;
  replayEligible?: boolean;
  functionalReadiness?: boolean;
  technicalReadiness?: boolean;
  /** Present once the scenario has been published as a TestRail case. */
  testRailCaseId?: number;
  canonicalInteractions?: Array<Record<string, unknown>>;
  entityActionBlocks?: Array<Record<string, unknown>>;
  runtimeInputRequirements?: RuntimeInputRequirement[];
  readiness?: RecordingReadiness;
  technicalKnowledgeRefs?: string[];
  mutation?: { mutationType: string; [key: string]: unknown };
  mutationDiagnostics?: {
    materializedSemanticSignature: string;
    primarySemanticSignature: string;
    stepsAdded: number;
    stepsRemoved: number;
    stepsReplaced: number;
    entityScopesAdded: string[];
    valueKeysAdded: string[];
    valueKeysRemoved: string[];
    rejectionReason?: 'MUTATION_NO_EFFECT' | 'RUNTIME_DATA_CONSTRAINT_VIOLATION';
  };
  scenarioStepCount?: number;
  functionalActionCount?: number;
  nonUserSetupSteps?: number;
  reasonForDifference?: string;
  stateSequenceValid?: boolean;
  stateSequenceIssues?: string[];
  scenarioGoal?: string;
  goalContract?: { nonGeneric: boolean; goalCoherent: boolean; mutationIntentExpressed: boolean };
  postGoalObservations?: string[];
  runtimeDataset?: ScenarioRuntimeDataset;
}

export interface ScenarioRuntimeDataset {
  scenarioId: string;
  requirements: RuntimeInputRequirement[];
  resolvedValues: Record<string, string>;
  missingValues: RuntimeInputRequirement[];
}

export interface DeriveResult {
  summary: RecordingSummary;
  scenarios: RecordedScenario[];
  narrative: string;
  semanticModel?: SemanticRecordingModel;
  derivation?: DerivationMetadata;
}

export interface DerivationMetadata {
  version: number;
  generatedAt: string;
  executed: true;
  primaryCount: number;
  suggestionCount: number;
  opportunitiesDetected?: number;
  candidatesGenerated?: number;
  rejectedBecause?: string[];
}

export interface SemanticRecordingModel {
  version: string;
  recordingId: string;
  projectSlug: string;
  platform: RecordingPlatform;
  recordingGoal?: RecordingGoal;
  recordingDataPolicy: RecordingDataPolicy;
  primaryScenario?: {
    scenarioId: string;
    title: string;
    provenance: 'OBSERVED';
    sourceEventRefs: string[];
    traceBacked: true;
    containsUnexecutedActions: false;
    needsReview: boolean;
    status?: 'IN_PROGRESS' | 'COMPLETED';
  };
  semanticScreens: Array<{ screenIdentity: string; title?: string; classification: string }>;
  semanticComponents: Array<{
    componentId: string;
    componentType: string;
    compoundField?: boolean;
    label?: string;
    observationRefs?: string[];
    children?: Array<{
      semanticRole: string;
      affordance: string;
      technicalTargetRef: string;
      valueKey?: string;
      recordedValue?: string;
      technicalObservationRefs?: string[];
      lifecycle?: { selectedOption?: string; committedState?: string; observationWindowMs?: number };
      confidence?: number;
      needsReview?: boolean;
    }>;
  }>;
  semanticEvents: Array<{ eventRef: string; action: string; provenance: string; field?: string | null; valueKey?: string; beforeState?: string; afterState?: string; technicalTargetRef?: string }>;
  datasets: Array<{ valueKey: string; semanticField: string | null; valueRole: string; value?: string; rawTypedValue?: string; committedValue?: string; displayValue?: string; sensitive: boolean; verified: boolean; confidence?: number; needsReview?: boolean; reviewReason?: string; formatHint?: string }>;
  selectorOptionInventories?: Array<{ selectorRef: string; semanticField: string | null; entityScope?: string; surfaceRef: string; options: string[]; selectedOption?: string; observationRefs: string[] }>;
  technicalObservations: Array<{
    observationId: string;
    status: string;
    componentType: string;
    label?: string;
    attributes?: Record<string, string>;
    semanticField?: string | null;
    technicalTargetRef: string;
    role?: string;
    tag?: string;
    placeholder?: string;
    containerContext?: string;
    gridRef?: string;
    cellRef?: string;
    headerRef?: string;
    containerIdentity?: string;
    entityScope?: string;
    rowIdentity?: string;
    columnIdentity?: string;
    headerContext?: string;
    locatorCandidates: Array<{ strategy: string; value: string; confidence?: number; ambiguous?: boolean }>;
    beforeValue?: string;
    afterValue?: string;
    observedOptions?: string[];
    compoundRole?: 'selection' | 'amount_or_text';
    editorLifecycle?: string;
    stateTransitions?: string[];
    dynamicLifecycle?: { triggerTechnicalTarget?: string; activatedTechnicalTarget?: string; options?: string[]; selectedOption?: string; committedState?: string; focusTransfer?: { from?: string; to?: string }; mutationSummary?: string[]; observationWindowMs?: number };
    validatedByInteraction?: boolean;
    needsReview?: boolean;
    confidence?: number;
    formatHint?: string;
    editingSessionRef?: string;
    inputValue?: string;
    committedValue?: string;
    displayValue?: string;
    selectorControlId?: string;
    optionSurfaceId?: string;
    selectedOptionObserved?: string;
    optionInventoryObserved?: boolean;
  }>;
  editingSessions?: Array<{
    editingSessionId: string;
    controlIdentity: string;
    screenIdentity: string;
    startedAt: number;
    endedAt: number;
    rawEventRefs: string[];
    initialValue?: string;
    intermediateValues: string[];
    finalValue?: string;
    inputValue?: string;
    committedValue?: string;
    displayValue?: string;
    commitReason: string;
    semanticField?: string;
    technicalTargetRefs: string[];
    compoundRole?: 'selection' | 'amount_or_text';
    needsReview?: boolean;
    reviewReason?: string;
  }>;
  scenarioSuggestions: Array<{ suggestionId: string; title: string; provenance: string; needsReview: boolean; goalRelevanceScore?: number; goalRelevanceReasons?: string[]; sharedSetupRef?: string; scenarioSpecificSteps?: string[]; quality?: RecordedScenario['quality']; fullStepsAvailable?: boolean; entityScopes?: string[]; runtimeInputRequirements?: RuntimeInputRequirement[]; readiness?: RecordingReadiness; mutationType?: string }>;
  canonicalInteractions?: Array<Record<string, unknown>>;
  mutationOpportunities?: Array<Record<string, unknown>>;
  suggestionDiagnostics?: { opportunitiesDetected: number; candidatesGenerated: number; rejectedBecause: string[] };
  gridMetadata?: { detected: boolean; grids?: number; rows: number; cells: number; headers: string[]; headerRelationships: Array<{ header: string; field: string }> };
  aiGeneration?: {
    providerSuccess: boolean;
    schemaValidation: boolean;
    fallbackUsed: boolean;
    provider?: string;
    model?: string;
    inputTokens?: number;
    cachedTokens?: number;
    nonCachedTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    contextBeforeChars?: number;
    contextAfterChars?: number;
    candidates?: Array<{ title: string; type: string; rationale: string; sourceEvidenceRefs: string[]; expectedResultCandidate: string; oracleAuthority: string; goalRelated: boolean; needsReview: boolean; finalDecision: 'accepted' | 'rejected'; rejectionReason?: string }>;
    providerRejected?: Array<{ reason: string; sourceEvidenceRefs?: string[] }>;
  };
  derivation?: DerivationMetadata;
}

export interface TestRailPublishResult {
  ok: boolean;
  partial?: boolean;
  requested?: number;
  attempted?: number;
  sectionId: string;
  /** Resolved from TestRail when the section could be read — nicer to show than the id. */
  sectionName?: string;
  projectId?: string;
  suiteId?: string;
  created: Array<{ scenarioId: string; caseId: number; title: string }>;
  reconciledCreated?: Array<{ scenarioId: string; caseId: number; title: string }>;
  failed: Array<{ scenarioId: string; message: string }>;
  skippedAlreadyPublished?: Array<{ scenarioId: string; caseId: number }>;
  ambiguousUnresolved?: Array<{ scenarioId: string; status?: number; errorId?: string; reason?: string; attempts?: number }>;
  ambiguousDuplicates?: Array<{ scenarioId: string; caseIds: number[] }>;
  publishedTotal?: number;
  reconciledCount?: number;
}
