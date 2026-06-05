import { describe, expect, it } from 'vitest';

import { isAsyncPreviewResponse, normalizeGeneratedScenarios } from './scenario-generation';

describe('scenario generation normalization', () => {
  it('keeps stories from the preview response as visible generated scenarios', () => {
    const result = normalizeGeneratedScenarios({
      stories: [
        {
          jiraKey: 'AA-82',
          title: 'Historia 82',
          generatedByAi: true,
          scenarioCount: 1,
          scenarios: [
            {
              title: 'Abrir detalle',
              refs: 'AA-82-0',
              custom_preconds: null,
              custom_expected: 'OK',
              custom_steps_separated: [{ content: 'Paso 1', expected: 'OK' }],
            },
          ],
        },
      ],
      totalScenarios: 1,
      cached: false,
    }, { key: 'AA-82', summary: 'Historia 82' } as any, {
      automationProject: '',
      source: 'jira',
      jiraProject: 'PROJ',
      sprint: 'Sprint 1',
      status: 'Desestimado',
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Historia 82',
      jiraDescription: '',
      testRailProject: '',
      selectedCases: [],
      runAll: false,
    }, null);

    expect(result.stories).toHaveLength(1);
    expect(result.totalScenarios).toBe(1);
    expect(result.activeGenerationSource?.jiraIssueKey).toBe('AA-82');
  });

  it('normalizes MCP scenarios into generated stories for the selected issue', () => {
    const result = normalizeGeneratedScenarios({
      scenarios: [
        {
          sourceIssueKey: 'AA-82',
          title: 'Validar detalle visible',
          steps: ['Abrir listado', 'Abrir detalle'],
          preconditions: ['Usuario autenticado'],
          expectedResult: 'El detalle debe verse',
          type: 'navigation',
          database: '',
          isConverted: 1,
          automationType: '',
          setupStrategy: '',
          appSlug: 'default',
          routeProfile: 'default',
          dataRequirements: '',
          nonExecutableCriteria: '',
          mcpExecutable: true,
          validation: { valid: true, errors: [], warnings: [] },
          scenarioId: 'SC-1',
        },
      ],
      summary: { generated: 1, valid: 1, invalid: 0, rejected: 0 },
      cached: true,
    } as any, { key: 'AA-82', summary: 'Historia 82' } as any, {
      automationProject: '',
      source: 'both',
      jiraProject: 'PROJ',
      sprint: 'Sprint 1',
      status: 'Desestimado',
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Historia 82',
      jiraDescription: '',
      testRailProject: '',
      selectedCases: [],
      runAll: false,
    }, null);

    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].jiraKey).toBe('AA-82');
    expect(result.stories[0].scenarios).toHaveLength(1);
    expect(result.stories[0].scenarios[0].title).toBe('Validar detalle visible');
    expect(result.cached).toBe(true);
  });

  it('returns empty stories when the preview has no generated scenarios', () => {
    const result = normalizeGeneratedScenarios({ stories: [], totalScenarios: 0 } as any, { key: 'AA-82', summary: 'Historia 82' } as any, {
      automationProject: '',
      source: 'jira',
      jiraProject: 'PROJ',
      sprint: 'Sprint 1',
      status: 'Desestimado',
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Historia 82',
      jiraDescription: '',
      testRailProject: '',
      selectedCases: [],
      runAll: false,
    }, null);

    expect(result.stories).toEqual([]);
    expect(result.totalScenarios).toBe(0);
  });
});

describe('isAsyncPreviewResponse', () => {
  it('detects pending preview jobs', () => {
    expect(isAsyncPreviewResponse({ status: 'pending', jobId: 'job-1' } as any)).toBe(true);
    expect(isAsyncPreviewResponse({ job: { id: 'job-1', status: 'running' } } as any)).toBe(true);
  });

  it('returns false for synchronous preview payloads', () => {
    expect(isAsyncPreviewResponse({ stories: [], totalScenarios: 0, cached: false } as any)).toBe(false);
  });
});
