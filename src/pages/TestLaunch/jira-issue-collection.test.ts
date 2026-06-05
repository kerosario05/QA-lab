import { describe, expect, it } from 'vitest';

import { findSelectedJiraIssue, normalizeJiraIssueCollection } from './jira-issue-collection';

describe('jira issue collection', () => {
  it('normalizes undefined, null and empty arrays safely', () => {
    expect(normalizeJiraIssueCollection(undefined)).toEqual([]);
    expect(normalizeJiraIssueCollection(null)).toEqual([]);
    expect(normalizeJiraIssueCollection([])).toEqual([]);
  });

  it('finds a selected issue only when the collection exists', () => {
    const issues = [
      { key: 'AA-1', summary: 'Alta', status: 'To Do', issueType: 'Story' },
      { key: 'AA-2', summary: 'Baja', status: 'Done', issueType: 'Story' },
    ] as any;

    expect(findSelectedJiraIssue(undefined, 'AA-1')).toBeNull();
    expect(findSelectedJiraIssue(null, 'AA-1')).toBeNull();
    expect(findSelectedJiraIssue(issues, 'AA-2')?.summary).toBe('Baja');
  });
});
