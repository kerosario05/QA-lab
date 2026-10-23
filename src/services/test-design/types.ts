/** Mirrors src/test-design/test-design.types.ts in the automation engine. */

/** A test datum a case needs; texts reference it as {{key}}. */
export interface TestDesignDatum {
  key: string;
  label?: string;
  value: string;
  sensitive: boolean;
  description: string;
  condition?: 'valid' | 'invalid' | 'expired';
  catalogBinding?: { catalogId: string; optionId?: string; revision: number; mode: 'manual' | 'automatic' };
}

export interface TestDesignStep {
  action: string;
  expected: string;
}

export type TestDesignPriority = 'low' | 'medium' | 'high' | 'critical';

export type TestDesignScenarioType = 'functional' | 'negative' | 'edge' | 'regression' | 'other';

export interface TestDesignScenario {
  id: string;
  title: string;
  preconditions: string;
  steps: TestDesignStep[];
  /** Optional so cases saved before data fields existed still load. */
  data?: TestDesignDatum[];
  /** Generation/coverage gaps retained for human review; the case is not certified complete. */
  generationWarnings?: string[];
  expectedResult: string;
  priority: TestDesignPriority;
  type: TestDesignScenarioType;
  selectedForTestRail: boolean;
  selectedForJira: boolean;
  /** Set by the engine once the case exists in TestRail; the panel never writes it. */
  testRailCaseId: number | null;
  /** The saved case has edits that can be synchronized to TestRail. */
  testRailDirty?: boolean;
  origin: 'ai' | 'manual';
  edited: boolean;
}

export type TestDesignGenerationStatus = 'pending' | 'generating' | 'ready' | 'failed';

export type TestDesignDraftStatus = 'draft' | 'partially_published' | 'published' | 'archived';

export interface TestDesignTestRailTarget {
  projectId: number | null;
  suiteId: number | null;
  sectionId: number | null;
}

export interface TestDesignDraftStory {
  id: string;
  draftId: string;
  issueKey: string;
  issueSummary: string;
  position: number;
  generationStatus: TestDesignGenerationStatus;
  generationError: string | null;
  scenarios: TestDesignScenario[];
  jiraSubtaskKey: string | null;
  jiraPublishedAt: string | null;
  testRailPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestDesignDraft {
  id: string;
  title: string | null;
  projectSlug: string | null;
  jiraProjectKey: string;
  testRail: TestDesignTestRailTarget;
  instructions: string | null;
  status: TestDesignDraftStatus;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestDesignDraftWithStories extends TestDesignDraft {
  stories: TestDesignDraftStory[];
}

export interface TestDesignDraftSummary extends TestDesignDraft {
  storyCount: number;
  scenarioCount: number;
  issueKeys: string[];
}

export interface JiraStoryRef {
  key: string;
  summary: string;
  status: string;
  issueType: string;
}

export interface JiraStoryDetail {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string | null;
  labels: string[];
  components: string[];
  status: string;
  issueType: string;
}

/** Scenario as the editor sends it: the engine assigns ids and owns the TestRail link. */
export type TestDesignScenarioInput = Omit<TestDesignScenario, 'id' | 'testRailCaseId' | 'origin' | 'edited'> &
  Partial<Pick<TestDesignScenario, 'id' | 'origin'>>;

export interface ScenarioPublishOutcome {
  scenarioId: string;
  title: string;
  status: 'created' | 'updated' | 'recreated' | 'failed';
  caseId?: number;
  caseUrl?: string;
  message?: string;
}

export interface StoryTestRailResult {
  storyId: string;
  issueKey: string;
  status: 'published' | 'partial' | 'failed' | 'skipped';
  scenarios: ScenarioPublishOutcome[];
  message?: string;
}

export interface StoryJiraResult {
  storyId: string;
  issueKey: string;
  status: 'created' | 'updated' | 'recreated' | 'failed' | 'skipped';
  subtaskKey?: string;
  url?: string;
  issueType?: string;
  scenarioCount: number;
  message?: string;
}

/** 422 payload when selected scenarios are incomplete. */
export interface PublishIssue {
  scenarioId: string;
  title: string;
  problem: string;
  issueKey: string;
}

export interface SubtaskTypeInfo {
  issueType: { id: string; name: string } | null;
  message?: string;
  available?: string[];
}

/** Read-only catalog shapes served by the engine under this module's permissions. */
export interface TestDesignJiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
}

export interface TestDesignTestRailProject {
  id: number;
  name: string;
  suite_mode: 1 | 2 | 3;
}

export interface TestDesignTestRailSuite {
  id: number;
  name: string;
  project_id: number;
  is_master?: boolean;
}

export interface TestDesignTestRailSection {
  id: number;
  suite_id: number;
  parent_id: number | null;
  name: string;
  description?: string | null;
  depth: number;
  display_order?: number;
}
