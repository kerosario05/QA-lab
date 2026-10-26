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

/** Current Test Design output is tied to the exact Jira semantic scenario. */
export function isGeneratedFromCurrentStory(scenario: TestDesignScenario): boolean {
  return Boolean(scenario.jiraSourceScenarioId || scenario.jiraSourceScenario);
}

/** Keep archived/retained rows intact in storage while the workspace operates only on generated cases. */
export function currentGeneratedScenarios(scenarios: TestDesignScenario[]): TestDesignScenario[] {
  return scenarios.filter(isGeneratedFromCurrentStory);
}

export function mergeScenarioSubset(
  allScenarios: TestDesignScenario[],
  changedSubset: TestDesignScenario[],
): TestDesignScenario[] {
  const byId = new Map(changedSubset.map((scenario) => [scenario.id, scenario]));
  return allScenarios.map((scenario) => byId.get(scenario.id) ?? scenario);
}

export function replaceScenarioSubset(
  allScenarios: TestDesignScenario[],
  replacementSubset: TestDesignScenario[],
): TestDesignScenario[] {
  const replacementIds = new Set(replacementSubset.map((scenario) => scenario.id));
  let nextIndex = 0;
  const result = allScenarios.map((scenario) => {
    if (!replacementIds.has(scenario.id)) return scenario;
    return replacementSubset[nextIndex++];
  });
  const existingIds = new Set(allScenarios.map((scenario) => scenario.id));
  return [...result, ...replacementSubset.filter((scenario) => !existingIds.has(scenario.id))];
}

/** Unique missing AC references from the generated cases' coverage warnings. */
export function uncoveredAcceptanceCriteria(scenarios: TestDesignScenario[], generationError = ''): string[] {
  const texts = [generationError, ...currentGeneratedScenarios(scenarios).flatMap((scenario) => scenario.generationWarnings ?? [])];
  const ids = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/\bAC\d+(?:\.\d+)?\b/g)) ids.add(match[0]);
  }
  return [...ids].sort((a, b) => {
    const [, aMajor, aMinor = '0'] = a.match(/^AC(\d+)(?:\.(\d+))?$/) ?? [];
    const [, bMajor, bMinor = '0'] = b.match(/^AC(\d+)(?:\.(\d+))?$/) ?? [];
    return Number(aMajor) - Number(bMajor) || Number(aMinor) - Number(bMinor);
  });
}

/** Coverage gaps belong in the story summary, not repeated on every case card. */
export function scenarioReviewWarnings(scenario: TestDesignScenario): string[] {
  return (scenario.generationWarnings ?? []).filter((warning) =>
    !/Cobertura de la HU pendiente:|Faltan criterios de aceptación:|JIRA_ACCEPTANCE_COVERAGE_INCOMPLETE/i.test(warning.trim()));
}

export function hasValidGeneratedContract(scenario: TestDesignScenario): boolean {
  if (!isGeneratedFromCurrentStory(scenario) || !scenario.jiraSourceScenario || typeof scenario.jiraSourceScenario !== 'object') return false;
  const validation = (scenario.jiraSourceScenario as { validation?: { valid?: unknown } }).validation;
  return validation?.valid === true;
}

export function generatedContractErrors(scenario: TestDesignScenario): string[] {
  if (!isGeneratedFromCurrentStory(scenario) || !scenario.jiraSourceScenario || typeof scenario.jiraSourceScenario !== 'object') return [];
  const validation = (scenario.jiraSourceScenario as { validation?: { errors?: unknown } }).validation;
  return Array.isArray(validation?.errors) ? validation.errors.filter((error): error is string => typeof error === 'string') : [];
}

const CONTRACT_ISSUE_GUIDANCE: Record<string, string> = {
  JIRA_ABSENCE_REQUIRES_OBSERVED_CONTEXT: 'Agrega la navegación y la acción que dejan visible el contexto donde se comprobará la ausencia.',
  JIRA_ADDED_ROW_IDENTITY_INCOMPLETE: 'Después de guardar, comprueba en la misma fila todos los identificadores que se ingresaron.',
  JIRA_ASSERTION_CAPABILITY_UNSUPPORTED: 'Cambia la comprobación por un resultado visible que el motor pueda verificar.',
  JIRA_DUPLICATE_BASELINE_UNOBSERVED: 'Comprueba el estado inicial del registro antes de intentar duplicarlo.',
  JIRA_DUPLICATE_CASE_SETUP_UNDECLARED: 'Declara los valores de búsqueda o identidad que distinguen el caso duplicado.',
  JIRA_DUPLICATE_TARGET_AMBIGUOUS: 'Especifica cuál registro o control es el objetivo de la duplicación.',
  JIRA_GENERATED_ASSERTION_NOT_ATOMIC: 'Divide la comprobación en pasos atómicos, uno por resultado verificable.',
  JIRA_GENERATED_FIELD_UNBOUND: 'Asocia la acción con la etiqueta exacta del campo y su dato de prueba.',
  JIRA_GENERATED_STEP_NOT_ATOMIC: 'Divide la acción compuesta en pasos atómicos, uno por operación.',
  JIRA_NAVIGATION_TO_TARGET_SCREEN_MISSING: 'Agrega los pasos de navegación hasta la pantalla que valida este caso.',
  JIRA_UI_OBSERVATION_REQUIRED: 'Indica qué resultado debe observarse en pantalla después de la acción.',
  JIRA_UNSUPPORTED_INTENT: 'Reformula el paso con una acción que el motor soporte: Presionar, Ingresar, Seleccionar, Solicitar o Validar.',
};

