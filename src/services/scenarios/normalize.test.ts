import { describe, it, expect } from 'vitest';
import { normalizeScenarioPreviewResponse } from './normalize';

describe('normalizeScenarioPreviewResponse', () => {
  it('supports { stories: [...] } shape', () => {
    const input = {
      stories: [
        { jiraKey: 'AA-1', title: 'Story 1', scenarios: [], scenarioCount: 0, generatedByAi: false },
        { jiraKey: 'AA-2', title: 'Story 2', scenarios: [], scenarioCount: 0, generatedByAi: false },
      ],
      totalScenarios: 5,
      sprint: { id: 42, name: 'Sprint 1' },
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(2);
    expect(result.totalScenarios).toBe(5);
    expect(result.sprint?.id).toBe(42);
    expect(result.rawShape).toContain('stories');
  });

  it('supports { valid: [...] } shape', () => {
    const input = {
      valid: [
        { jiraKey: 'BB-1', title: 'Valid Story', scenarios: [], scenarioCount: 0, generatedByAi: false },
      ],
      rejected: [{ reason: 'no steps' }],
      totalScenarios: 1,
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('BB-1');
    expect(result.totalScenarios).toBe(1);
  });

  it('supports { generated: [...] } shape', () => {
    const input = {
      generated: [
        { jiraKey: 'CC-1', title: 'Generated Story', scenarios: [], scenarioCount: 0, generatedByAi: true },
      ],
      totalScenarios: 1,
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.totalScenarios).toBe(1);
  });

  it('supports { data: [...] } shape', () => {
    const input = {
      data: [
        { jiraKey: 'DD-1', title: 'Data Wrapped', scenarios: [], scenarioCount: 0, generatedByAi: false },
      ],
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('DD-1');
    expect(result.totalScenarios).toBe(1);
  });

  it('supports { result: { scenarios: [...] } } shape', () => {
    const input = {
      result: {
        scenarios: [
          { jiraKey: 'EE-1', title: 'Nested Result', scenarios: [], scenarioCount: 0, generatedByAi: false },
        ],
      },
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('EE-1');
    expect(result.totalScenarios).toBe(1);
  });

  it('supports direct array input', () => {
    const input = [
      { jiraKey: 'FF-1', title: 'Direct Array', scenarios: [], scenarioCount: 0, generatedByAi: false },
    ];
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.totalScenarios).toBe(1);
  });

  it('uses data.totalScenarios if present, falls back to stories.length', () => {
    const stories = [
      { jiraKey: 'G-1', title: 'S', scenarios: [], scenarioCount: 0, generatedByAi: false },
    ];
    const result = normalizeScenarioPreviewResponse({ stories });
    expect(result.totalScenarios).toBe(1);
  });

  it('handles stories: [] without crashing', () => {
    const result = normalizeScenarioPreviewResponse({ stories: [], totalScenarios: 0 });
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.sprint).toBeNull();
  });

  it('handles stories: null without crashing', () => {
    const input = { stories: null };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
  });

  it('handles null input without crashing', () => {
    const result = normalizeScenarioPreviewResponse(null);
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.rawShape).toBe('null');
  });

  it('handles undefined input without crashing', () => {
    const result = normalizeScenarioPreviewResponse(undefined);
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.rawShape).toBe('undefined');
  });

  it('handles malformed object (no arrays) without crashing', () => {
    const result = normalizeScenarioPreviewResponse({ foo: 'bar', count: 3 });
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(3);
  });

  it('handles string input without crashing', () => {
    const result = normalizeScenarioPreviewResponse('unexpected');
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.rawShape).toBe('string');
  });

  it('handles number input without crashing', () => {
    const result = normalizeScenarioPreviewResponse(42);
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.rawShape).toBe('number');
  });

  it('handles empty object without crashing', () => {
    const result = normalizeScenarioPreviewResponse({});
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
    expect(result.sprint).toBeNull();
  });

  it('extracts sprint info when present', () => {
    const input = {
      stories: [],
      sprint: { id: 10, name: 'Test Sprint' },
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.sprint).toEqual({ id: 10, name: 'Test Sprint' });
  });

  it('ignores malformed sprint', () => {
    const result = normalizeScenarioPreviewResponse({ stories: [], sprint: 'invalid' });
    expect(result.sprint).toBeNull();
  });

  it('uses data.total for totalScenarios when available', () => {
    const result = normalizeScenarioPreviewResponse({ stories: [], total: 42 });
    expect(result.totalScenarios).toBe(42);
  });

  it('uses data.count for totalScenarios when available', () => {
    const result = normalizeScenarioPreviewResponse({ stories: [], count: 99 });
    expect(result.totalScenarios).toBe(99);
  });

  it('rawShape describes object keys', () => {
    const result = normalizeScenarioPreviewResponse({ stories: [], totalScenarios: 0, sprint: null });
    expect(result.rawShape).toContain('stories');
    expect(result.rawShape).toContain('totalScenarios');
  });

  it('supports { scenarios: [...] } top-level from MCP runner', () => {
    const input = {
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'Login test', steps: ['1. Open page\nEsperado: Page loads'], expectedResult: 'Success', preconditions: ['User exists'] },
        { sourceIssueKey: 'AA-1', title: 'Logout test', steps: ['1. Click logout\nEsperado: Logged out'], expectedResult: 'Done', preconditions: [] },
        { sourceIssueKey: 'AA-2', title: 'Search test', steps: ['1. Type query'], expectedResult: 'Results shown' },
      ],
      rejected: [{ sourceIssueKey: 'AA-3', reason: 'Not executable' }],
      summary: { generated: 3, valid: 3, invalid: 0, rejected: 1 },
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0].jiraKey).toBe('AA-1');
    expect(result.stories[0].scenarios).toHaveLength(2);
    expect(result.stories[1].jiraKey).toBe('AA-2');
    expect(result.stories[1].scenarios).toHaveLength(1);
    expect(result.totalScenarios).toBe(3);
  });

  it('groups flat scenarios by sourceIssueKey into stories', () => {
    const input = {
      scenarios: [
        { sourceIssueKey: 'AA-82', title: 'Escenario 1', steps: ['1. Do thing'], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'Escenario 2', steps: ['1. Do other'], preconditions: [] },
      ],
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('AA-82');
    expect(result.stories[0].scenarioCount).toBe(2);
    expect(result.stories[0].scenarios).toHaveLength(2);
    expect(result.stories[0].scenarios[0].refs).toBe('AA-82');
  });

  it('falls back to jiraKey when sourceIssueKey is missing', () => {
    const input = {
      scenarios: [
        { jiraKey: 'BB-1', title: 'Test', steps: [], preconditions: [] },
      ],
    };
    const result = normalizeScenarioPreviewResponse(input);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('BB-1');
  });

  it('converts MCP steps with Esperado separator to content/expected', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'Step test', steps: ['1. Click\nEsperado: Dialog opens', '2. Confirm'], preconditions: [] },
      ],
    });
    expect(result.stories[0].scenarios[0].custom_steps_separated).toHaveLength(2);
    expect(result.stories[0].scenarios[0].custom_steps_separated[0].content).toContain('1. Click');
    expect(result.stories[0].scenarios[0].custom_steps_separated[0].expected).toBe('Dialog opens');
    expect(result.stories[0].scenarios[0].custom_steps_separated[1].expected).toBe('');
  });

  it('sets expectedResult as custom_expected when present', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'Test', steps: [], preconditions: [], expectedResult: 'All good' },
      ],
    });
    expect(result.stories[0].scenarios[0].custom_expected).toBe('All good');
  });

  it('does not filter scenarios by status — status field is not required', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'No status scenario', steps: ['1. Test'], preconditions: [] },
      ],
    });
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].scenarios[0].title).toBe('No status scenario');
  });

  it('returns totalScenarios=0 when scenarios is empty even if rejected>0', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [],
      rejected: [{ sourceIssueKey: 'AA-1', reason: 'Not executable' }],
    });
    expect(result.stories).toHaveLength(0);
    expect(result.totalScenarios).toBe(0);
  });

  it('uses scenarios.length for totalScenarios when no explicit totalScenarios/total/count', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'S1', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'S2', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-2', title: 'S3', steps: [], preconditions: [] },
      ],
    });
    expect(result.totalScenarios).toBe(3);
  });

  it('TEST 1 — headerScenarioCount uses summary.visible (final) not summary.generated (early)', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-82', title: 'E1', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E2', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E3', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E4', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E5', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E6', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E7', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E8', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-82', title: 'E9', steps: [], preconditions: [] },
      ],
      summary: { generated: 6, visible: 9 },
    });
    expect(result.totalScenarios).toBe(9);
  });

  it('TEST 2 — headerScenarioCount sums final visible scenarios across stories (HU-1=4, HU-2=5)', () => {
    const scenarios = [
      { sourceIssueKey: 'HU-1', title: 'A1', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-1', title: 'A2', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-1', title: 'A3', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-1', title: 'A4', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-2', title: 'B1', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-2', title: 'B2', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-2', title: 'B3', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-2', title: 'B4', steps: [], preconditions: [] },
      { sourceIssueKey: 'HU-2', title: 'B5', steps: [], preconditions: [] },
    ];
    const result = normalizeScenarioPreviewResponse({
      scenarios,
      summary: { generated: 6, visible: 9 },
    });
    expect(result.totalScenarios).toBe(9);
    const byStory = Object.fromEntries(result.stories.map((s: any) => [s.jiraKey, s.scenarioCount]));
    expect(byStory['HU-1']).toBe(4);
    expect(byStory['HU-2']).toBe(5);
  });

  it('TEST 3 — rejected/omitted not counted; visible=6 stays 6', () => {
    const result = normalizeScenarioPreviewResponse({
      scenarios: [
        { sourceIssueKey: 'AA-1', title: 'V1', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'V2', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'V3', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'V4', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'V5', steps: [], preconditions: [] },
        { sourceIssueKey: 'AA-1', title: 'V6', steps: [], preconditions: [] },
      ],
      rejected: [
        { sourceIssueKey: 'AA-1', reason: 'no steps' },
        { sourceIssueKey: 'AA-1', reason: 'narrative' },
      ],
      summary: { generated: 9, visible: 6 },
    });
    expect(result.totalScenarios).toBe(6);
    expect(result.rejected).toHaveLength(2);
  });
});
