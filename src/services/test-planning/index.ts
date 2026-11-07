import { api } from '../http';

/**
 * Client for the engine's test planning module (/api/test-planning), forwarded
 * unchanged by the BFF. The engine reads the project's git repository and
 * enforces the testplanning.* permissions.
 */

const BASE = '/api/test-planning';

export interface PlanningProject {
  slug: string;
  name: string;
  /** False when the project has no repository configured yet. */
  configured: boolean;
  repository: string | null;
  defaultBranch: string | null;
  specsPath: string | null;
  cloned: boolean;
  lastFetchAt: string | null;
}

export interface PlanReviewSummary {
  outcome: 'accepted' | 'committed';
  userName: string | null;
  reviewedAt: string;
  commitSha: string | null;
  /** False when the file changed in the repo after this review. */
  current: boolean;
}

export interface WorkspaceStatus {
  cloned: boolean;
  lastFetchAt: string | null;
}

export interface BranchInfo {
  name: string;
  headSha: string;
  committedAt: string;
  subject: string;
  planCount: number;
  protected: boolean;
}

export interface BranchesResponse {
  status: WorkspaceStatus;
  defaultBranch: string;
  branches: BranchInfo[];
}

export interface PlanFileRef {
  key: string;
  path: string;
  folder: string;
  blobSha: string;
  matchesBranch: boolean;
  review?: PlanReviewSummary | null;
}

export interface PlansResponse {
  branch: string;
  headSha: string;
  protected: boolean;
  newCommits: number;
  plans: PlanFileRef[];
}

export type StepKind = 'given' | 'when' | 'then' | 'and' | 'but';

export interface PlanStep {
  keyword: string;
  text: string;
}

export interface PlanExamples {
  keyword: string;
  name: string;
  header: string[];
  rows: string[][];
}

export interface PlanScenario {
  id: string;
  comments: string[];
  tags: string[];
  keyword: string;
  title: string;
  steps: PlanStep[];
  examples: PlanExamples[];
  locked: string | null;
}

export interface PlanDocument {
  branch: string;
  headSha: string;
  protected: boolean;
  file: PlanFileRef;
  title: string;
  frontmatter: Record<string, string>;
  language: string;
  keywordOptions: Array<{ keyword: string; kind: StepKind }>;
  readOnlyReason: string | null;
  issues: string[];
  scenarios: PlanScenario[];
  review: PlanReviewSummary | null;
}

export interface PlanEditStats {
  total: number;
  edited: number;
  added: number;
  removed: number;
  reordered: boolean;
}

export interface ScenarioProblem {
  id: string;
  title: string;
  errors: string[];
}

export interface PlanPreview {
  changed: boolean;
  diff: string;
  stats: PlanEditStats;
  problems: ScenarioProblem[];
  danglingCoverage: string[];
  protected: boolean;
}

export interface PlanEditPayload {
  branch: string;
  path: string;
  baseBlobSha: string;
  scenarios: PlanScenario[];
}

export interface TestPlanningMetrics {
  days: number;
  plansReviewed: number;
  acceptedAsIs: number;
  withChanges: number;
  acceptanceRate: number | null;
  commits: number;
  scenariosReviewed: number;
  scenariosEdited: number;
  scenariosAdded: number;
  scenariosRemoved: number;
  byReviewer: Array<{ userName: string; reviews: number; commits: number }>;
  recent: Array<{
    projectSlug: string;
    issueKey: string;
    branch: string;
    outcome: 'accepted' | 'committed';
    userName: string | null;
    reviewedAt: string;
    edited: number;
    added: number;
    removed: number;
    commitSha: string | null;
  }>;
}

const project = (slug: string) => `${BASE}/projects/${encodeURIComponent(slug)}`;

export const testPlanning = {
  listProjects: () => api.get<{ projects: PlanningProject[] }>(`${BASE}/projects`).then((r) => r.projects),
  listBranches: (slug: string) => api.get<BranchesResponse>(`${project(slug)}/branches`),
  fetch: (slug: string) => api.post<BranchesResponse>(`${project(slug)}/fetch`, {}),
  pull: (slug: string, branch: string) =>
    api.post<Omit<PlansResponse, 'newCommits'> & { status: WorkspaceStatus }>(`${project(slug)}/pull`, { branch }),
  listPlans: (slug: string, branch: string, since?: string) => {
    const params = new URLSearchParams({ branch });
    if (since) params.set('since', since);
    return api.get<PlansResponse>(`${project(slug)}/plans?${params}`);
  },
  getPlan: (slug: string, branch: string, path: string) =>
    api.get<PlanDocument>(`${project(slug)}/plan?${new URLSearchParams({ branch, path })}`),
  preview: (slug: string, payload: PlanEditPayload) => api.post<PlanPreview>(`${project(slug)}/plan/preview`, payload),
  commit: (slug: string, payload: PlanEditPayload & { message: string }) =>
    api.post<{ ok: true; commitSha: string; stats: PlanEditStats; plan: PlanDocument }>(`${project(slug)}/plan/commit`, payload),
  accept: (slug: string, payload: { branch: string; path: string; blobSha: string; note?: string }) =>
    api.post<{ ok: true; plan: PlanDocument }>(`${project(slug)}/plan/accept`, payload),
  metrics: (days: number, projectSlug?: string) => {
    const params = new URLSearchParams({ days: String(days) });
    if (projectSlug) params.set('projectSlug', projectSlug);
    return api.get<TestPlanningMetrics>(`${BASE}/metrics?${params}`);
  },
};
