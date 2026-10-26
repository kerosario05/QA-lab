import { api } from '../http';
import { invalidateTestRailCases } from '../testrail/sections';
import type {
  StoryJiraResult,
  StoryTestRailResult,
  SubtaskTypeInfo,
  JiraStoryDetail,
  JiraStoryRef,
  TestDesignDraftStory,
  TestDesignDraftSummary,
  TestDesignDraftWithStories,
  TestDesignScenarioInput,
  TestDesignTestRailTarget,
  TestDesignJiraProject,
  TestDesignTestRailProject,
  TestDesignTestRailSuite,
  TestDesignTestRailSection,
} from './types';

export * from './types';

/**
 * Client for the engine's test design module (/api/test-design), forwarded
 * unchanged by the BFF. Permissions are enforced by the engine; the screen only
 * hides what the user cannot use.
 */

const BASE = '/api/test-design';

export type DraftIssueInput = { issueKey: string; issueSummary?: string };

export type CreateDraftPayload = {
  jiraProjectKey: string;
  projectSlug: string;
  title?: string | null;
  testRail?: Partial<TestDesignTestRailTarget>;
  instructions?: string | null;
  issues: DraftIssueInput[];
};

export type UpdateDraftPayload = {
  projectSlug?: string;
  confirmProjectChange?: boolean;
  title?: string | null;
  instructions?: string | null;
  testRail?: Partial<TestDesignTestRailTarget>;
  addIssues?: DraftIssueInput[];
  removeStoryIds?: string[];
};

export type ListDraftsQuery = {
  mine?: boolean;
  jiraProjectKey?: string;
  includeArchived?: boolean;
};

function query(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const testDesignApi = {
  listJiraProjects: async (): Promise<TestDesignJiraProject[]> => {
    const res = await api.get<{ projects: TestDesignJiraProject[] }>(`${BASE}/jira/projects`);
    return res.projects ?? [];
  },

  listTestRailProjects: async (): Promise<TestDesignTestRailProject[]> => {
    const res = await api.get<{ projects: TestDesignTestRailProject[] }>(`${BASE}/testrail/projects`);
    return res.projects ?? [];
  },

  listTestRailSuites: async (projectId: number): Promise<TestDesignTestRailSuite[]> => {
    const res = await api.get<{ suites: TestDesignTestRailSuite[] }>(
      `${BASE}/testrail/projects/${projectId}/suites`,
    );
    return res.suites ?? [];
  },

  listTestRailSections: async (projectId: number, suiteId: number): Promise<TestDesignTestRailSection[]> => {
    const res = await api.get<{ sections: TestDesignTestRailSection[] }>(
      `${BASE}/testrail/projects/${projectId}/suites/${suiteId}/sections`,
    );
    return res.sections ?? [];
  },

  searchStories: async (projectKey: string, q = ''): Promise<JiraStoryRef[]> => {
    const res = await api.get<{ issues: JiraStoryRef[] }>(
      `${BASE}/jira/issues/search${query({ projectKey, q: q.trim() })}`,
    );
    return res.issues ?? [];
  },

  getStory: async (issueKey: string): Promise<JiraStoryDetail> => {
    const res = await api.get<{ issue: JiraStoryDetail }>(
      `${BASE}/jira/issues/${encodeURIComponent(issueKey)}`,
    );
    return res.issue;
  },

  listDrafts: async (filter: ListDraftsQuery = {}): Promise<TestDesignDraftSummary[]> => {
    const res = await api.get<{ drafts: TestDesignDraftSummary[] }>(
      `${BASE}/drafts${query({
        mine: filter.mine,
        jiraProjectKey: filter.jiraProjectKey,
        includeArchived: filter.includeArchived,
      })}`,
    );
    return res.drafts ?? [];
  },

  getDraft: async (draftId: string): Promise<TestDesignDraftWithStories> => {
    const res = await api.get<{ draft: TestDesignDraftWithStories }>(`${BASE}/drafts/${draftId}`);
    return res.draft;
  },

  createDraft: async (payload: CreateDraftPayload): Promise<TestDesignDraftWithStories> => {
    const res = await api.post<{ draft: TestDesignDraftWithStories }>(`${BASE}/drafts`, payload);
    return res.draft;
  },

  updateDraft: async (draftId: string, patch: UpdateDraftPayload): Promise<TestDesignDraftWithStories> => {
    const res = await api.put<{ draft: TestDesignDraftWithStories }>(`${BASE}/drafts/${draftId}`, patch);
    return res.draft;
  },

  archiveDraft: async (draftId: string): Promise<void> => {
    await api.delete<{ ok: true }>(`${BASE}/drafts/${draftId}`);
  },

  /**
   * Starts generation in the background (202). Without `storyIds`, only stories
   * never generated or that failed. Poll `getDraft` until no story is "generating".
   */
  generate: async (
    draftId: string,
    options: { storyIds?: string[]; instructions?: string } = {},
  ): Promise<TestDesignDraftWithStories> => {
    const res = await api.post<{ draft: TestDesignDraftWithStories }>(`${BASE}/drafts/${draftId}/generate`, options);
    return res.draft;
  },

  /** Regenerates one story; scenarios that were edited, written by hand or published are kept. */
  regenerate: async (
    draftId: string,
    storyId: string,
    instructions?: string,
  ): Promise<TestDesignDraftWithStories> => {
    const res = await api.post<{ draft: TestDesignDraftWithStories }>(
      `${BASE}/drafts/${draftId}/stories/${storyId}/regenerate`,
      { instructions },
    );
    return res.draft;
  },

  /** Sub-task type a Jira publish would use in this project. */
  getSubtaskType: (projectKey: string): Promise<SubtaskTypeInfo> =>
    api.get<SubtaskTypeInfo>(`${BASE}/jira/subtask-type${query({ projectKey })}`),

  reconcileTestRail: (draftId: string) =>
    api.post<{ draft: TestDesignDraftWithStories; missingCaseIds: number[] }>(`${BASE}/drafts/${draftId}/testrail/reconcile`, {}),

  /** Publishes the explicitly confirmed unpublished scenarios. */
  publishTestRail: async (draftId: string, storyIds?: string[], scenarioIds?: string[]) => {
    const result = await api.post<{ draft: TestDesignDraftWithStories; results: StoryTestRailResult[] }>(
      `${BASE}/drafts/${draftId}/publish/testrail`,
      { storyIds, scenarioIds },
    );
    const { projectId, suiteId, sectionId } = result.draft.testRail;
    if (projectId && suiteId && sectionId) invalidateTestRailCases(projectId, suiteId, sectionId);
    return result;
  },

  /** Creates or updates one sub-task per story with its scenarios selected for Jira. */
  publishJira: (draftId: string, storyIds?: string[]) =>
    api.post<{ draft: TestDesignDraftWithStories; results: StoryJiraResult[] }>(
      `${BASE}/drafts/${draftId}/publish/jira`,
      { storyIds },
    ),

  saveScenarios: async (
    draftId: string,
    storyId: string,
    scenarios: TestDesignScenarioInput[],
  ): Promise<TestDesignDraftStory> => {
    const res = await api.put<{ story: TestDesignDraftStory }>(
      `${BASE}/drafts/${draftId}/stories/${storyId}/scenarios`,
      { scenarios },
    );
    return res.story;
  },
};
