export interface LaunchConfig {
  automationProject: string;
  source: string;
  jiraProject: string;
  sprint: string;
  status: string;
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  sourceSignature?: string;
  testRailProject: string;
  selectedCases: string[];
  runAll: boolean;
}
