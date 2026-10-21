import { describe, expect, it } from 'vitest';
import { buildScenarioExecutionProvenance } from './launch-selection';

describe('buildScenarioExecutionProvenance', () => {
  it('selects Jira semantic engine for Jira-only web launches', () => {
    expect(buildScenarioExecutionProvenance({ jiraSelectedCount: 5, testRailSelectedCount: 0, jiraKey: 'AA-88', projectType: 'web' }))
      .toEqual({ executionEngine: 'jira_semantic', scenarioOrigin: { kind: 'jira_generated', jiraKey: 'AA-88' } });
  });
  it('leaves TestRail, mixed-source, and mobile launches on their existing routing', () => {
    expect(buildScenarioExecutionProvenance({ jiraSelectedCount: 0, testRailSelectedCount: 1, jiraKey: 'AA-88', projectType: 'web' })).toBeUndefined();
    expect(buildScenarioExecutionProvenance({ jiraSelectedCount: 1, testRailSelectedCount: 1, jiraKey: 'AA-88', projectType: 'web' })).toBeUndefined();
    expect(buildScenarioExecutionProvenance({ jiraSelectedCount: 1, testRailSelectedCount: 0, jiraKey: 'AA-88', projectType: 'mobile' })).toBeUndefined();
  });
});
