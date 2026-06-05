import type { JiraIssue } from '../../services/jira';

export function buildJiraIssueSource(issue: JiraIssue | null | undefined): {
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
} {
  if (!issue) return {};
  return {
    jiraIssueKey: issue.key,
    jiraSummary: issue.summary,
    jiraDescription: issue.description?.trim() || issue.acceptanceCriteria?.trim() || '',
  };
}

export function formatJiraIssueLabel(issue: JiraIssue): string {
  return `${issue.key} - ${issue.summary}`;
}
