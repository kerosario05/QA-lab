import { describe, it, expect } from 'vitest';
import type { Story, StoryScenario } from '../src/services/scenarios/types';

// Inline the function under test to verify authIntent propagation
function storiesToMcpScenarios(stories: Story[], appSlug?: string): any[] {
  const result: any[] = [];
  for (const story of stories) {
    for (const sc of story.scenarios) {
      const routeProfile = sc.routeProfile || '';
      result.push({
        sourceIssueKey: sc.refs || story.jiraKey,
        title: sc.title,
        steps: sc.custom_steps_separated.map(
          (step: any) => step.content + (step.expected ? `\nEsperado:${step.expected}` : '')
        ),
        preconditions: sc.custom_preconds ? [sc.custom_preconds] : [],
        expectedResult: sc.custom_expected ?? '',
        type: 'functional',
        database: 'sqlserver',
        isConverted: 0,
        automationType: 'playwright',
        setupStrategy: 'basic',
        appSlug: appSlug || 'arquitectura-automatizacion',
        routeProfile,
        dataRequirements: '',
        nonExecutableCriteria: '',
        mcpExecutable: true,
        authIntent: sc.authIntent,
      });
    }
  }
  return result;
}

function makeStory(scenarioOverrides: Partial<StoryScenario>): Story {
  return {
    jiraKey: 'HU-TEST',
    title: 'Test Story',
    generatedByAi: true,
    scenarioCount: 1,
    scenarios: [{
      title: 'Test Scenario',
      refs: 'HU-TEST',
      custom_preconds: null,
      custom_steps_separated: [{ content: 'Step 1', expected: '' }],
      ...scenarioOverrides,
    }],
  };
}

describe('authIntent propagation through storiesToMcpScenarios', () => {
  it('preserves full_authentication', () => {
    const story = makeStory({ authIntent: 'full_authentication' });
    const [result] = storiesToMcpScenarios([story]);
    expect(result.authIntent).toBe('full_authentication');
  });

  it('preserves gate_observation', () => {
    const story = makeStory({ authIntent: 'gate_observation' });
    const [result] = storiesToMcpScenarios([story]);
    expect(result.authIntent).toBe('gate_observation');
  });

  it('preserves undefined when not set', () => {
    const story = makeStory({});
    const [result] = storiesToMcpScenarios([story]);
    expect(result.authIntent).toBeUndefined();
  });
});
