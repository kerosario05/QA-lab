import type { Story } from '../../services/scenarios';
import { buildVisibleSelectableScenarios, type VisibleSelectableScenario } from './visible-selectable-scenarios';

export interface VisibleScenarioGroup {
  key: string;
  storyKey: string;
  storyTitle: string;
  storyType?: string;
  generatedByAi: boolean;
  rows: VisibleSelectableScenario[];
}

export function buildVisibleScenarioGroups(stories: Story[] | null | undefined): VisibleScenarioGroup[] {
  const visibleRows = buildVisibleSelectableScenarios(stories);
  const safeStories = Array.isArray(stories) ? stories : [];
  const storyByKey = new Map<string, Story>();
  safeStories.forEach((story) => {
    if (!storyByKey.has(story.jiraKey)) {
      storyByKey.set(story.jiraKey, story);
    }
  });

  const grouped = new Map<string, VisibleSelectableScenario[]>();
  visibleRows.forEach((row) => {
    const current = grouped.get(row.storyKey) ?? [];
    grouped.set(row.storyKey, [...current, row]);
  });

  return Array.from(grouped.entries()).map(([storyKey, rows], index) => {
    const story = storyByKey.get(storyKey);
    return {
      key: story ? story.jiraKey : `${storyKey}-${index}`,
      storyKey,
      storyTitle: story?.title ?? rows[0]?.title ?? storyKey,
      storyType: story?.storyType,
      generatedByAi: Boolean(story?.generatedByAi),
      rows,
    };
  });
}