export function generatedContractIssues(scenario: TestDesignScenario): Array<{ code: string; stepIndex?: number; location?: 'expected_result'; guidance: string }> {
  if (!isGeneratedFromCurrentStory(scenario) || !scenario.jiraSourceScenario || typeof scenario.jiraSourceScenario !== 'object') return [];
  const validation = scenario.jiraSourceScenario as { validation?: { errors?: unknown; issues?: unknown } };
  const details = Array.isArray(validation.validation?.issues) ? validation.validation.issues : [];
  const result: Array<{ code: string; stepIndex?: number; location?: 'expected_result'; guidance: string }> = [];
  const seen = new Set<string>();
  const add = (code: string, stepIndex?: number, location?: 'expected_result') => {
    const key = `${code}:${stepIndex ?? ''}:${location ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const guidance = location === 'expected_result' && code === 'JIRA_ASSERTION_CAPABILITY_UNSUPPORTED'
      ? 'Indica un resultado esperado visible en pantalla que el motor pueda comprobar.'
      : CONTRACT_ISSUE_GUIDANCE[code] ?? code.replace(/^JIRA_/, '').replaceAll('_', ' ').toLowerCase();
    result.push({ code, ...(stepIndex ? { stepIndex } : {}), ...(location ? { location } : {}), guidance });
  };
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const issue = detail as { code?: unknown; reason?: unknown; stepIndex?: unknown; step?: unknown; location?: unknown };
    const code = typeof issue.code === 'string' ? issue.code : typeof issue.reason === 'string' ? issue.reason : '';
    if (!code) continue;
    // Acceptance coverage belongs to the story summary. Older drafts copied it
    // onto every source scenario; do not turn that duplicate into a case defect.
    if (code.startsWith('JIRA_ACCEPTANCE_COVERAGE_INCOMPLETE')) continue;
    const reportedStepIndex = Number.isInteger(issue.stepIndex) && Number(issue.stepIndex) > 0 ? Number(issue.stepIndex) : undefined;
    const isExpectedResult = issue.location === 'expected_result' || (
      reportedStepIndex !== undefined
      && reportedStepIndex > scenario.steps.length
      && typeof issue.step === 'string'
      && issue.step.trim() === scenario.expectedResult.trim()
    );
    const stepIndex = isExpectedResult ? undefined : reportedStepIndex;
    add(code, stepIndex, isExpectedResult ? 'expected_result' : undefined);
  }
  if (Array.isArray(validation.validation?.errors)) {
    for (const error of validation.validation.errors) {
      if (typeof error !== 'string') continue;
      const code = error.split(':', 1)[0];
      if (code === 'JIRA_ACCEPTANCE_COVERAGE_INCOMPLETE') continue;
      if (code && !result.some(issue => issue.code === code)) add(code);
    }
  }
  return result;
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
    const testRailActionable = s.testRailCaseId === null || s.testRailDirty === true;
    if (s.selectedForTestRail && testRailActionable) testrail += 1;
    if (s.selectedForJira) jira += 1;
    if ((s.selectedForTestRail && testRailActionable || JIRA_PUBLISH_ENABLED && s.selectedForJira) && scenarioProblems(s).length > 0) blocked += 1;
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
  /** Disambiguated UI label when distinct runtime keys share the same visible field label. */
  displayLabel: string;
  sourceKey: string;
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
        displayLabel: datum.label ?? datum.key,
        sourceKey: datum.key,
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
  const result = [...groups.values()].map(({ values, caseIds, ...group }) => ({
    ...group,
    cases: caseIds.size,
    mixed: values.size > 1,
    value: values.size === 1 ? [...values][0] : '',
  }));
  const labelCounts = new Map<string, number>();
  for (const group of result) {
    const label = group.key.normalize('NFKC').trim().toLocaleLowerCase();
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return result.map(group => {
    const label = group.key.normalize('NFKC').trim().toLocaleLowerCase();
    if ((labelCounts.get(label) ?? 0) < 2) return group;
    const normalizeWords = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const labelWords = new Set(normalizeWords(group.key));
    const qualifier = group.condition === 'invalid' ? 'inválido'
      : group.condition === 'expired' ? 'vencido'
      : normalizeWords(group.sourceKey).filter(word => !labelWords.has(word) && !['jira', 'step', 'input'].includes(word)).join(' ')
        || group.sourceKey;
    return { ...group, displayLabel: `${group.key} · ${qualifier}` };
  });
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
