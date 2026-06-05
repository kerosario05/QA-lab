export function isJiraSourceSelectionComplete(input: {
  source: string;
  jiraProject?: string;
  sprint?: string;
  jiraIssueKey?: string | null;
}): boolean {
  if (input.source === 'testrail') return true;
  if (input.source === 'jira' || input.source === 'both') {
    return Boolean(input.jiraProject && input.sprint && input.jiraIssueKey?.trim());
  }
  return true;
}

export function getJiraSourceSelectionMessage(input: {
  source: string;
  jiraIssueKey?: string | null;
}): string | null {
  if ((input.source === 'jira' || input.source === 'both') && !input.jiraIssueKey?.trim()) {
    return 'Selecciona una historia de Jira para continuar.';
  }
  return null;
}

export function canAdvanceFromSources(input: {
  source: string;
  jiraProject?: string | null;
  sprint?: string | null;
  jiraIssueKey?: string | null;
}): boolean {
  if (input.source === 'testrail') return true;
  if (input.source === 'jira' || input.source === 'both') {
    return Boolean(input.jiraProject && input.sprint && input.jiraIssueKey?.trim());
  }
  return true;
}
