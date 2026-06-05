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
});
