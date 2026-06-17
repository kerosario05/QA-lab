import type { Story, StoryScenario, BlockedScenario } from './types';

export interface NormalizedPreviewResponse {
  stories: Story[];
  totalScenarios: number;
  sprint: { id: number; name: string } | null;
  rawShape: string;
  blockedScenarios: BlockedScenario[];
}

function parseMcpStep(step: string): { content: string; expected: string } {
  const sep = '\nEsperado:';
  const idx = step.indexOf(sep);
  if (idx !== -1) {
    return {
      content: step.slice(0, idx).trim(),
      expected: step.slice(idx + sep.length).trim(),
    };
  }
  return { content: step.trim(), expected: '' };
}

export function flatScenariosToStories(scenarios: unknown[]): Story[] {
  const groups = new Map<string, unknown[]>();
  for (const sc of scenarios) {
    const s = sc as Record<string, unknown>;
    const key = String(s.sourceIssueKey ?? s.jiraKey ?? s.issueKey ?? s.storyKey ?? s.source?.key ?? '') || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sc);
  }
  return Array.from(groups.entries()).map(([jiraKey, group]) => {
    const first = group[0] as Record<string, unknown>;
    const groupScenarios: StoryScenario[] = group.map((sc: unknown) => {
      const s = sc as Record<string, unknown>;
      const steps = Array.isArray(s.steps) ? s.steps.map((step: unknown) => parseMcpStep(String(step))) : [];
      const rp = s.routeProfile ? String(s.routeProfile) : undefined;
      return {
        title: String(s.title ?? ''),
        refs: String(s.sourceIssueKey ?? s.jiraKey ?? ''),
        custom_preconds: Array.isArray(s.preconditions) ? s.preconditions.join('\n') : (s.preconditions ? String(s.preconditions) : null),
        custom_expected: s.expectedResult ? String(s.expectedResult) : undefined,
        custom_steps_separated: steps,
        ...(rp ? { routeProfile: rp } : {}),
      };
    });
    return {
      jiraKey,
      title: String(first.title ?? ''),
      generatedByAi: true,
      scenarioCount: group.length,
      scenarios: groupScenarios,
    };
  });
}

export function normalizeScenarioPreviewResponse(response: unknown): NormalizedPreviewResponse {
  const rawShape = response === null ? 'null'
    : response === undefined ? 'undefined'
    : Array.isArray(response) ? 'array'
    : typeof response === 'object' ? `object:${Object.keys(response as object).join(',')}`
    : typeof response;

  const empty = (): NormalizedPreviewResponse => ({
    stories: [], totalScenarios: 0, sprint: null, rawShape, blockedScenarios: [],
  });

  if (!response || typeof response !== 'object') return empty();

  const data = response as Record<string, unknown>;
  let stories: Story[] = [];
  let isFlatScenarios = false;

  if (Array.isArray(data.stories)) {
    stories = data.stories as Story[];
  } else if (Array.isArray(data.scenarios)) {
    stories = flatScenariosToStories(data.scenarios);
    isFlatScenarios = true;
  } else if (Array.isArray(data.valid)) {
    stories = data.valid as Story[];
  } else if (Array.isArray(data.data)) {
    stories = data.data as Story[];
  } else if (Array.isArray(data.generated)) {
    stories = data.generated as Story[];
  } else if (data.result && typeof data.result === 'object' && Array.isArray((data.result as Record<string, unknown>).scenarios)) {
    stories = (data.result as Record<string, unknown>).scenarios as Story[];
  } else if (Array.isArray(response)) {
    stories = response as Story[];
  }

  const totalScenarios = typeof data.totalScenarios === 'number' ? data.totalScenarios
    : typeof data.total === 'number' ? data.total
    : typeof data.count === 'number' ? data.count
    : isFlatScenarios && Array.isArray(data.scenarios) ? data.scenarios.length
    : stories.length;

  const sprint = data.sprint && typeof data.sprint === 'object'
    ? { id: Number((data.sprint as Record<string, unknown>).id ?? 0), name: String((data.sprint as Record<string, unknown>).name ?? '') }
    : null;

  const blockedScenarios: BlockedScenario[] = Array.isArray(data.blockedScenarios)
    ? (data.blockedScenarios as BlockedScenario[])
    : [];

  return { stories, totalScenarios, sprint, rawShape, blockedScenarios };
}
