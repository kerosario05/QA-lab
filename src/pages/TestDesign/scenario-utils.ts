import type {
  TestDesignDraftStory,
  TestDesignProject,
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
    data: [],
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
    data: source.data.map((field) => ({ ...field })),
    testRailCaseId: null,
    origin: 'manual',
    edited: false,
  };
}

// ---------------------------------------------------------------------------
// Test data ({{key}} placeholders). Mirrors src/test-design/test-data.ts in the engine.
// ---------------------------------------------------------------------------

export const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const SENSITIVE = /(pass(word)?|contrase|clave|\bpin\b|otp|token|secret|secreto|cvv|cvc|tarjeta|card)/i;

export function isSensitiveName(name: string): boolean {
  return SENSITIVE.test(name);
}

export function keyFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function labelFromKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

export function hasPlaceholders(text: string): boolean {
  return new RegExp(PLACEHOLDER.source).test(text);
}

export function placeholderKeys(texts: string[]): string[] {
  const keys: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      const key = match[1].toLowerCase();
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function scenarioTexts(s: TestDesignScenario): string[] {
  return [s.preconditions, s.expectedResult, ...s.steps.flatMap((step) => [step.action, step.expected])];
}

/** Adds a field for every {{key}} the user typed that has none yet. */
export function syncDataFields(s: TestDesignScenario): TestDesignScenario {
  const known = new Set(s.data.map((f) => f.key));
  const added = placeholderKeys(scenarioTexts(s))
    .filter((key) => !known.has(key))
    .map((key) => {
      const label = labelFromKey(key);
      return { key, label, description: '', value: '', sensitive: isSensitiveName(`${key} ${label}`) };
    });
  return added.length === 0 ? s : { ...s, data: [...s.data, ...added] };
}

/** Keys used in the texts that the user can still remove safely (declared but unreferenced). */
export function unusedDataKeys(s: TestDesignScenario): Set<string> {
  const used = new Set(placeholderKeys(scenarioTexts(s)));
  return new Set(s.data.filter((f) => !used.has(f.key)).map((f) => f.key));
}

export function missingDataCount(s: Pick<TestDesignScenario, 'data'>): number {
  return s.data.filter((f) => !f.value.trim()).length;
}

/** One entry per key across a story's scenarios, for filling a value once for all of them. */
export type StoryDataField = {
  key: string;
  label: string;
  description: string;
  sensitive: boolean;
  /** The value when every scenario using the key agrees; '' when empty, null when they differ. */
  value: string | null;
  scenarioCount: number;
  missing: number;
};

export function storyDataFields(scenarios: TestDesignScenario[]): StoryDataField[] {
  const byKey = new Map<string, StoryDataField & { values: Set<string> }>();
  for (const s of scenarios) {
    for (const f of s.data) {
      const entry = byKey.get(f.key) ?? {
        key: f.key,
        label: f.label,
        description: f.description,
        sensitive: false,
        value: '',
        scenarioCount: 0,
        missing: 0,
        values: new Set<string>(),
      };
      entry.sensitive = entry.sensitive || f.sensitive;
      entry.description = entry.description || f.description;
      entry.scenarioCount += 1;
      if (!f.value.trim()) entry.missing += 1;
      entry.values.add(f.value);
      byKey.set(f.key, entry);
    }
  }
  return [...byKey.values()].map(({ values, ...entry }) => ({
    ...entry,
    value: values.size === 1 ? [...values][0] : null,
  }));
}

/** Sets one key's value in every scenario that declares it. */
export function setStoryDataValue(scenarios: TestDesignScenario[], key: string, value: string): TestDesignScenario[] {
  return scenarios.map((s) =>
    s.data.some((f) => f.key === key)
      ? { ...s, data: s.data.map((f) => (f.key === key ? { ...f, value } : f)) }
      : s,
  );
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

/**
 * Initial project filter: a user with a single project sees only that project; with
 * several, the last choice if still granted, otherwise all of them.
 */
export function initialProjectFilter(projects: Pick<TestDesignProject, 'slug'>[], stored: string): string {
  if (projects.length === 1) return projects[0].slug;
  return projects.some((p) => p.slug === stored) ? stored : '';
}
