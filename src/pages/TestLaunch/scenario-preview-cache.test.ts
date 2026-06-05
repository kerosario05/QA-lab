import { describe, expect, it } from 'vitest';
import { buildScenarioPreviewCacheKey } from './scenario-preview-cache';

const trProjects = [
  { id: 56, suites: [{ id: 1731 }] },
];

describe('scenario preview cache key', () => {
  it('builds a stable key from the active filters', () => {
    const key = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      jiraIssueKey: 'AA-1',
      jiraSummary: 'Alta de producto',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);

    expect(key).toContain('projectKey=QA');
    expect(key).toContain('sprintId=12');
    expect(key).toContain('status=Desestimado');
    expect(key).toContain('suiteId=1731');
    expect(key).toContain('sectionId=4903');
    expect(key).toContain('sourceMode=jira');
    expect(key).toContain('jiraIssueKey=AA-1');
  });

  it('changes when section changes', () => {
    const a = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);
    const b = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4904 } as any, trProjects as any);

    expect(a).not.toBe(b);
  });

  it('changes when jira issue metadata changes', () => {
    const a = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      jiraIssueKey: 'AA-1',
      jiraSummary: 'Story 1',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);
    const b = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      jiraIssueKey: 'AA-2',
      jiraSummary: 'Story 2',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);

    expect(a).not.toBe(b);
  });

  it('changes when jira description changes', () => {
    const a = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      jiraIssueKey: 'AA-1',
      jiraSummary: 'Story 1',
      jiraDescription: 'Desc 1',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);
    const b = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      jiraIssueKey: 'AA-1',
      jiraSummary: 'Story 1',
      jiraDescription: 'Desc 2',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);

    expect(a).not.toBe(b);
  });

  it('changes when source mode changes', () => {
    const a = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'jira',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);
    const b = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'both',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);

    expect(a).not.toBe(b);
  });

  it('changes when test rail project changes', () => {
    const a = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'both',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '56',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, trProjects as any);
    const b = buildScenarioPreviewCacheKey({
      automationProject: 'app',
      source: 'both',
      jiraProject: 'QA',
      sprint: '12',
      status: 'Desestimado',
      testRailProject: '57',
      selectedCases: [],
      runAll: false,
    }, { id: 4903 } as any, [{ id: 57, suites: [{ id: 1731 }] }] as any);

    expect(a).not.toBe(b);
  });
});
