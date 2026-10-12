/** Mirrors src/test-design/test-design.types.ts in the automation engine. */

export interface TestDesignStep {
  action: string;
  expected: string;
}

/** A value a case needs typed in; steps reference it as {{key}}. Sensitive values are never published. */
export interface TestDesignDataField {
  key: string;
  label: string;
  description: string;
  value: string;
  sensitive: boolean;
}

export type TestDesignPriority = 'low' | 'medium' | 'high' | 'critical';

export type TestDesignScenarioType = 'functional' | 'negative' | 'edge' | 'regression' | 'other';

export interface TestDesignScenario {
  id: string;
  title: string;
  preconditions: string;
  steps: TestDesignStep[];
  expectedResult: string;
  data: TestDesignDataField[];
  priority: TestDesignPriority;
  type: TestDesignScenarioType;
  selectedForTestRail: boolean;
  selectedForJira: boolean;
  /** Set by the engine once the case exists in TestRail; the panel never writes it. */
  testRailCaseId: number | null;
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

export interface TestDesignKnowledgeSummary {
  screens: number;
  flows: number;
  behaviours: number;
  total: number;
}

/** A configured project, as the test design module offers it. */
export interface TestDesignProject {
  slug: string;
  name: string;
  projectType: 1 | 2;
  jiraProjectKey: string | null;
  testRail: TestDesignTestRailTarget;
  knowledge: TestDesignKnowledgeSummary;
  /** Active (not archived) drafts of the project. */
  draftCount: number;
}

/** Dashboard summary (GET /api/test-design/metrics). Mirrors src/test-design/test-design-metrics.ts. */
export interface TestDesignMetrics {
  period: { from: string; to: string; days: number };
  usage: { drafts: number; storiesCovered: number; people: number; projects: number };
  testRail: {
    casesNew: number;
    casesUpdated: number;
    casesFailed: number;
    previousCasesNew: number;
    weekly: Array<{ weekStart: string; casesNew: number; casesUpdated: number }>;
  };
  ai: { unchanged: number; edited: number; manual: number; generated: number; discarded: number };
  types: Record<TestDesignScenarioType, number>;
  data: { complete: number; pending: number };
  byProject: Array<{ projectSlug: string; projectName: string; casesNew: number; stories: number; aiShare: number }>;
  byPerson: Array<{ name: string; casesNew: number; drafts: number }>;
  recent: Array<{
    caseId: number;
    caseUrl: string | null;
    title: string;
    issueKey: string | null;
    projectSlug: string | null;
    projectName: string | null;
    origin: 'ai' | 'manual';
    edited: boolean;
    publishedAt: string;
  }>;
}
