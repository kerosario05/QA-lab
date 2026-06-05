import { describe, expect, it } from 'vitest';

import { buildJiraIssueSource, formatJiraIssueLabel } from './jira-issue-selection';

describe('jira issue selection', () => {
  it('builds preview source from an explicit Jira issue', () => {
    const payload = buildJiraIssueSource({
      key: 'AA-82',
      summary: 'Alta de producto',
      description: 'Descripción completa',
      acceptanceCriteria: 'AC alterno',
      status: 'To Do',
      issueType: 'Story',
    });

    expect(payload).toEqual({
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción completa',
    });
  });

  it('falls back to acceptance criteria when description is empty', () => {
    const payload = buildJiraIssueSource({
      key: 'AA-83',
      summary: 'Otra historia',
      description: '   ',
      acceptanceCriteria: 'AC de respaldo',
      status: 'To Do',
      issueType: 'Story',
    });

    expect(payload.jiraDescription).toBe('AC de respaldo');
  });

  it('formats issue labels compactly', () => {
    expect(formatJiraIssueLabel({ key: 'AA-82', summary: 'Alta de producto', status: 'To Do', issueType: 'Story' })).toBe('AA-82 - Alta de producto');
  });
});
