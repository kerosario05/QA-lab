import type { Story } from '../../services/scenarios';

export function buildAllScenarioKeys(stories: Story[] | null | undefined): string[] {
  const safeStories = Array.isArray(stories) ? stories : [];
  return safeStories.flatMap(story => {
    const safeScenarios = Array.isArray(story.scenarios) ? story.scenarios : [];
    return safeScenarios.map((_, index) => `${story.jiraKey}::${index}`);
  });
}
