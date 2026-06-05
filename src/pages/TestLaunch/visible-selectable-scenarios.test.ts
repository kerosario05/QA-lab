import { describe, expect, it } from 'vitest';

import { buildVisibleSelectableScenarios } from './visible-selectable-scenarios';

describe('visible selectable scenarios', () => {
  it('builds rows from story scenarios and fallback content', () => {
    const rows = buildVisibleSelectableScenarios([
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

    expect(rows.map(row => row.key)).toEqual(['AA-1-0', 'AA-2-0']);
  });

  it('drops stories without executable content', () => {
    expect(buildVisibleSelectableScenarios([{ jiraKey: 'AA-3', title: 'Historia 3', generatedByAi: false, scenarioCount: 0, scenarios: [] } as any])).toEqual([]);
  });
});
