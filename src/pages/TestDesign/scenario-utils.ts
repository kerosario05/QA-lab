import type {
  TestDesignDraftStory,
  TestDesignPriority,
  TestDesignScenario,
  TestDesignScenarioType,
} from '../../services/test-design';

/**
 * Pure helpers behind the test design editor. The engine re-validates everything
 * on save and publish; these only keep the screen honest about what it will send.
 */

export const PRIORITY_LABELS: Record<TestDesignPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const TYPE_LABELS: Record<TestDesignScenarioType, string> = {
  functional: 'Funcional',
  negative: 'Negativo',
  edge: 'Borde',
  regression: 'Regresión',
  other: 'Otro',
};

/** `crypto.randomUUID` only exists in secure contexts; the panel is also served over plain http. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // insecure context: fall through
    }
  }
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newScenario(): TestDesignScenario {
  return {
    id: newId(),
    title: '',
    preconditions: '',
    steps: [{ action: '', expected: '' }],
    expectedResult: '',
    priority: 'medium',
    type: 'functional',
    selectedForTestRail: true,
    selectedForJira: true,
    testRailCaseId: null,
    origin: 'manual',
    edited: false,
  };
}

/** A copy is a new case: new id, no TestRail link, written by a person. */
export function duplicateScenario(source: TestDesignScenario): TestDesignScenario {
  return {
    ...source,
    id: newId(),
    title: `${source.title} (copia)`.slice(0, 250),
    steps: source.steps.map((step) => ({ ...step })),
    testRailCaseId: null,
    origin: 'manual',
    edited: false,
  };
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Publishing to Jira (one sub-task per story) is built in the engine but hidden
 * in the panel for now: only TestRail is offered. Flip to re-enable the Jira
 * button, the per-scenario "Jira" toggle and its counters.
 */
export const JIRA_PUBLISH_ENABLED = false;

/** Whether the scenario is going anywhere the panel currently offers. */
export function isSelectedForPublish(scenario: TestDesignScenario): boolean {
  return scenario.selectedForTestRail || (JIRA_PUBLISH_ENABLED && scenario.selectedForJira);
}

export type Destination = 'testrail' | 'jira';

export function isSelectedFor(scenario: TestDesignScenario, destination: Destination): boolean {
  return destination === 'testrail' ? scenario.selectedForTestRail : scenario.selectedForJira;
}

export function setSelection(
  scenarios: TestDesignScenario[],
  destination: Destination,
  value: boolean,
): TestDesignScenario[] {
  const field = destination === 'testrail' ? 'selectedForTestRail' : 'selectedForJira';
  return scenarios.map((s) => (s[field] === value ? s : { ...s, [field]: value }));
}

/** Mirrors `findPublishIssues` in the engine: only selected scenarios are checked. */
export function scenarioProblems(scenario: TestDesignScenario): string[] {
  const problems: string[] = [];
  if (!scenario.title.trim()) problems.push('Falta el título');
  const steps = scenario.steps.filter((s) => s.action.trim() || s.expected.trim());
  if (steps.length === 0) problems.push('Agrega al menos un paso');
  steps.forEach((step, i) => {
    if (!step.action.trim()) problems.push(`El paso ${i + 1} no tiene acción`);
  });
  if (!scenario.expectedResult.trim() && steps.every((s) => !s.expected.trim())) {
    problems.push('Falta el resultado esperado');
  }
  return problems;
}

export type SelectionCounts = { total: number; testrail: number; jira: number; blocked: number };

export function countSelection(scenarios: TestDesignScenario[]): SelectionCounts {
  let testrail = 0;
  let jira = 0;
  let blocked = 0;
  for (const s of scenarios) {
    if (s.selectedForTestRail) testrail += 1;
    if (s.selectedForJira) jira += 1;
    if (isSelectedForPublish(s) && scenarioProblems(s).length > 0) blocked += 1;
  }
  return { total: scenarios.length, testrail, jira, blocked };
}

export function sumCounts(counts: SelectionCounts[]): SelectionCounts {
  return counts.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      testrail: acc.testrail + c.testrail,
      jira: acc.jira + c.jira,
      blocked: acc.blocked + c.blocked,
    }),
    { total: 0, testrail: 0, jira: 0, blocked: 0 },
  );
}

export function isGenerating(story: Pick<TestDesignDraftStory, 'generationStatus'>): boolean {
  return story.generationStatus === 'generating';
}

/**
 * What the editor should show for each story after a poll: the server's list,
 * except for stories with local edits not yet saved — those keep the local copy
 * so a poll never wipes what the user is typing.
 */
export function mergeServerScenarios(
  local: Record<string, TestDesignScenario[]>,
  stories: Pick<TestDesignDraftStory, 'id' | 'scenarios'>[],
  dirty: ReadonlySet<string>,
): Record<string, TestDesignScenario[]> {
  const next: Record<string, TestDesignScenario[]> = {};
  for (const story of stories) {
    next[story.id] = dirty.has(story.id) && local[story.id] ? local[story.id] : story.scenarios;
  }
  return next;
}
