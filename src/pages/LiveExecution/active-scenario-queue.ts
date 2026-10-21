import type { ActiveRun } from '../../types';

export type ActiveScenarioSeed = {
  id: string;
  title: string;
  steps: string[];
};

export function cleanScenarioText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Attach stable display order to the selected scenarios before a job starts. */
export function buildActiveScenarioQueue(seeds: ActiveScenarioSeed[]): NonNullable<ActiveRun['activeScenarios']> {
  const validSeeds = seeds.filter((scenario) => scenario.id.trim() && scenario.title.trim());
  const total = validSeeds.length;
  return validSeeds.map((scenario, index) => ({
      id: scenario.id.trim(),
      title: cleanScenarioText(scenario.title),
      steps: scenario.steps.map(cleanScenarioText).filter(Boolean),
      index: index + 1,
      total,
    }));
}

export function getInitialActiveScenario(run: Pick<ActiveRun, 'activeScenarios'> | null | undefined) {
  return run?.activeScenarios?.[0] ?? null;
}
