import { describe, expect, it } from 'vitest';
import { canAdvanceFromSources, getJiraSourceSelectionMessage, isJiraSourceSelectionComplete } from './scenario-source-gate';

describe('scenario source gate', () => {
  it('blocks jira/both when no issue is selected', () => {
    expect(isJiraSourceSelectionComplete({ source: 'jira', jiraProject: 'QA', sprint: '12', jiraIssueKey: '' })).toBe(false);
    expect(isJiraSourceSelectionComplete({ source: 'both', jiraProject: 'QA', sprint: '12', jiraIssueKey: '' })).toBe(false);
  });

  it('allows jira/both only with an explicit issue key', () => {
    expect(isJiraSourceSelectionComplete({ source: 'jira', jiraProject: 'QA', sprint: '12', jiraIssueKey: 'AA-82' })).toBe(true);
    expect(isJiraSourceSelectionComplete({ source: 'both', jiraProject: 'QA', sprint: '12', jiraIssueKey: 'AA-82' })).toBe(true);
  });

  it('returns a helpful message when jira is missing a selected issue', () => {
    expect(getJiraSourceSelectionMessage({ source: 'jira', jiraIssueKey: '' })).toContain('Selecciona una historia de Jira');
    expect(getJiraSourceSelectionMessage({ source: 'testrail', jiraIssueKey: '' })).toBeNull();
  });

  it('blocks jira/combined without an explicit Jira issue when advancing from sources', () => {
    expect(canAdvanceFromSources({ source: 'jira', jiraProject: 'QA', sprint: '12', jiraIssueKey: '' })).toBe(false);
    expect(canAdvanceFromSources({ source: 'both', jiraProject: 'QA', sprint: '12', jiraIssueKey: null })).toBe(false);
    expect(canAdvanceFromSources({ source: 'testrail', jiraProject: 'QA', sprint: '', jiraIssueKey: '' })).toBe(true);
  });
});
