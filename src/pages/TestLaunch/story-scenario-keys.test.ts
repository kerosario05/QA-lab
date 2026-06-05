import { describe, expect, it } from 'vitest';

import { buildAllScenarioKeys } from './story-scenario-keys';

describe('story scenario keys', () => {
  it('returns an empty array when stories are undefined or null', () => {
    expect(buildAllScenarioKeys(undefined)).toEqual([]);
    expect(buildAllScenarioKeys(null)).toEqual([]);
  });

  it('ignores stories with undefined scenarios and keeps valid ones', () => {
    const keys = buildAllScenarioKeys([
      { jiraKey: 'AA-1', title: 'One', generatedByAi: false, scenarioCount: 0, scenarios: undefined as any },
      { jiraKey: 'AA-2', title: 'Two', generatedByAi: false, scenarioCount: 2, scenarios: [{}, {}] as any },
    ]);

    expect(keys).toEqual(['AA-2::0', 'AA-2::1']);
  });
});
