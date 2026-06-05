import type { Story, StoryScenario, ScenarioStep } from '../../services/scenarios';

export type Step3ScenarioRow = {
  key: string;
  storyKey: string;
  title: string;
  scenario?: StoryScenario | null;
  fallback: boolean;
  customPreconds: string | null;
  customExpected: string;
  steps: ScenarioStep[];
  references: string;
};

function normalizeScenarioSteps(steps: ScenarioStep[] | null | undefined): ScenarioStep[] {
  return Array.isArray(steps) ? steps : [];
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function toAsciiSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getScenarioStableKey(
  scenario: StoryScenario | null | undefined,
  index: number,
  storyKey: string,
  fallbackTitle: string,
): string {
  const scenarioRecord = scenario as unknown as Record<string, unknown> | null | undefined;
  const scenarioId = scenarioRecord && typeof scenarioRecord.scenarioId === 'string' && scenarioRecord.scenarioId.trim()
    ? scenarioRecord.scenarioId.trim()
    : '';
  if (scenarioId) return scenarioId;

  const caseId = scenarioRecord && typeof scenarioRecord.caseId === 'number' && Number.isFinite(scenarioRecord.caseId)
    ? `case-${scenarioRecord.caseId}`
    : '';
  if (caseId) return caseId;

  const id = scenarioRecord && typeof scenarioRecord.id === 'string' && scenarioRecord.id.trim()
    ? scenarioRecord.id.trim()
    : '';
  if (id) return id;

  const refs = scenarioRecord && typeof scenarioRecord.refs === 'string' && scenarioRecord.refs.trim()
    ? scenarioRecord.refs.trim()
    : '';
  if (refs) return refs;

  const sourceTrace = scenarioRecord && typeof scenarioRecord.sourceTrace === 'object' && scenarioRecord.sourceTrace
    ? scenarioRecord.sourceTrace as Record<string, unknown>
    : null;
  const jiraIssueKey = sourceTrace && typeof sourceTrace.jiraIssueKey === 'string' && sourceTrace.jiraIssueKey.trim()
    ? sourceTrace.jiraIssueKey.trim()
    : '';
  if (jiraIssueKey) {
    return `${jiraIssueKey}-${toAsciiSlug(scenario?.title || fallbackTitle)}`;
  }

  return `${storyKey}-${index}-${toAsciiSlug(normalizeTitle(scenario?.title || fallbackTitle))}`;
}

export function buildStep3Rows(stories: Story[] | null | undefined): Step3ScenarioRow[] {
  const safeStories = Array.isArray(stories) ? stories : [];

  return safeStories.flatMap<Step3ScenarioRow>(story => {
    const safeScenarios = Array.isArray(story.scenarios) ? story.scenarios : [];
    const seenKeys = new Set<string>();

    const makeUniqueKey = (baseKey: string, index: number): string => {
      if (!seenKeys.has(baseKey)) {
        seenKeys.add(baseKey);
        return baseKey;
      }
      const fallbackKey = `${baseKey}-${index}`;
      if (!seenKeys.has(fallbackKey)) {
        seenKeys.add(fallbackKey);
        return fallbackKey;
      }
      let suffix = 1;
      let nextKey = `${fallbackKey}-${suffix}`;
      while (seenKeys.has(nextKey)) {
        suffix += 1;
        nextKey = `${fallbackKey}-${suffix}`;
      }
      seenKeys.add(nextKey);
      return nextKey;
    };

    if (safeScenarios.length > 0) {
      return safeScenarios.map((scenario, index): Step3ScenarioRow => {
        const key = makeUniqueKey(getScenarioStableKey(scenario, index, story.jiraKey, story.title), index);
        return {
          key,
          storyKey: story.jiraKey,
          title: scenario?.title || story.title,
          scenario,
          fallback: false,
          customPreconds: scenario?.custom_preconds ?? null,
          customExpected: scenario?.custom_expected?.trim() || '',
          steps: normalizeScenarioSteps(scenario?.custom_steps_separated),
          references: scenario?.refs || '',
        };
      });
    }

    if ((story.scenarioCount ?? 0) > 0) {
      return [{
        key: makeUniqueKey(`${story.jiraKey}-0`, 0),
        storyKey: story.jiraKey,
        title: story.title,
        scenario: null,
        fallback: true,
        customPreconds: null,
        customExpected: '',
        steps: [],
        references: '',
      }];
    }

    return [];
  });
}
