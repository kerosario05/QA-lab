import { describe, expect, it } from 'vitest';

import { buildStep3Rows, getScenarioStableKey } from './step3-rows';

describe('step 3 rows', () => {
  it('builds selectable rows from scenarios and a fallback row when scenarios are missing', () => {
    const rows = buildStep3Rows([
      {
        jiraKey: 'AA-1',
        title: 'Historia 1',
        generatedByAi: false,
        scenarioCount: 2,
        scenarios: [
          {
            title: 'Escenario 1',
            refs: 'AA-1-0',
            custom_preconds: null,
            custom_expected: 'OK',
            custom_steps_separated: [{ content: 'Paso 1', expected: 'OK' }],
          },
          {
            title: 'Escenario 2',
            refs: 'AA-1-1',
            custom_preconds: null,
            custom_steps_separated: undefined as any,
          },
        ],
      } as any,
      {
        jiraKey: 'AA-2',
        title: 'Historia 2',
        generatedByAi: false,
        scenarioCount: 1,
        scenarios: undefined as any,
      } as any,
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].key).toBe('AA-1-0');
    expect(rows[1].key).toBe('AA-1-1');
    expect(rows[2].key).toBe('AA-2-0');
    expect(rows[2].fallback).toBe(true);
  });

  it('returns an empty array when there are no valid scenarios', () => {
    expect(buildStep3Rows([{ jiraKey: 'AA-3', title: 'Historia 3', generatedByAi: false, scenarioCount: 0, scenarios: [] } as any])).toEqual([]);
  });

  it('builds stable keys with the requested priority', () => {
    expect(getScenarioStableKey({ scenarioId: 'SC-1' } as any, 0, 'AA-1', 'Fallback')).toBe('SC-1');
    expect(getScenarioStableKey({ caseId: 17 } as any, 0, 'AA-1', 'Fallback')).toBe('case-17');
    expect(getScenarioStableKey({ id: 'custom-id' } as any, 0, 'AA-1', 'Fallback')).toBe('custom-id');
    expect(getScenarioStableKey({ sourceTrace: { jiraIssueKey: 'AA-82' }, title: 'Título' } as any, 2, 'AA-1', 'Fallback')).toBe('AA-82-titulo');
    expect(getScenarioStableKey({ title: 'Primer escenario' } as any, 1, 'AA-1', 'Historia 1')).toBe('AA-1-1-primer-escenario');
  });
});
