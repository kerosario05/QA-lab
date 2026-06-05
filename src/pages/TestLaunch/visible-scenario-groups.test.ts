import { describe, expect, it } from 'vitest';

import { buildVisibleScenarioGroups } from './visible-scenario-groups';

describe('visible scenario groups', () => {
  it('builds groups only from visible selectable rows', () => {
    const groups = buildVisibleScenarioGroups([
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
        scenarioCount: 0,
        scenarios: [],
      } as any,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].storyKey).toBe('AA-1');
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0].key).toBe('AA-1-0');
  });

  it('returns an empty array when no visible selectable rows exist', () => {
    expect(buildVisibleScenarioGroups([{ jiraKey: 'AA-3', title: 'Historia 3', generatedByAi: false, scenarioCount: 0, scenarios: [] } as any])).toEqual([]);
  });

  it('keeps row keys unique even if the backend repeats scenario identifiers', () => {
    const groups = buildVisibleScenarioGroups([
      {
        jiraKey: 'AA-4',
        title: 'Historia 4',
        generatedByAi: false,
        scenarioCount: 2,
        scenarios: [
          { scenarioId: 'dup', title: 'Escenario 1', refs: '', custom_preconds: null, custom_expected: '', custom_steps_separated: [] },
          { scenarioId: 'dup', title: 'Escenario 2', refs: '', custom_preconds: null, custom_expected: '', custom_steps_separated: [] },
        ],
      } as any,
    ]);

    expect(groups[0].rows.map(row => row.key)).toEqual(['dup', 'dup-1']);
  });
});
