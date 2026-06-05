import type { JiraIssue } from '../../services/jira';

export function normalizeJiraIssueCollection(issues: JiraIssue[] | null | undefined): JiraIssue[] {
  return Array.isArray(issues) ? issues : [];
}

export function findSelectedJiraIssue(
  issues: JiraIssue[] | null | undefined,
  selectedIssueKey?: string | null,
): JiraIssue | null {
  const normalizedIssues = normalizeJiraIssueCollection(issues);
  if (!selectedIssueKey?.trim()) return null;
  return normalizedIssues.find(issue => issue.key === selectedIssueKey) ?? null;
}
