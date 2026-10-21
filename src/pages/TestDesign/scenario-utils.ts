import type {
  TestDesignDatum,
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
    testRailDirty: false,
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

// ---- Test data: {{key}} placeholders ------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export const caseData = (scenario: TestDesignScenario): TestDesignDatum[] => scenario.data ?? [];

/** Keys referenced as {{key}} in the case's preconditions, steps and expected results. */
export function placeholderKeys(scenario: TestDesignScenario): string[] {
  const texts = [
    scenario.preconditions,
    scenario.expectedResult,
    ...scenario.steps.flatMap((step) => [step.action, step.expected]),
  ];
  const keys: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      if (!keys.some((k) => k.toLowerCase() === match[1].toLowerCase())) keys.push(match[1]);
    }
  }
  return keys;
}

/** Every {{key}} used in a text gets a data field automatically; existing ones keep their value. */
export function syncData(scenario: TestDesignScenario): TestDesignScenario {
  const data = caseData(scenario);
  const missing = placeholderKeys(scenario).filter((key) => !data.some((d) => d.key.toLowerCase() === key.toLowerCase()));
  if (missing.length === 0) return scenario;
  return {
    ...scenario,
    data: [...data, ...missing.map((key) => ({ key, value: '', sensitive: isSensitiveKey(key), description: '' }))],
  };
}

export const isSensitiveKey = (key: string) => /contrase(?:ñ|n)a|password|clave|\bpin\b|\botp\b|token|c[oó]digo|\bsms\b/i.test(key);

export type TextPart = { text: string; datum?: TestDesignDatum; key?: string };

/** Splits a text into plain parts and {{key}} references so the panel can show the value as a chip. */
export function textParts(text: string, data: TestDesignDatum[]): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({
      text: match[0],
      key: match[1],
      datum: data.find((d) => d.key.toLowerCase() === match[1].toLowerCase()),
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export const hasPlaceholders = (text: string) => /\{\{[^}]+\}\}/.test(text);

/** Data fields of a case that still have no value. */
export const pendingData = (scenario: TestDesignScenario) => caseData(scenario).filter((d) => !d.value);

export interface StoryDatumGroup {
  id: string;
  key: string;
  description: string;
  sensitive: boolean;
  condition?: 'valid' | 'invalid' | 'expired';
  cases: number;
  /** Shared value, or '' when the cases hold different ones. */
  value: string;
  mixed: boolean;
}

const groupId = (d: TestDesignDatum) => `${d.key.toLowerCase()}${d.label ? `:${d.label.toLowerCase()}` : ''}|${d.condition ?? ''}`;

/** The same datum (key + condition) used by several cases is edited once for the story. */
export function groupStoryData(scenarios: TestDesignScenario[]): StoryDatumGroup[] {
  const groups = new Map<string, StoryDatumGroup & { values: Set<string>; caseIds: Set<string> }>();
  for (const scenario of scenarios) {
    for (const datum of caseData(scenario)) {
      const id = groupId(datum);
      const group = groups.get(id) ?? {
        id,
        key: datum.label ?? datum.key,
        description: datum.description,
        sensitive: datum.sensitive,
        condition: datum.condition,
        cases: 0,
        value: '',
        mixed: false,
        values: new Set<string>(),
        caseIds: new Set<string>(),
      };
      group.values.add(datum.value);
      group.caseIds.add(scenario.id);
      groups.set(id, group);
    }
  }
  return [...groups.values()].map(({ values, caseIds, ...group }) => ({
    ...group,
    cases: caseIds.size,
    mixed: values.size > 1,
    value: values.size === 1 ? [...values][0] : '',
  }));
}

/** Writes one shared value into every case that uses that datum; touched cases count as edited. */
export function applyStoryDatum(scenarios: TestDesignScenario[], id: string, value: string): TestDesignScenario[] {
  return scenarios.map((scenario) => {
    let touched = false;
    const data = caseData(scenario).map((datum) => {
      if (groupId(datum) !== id || datum.value === value) return datum;
      touched = true;
      return { ...datum, value };
    });
    return touched ? {
      ...scenario,
      data,
      edited: true,
      testRailDirty: scenario.testRailDirty === true || scenario.testRailCaseId !== null,
    } : scenario;
  });
}
