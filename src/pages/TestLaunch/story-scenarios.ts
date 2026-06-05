import type { StoryScenario } from '../../services/scenarios';

export function normalizeStoryScenarios(scenarios: StoryScenario[] | null | undefined): StoryScenario[] {
  return Array.isArray(scenarios) ? scenarios : [];
}
