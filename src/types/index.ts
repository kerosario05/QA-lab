export interface Project {
  id: string;
  name: string;
  team: string;
  stack: string;
  automated: number;
  runs: number;
  passRate: number;
  defects: number;
  lastRun: string;
  status: 'success' | 'partial' | 'failed' | 'running';
  trend: number[];
}

export interface Execution {
  id: string;
  date: string;
  project: string;
  triggered: string;
  duration: string;
  total: number;
  passed: number;
  failed: number;
  status: 'success' | 'partial' | 'failed' | 'running';
}

export interface ActiveRun {
  id: string;
  jobId?: string;
  project: string;
  triggered: string;
  startedAt: string;
  progress: number;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  currentTest: string;
  eta: string;
  status: string;
}

export interface TestCase {
  id: string;
  title: string;
  suite: string;
  priority: string;
  complexity: string;
  steps: number;
  duration: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface TestRailSuite {
  id: number;
  name: string;
  is_master: boolean;
  caseCount: number;
  caseCountApproximate: boolean;
}

export interface TestRailProject {
  id: number;
  name: string;
  suite_mode: 1 | 2 | 3; // 1=única, 2=baseline, 3=múltiples
  totalCaseCount: number;
  suites: TestRailSuite[];
}

export interface SprintCycle {
  id: number;
  name: string;
  date: string;
  total: number;
  passed: number;
  failed: number;
  defects: number;
  duration: string;
  status: string;
}

export interface PendingDefect {
  id: string;
  title: string;
  severity: string;
  resolvedBy: string;
  daysWaiting: number;
  sprint: string;
  component: string;
}

export interface FailedTest {
  id: string;
  title: string;
  error: string;
  severity: string;
  reportToJira: boolean;
}

export type View = 'dashboard' | 'execute' | 'live' | 'close' | 'settings';

export interface Scenario {
  jiraKey: string;
  title: string;
  stepCount: number;
  testrailFormat?: {
    title: string;
    refs: string;
    custom_preconds: string | null;
    custom_steps: string;
    custom_steps_separated: Array<{ content: string; expected: string }>;
  };
}
