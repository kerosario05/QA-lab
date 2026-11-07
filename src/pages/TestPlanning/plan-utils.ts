import type { PlanDocument, PlanExamples, PlanReviewSummary, PlanScenario, StepKind } from '../../services/test-planning';

/** Pure helpers for the plan editor (kept out of the components so they can be tested). */

export function newScenarioId(): string {
  // crypto.randomUUID is unavailable on plain-http origins.
  return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function keywordFor(doc: Pick<PlanDocument, 'keywordOptions'>, kind: StepKind): string {
  return doc.keywordOptions.find((o) => o.kind === kind)?.keyword ?? '';
}

export function kindOf(doc: Pick<PlanDocument, 'keywordOptions'>, keyword: string): StepKind {
  return doc.keywordOptions.find((o) => o.keyword === keyword)?.kind ?? 'and';
}

export function blankScenario(doc: Pick<PlanDocument, 'keywordOptions'>): PlanScenario {
  return {
    id: newScenarioId(),
    comments: [],
    tags: [],
    keyword: '',
    title: '',
    steps: [
      { keyword: keywordFor(doc, 'given'), text: '' },
      { keyword: keywordFor(doc, 'when'), text: '' },
      { keyword: keywordFor(doc, 'then'), text: '' },
    ],
    examples: [],
    locked: null,
  };
}

export function duplicateScenario(scenario: PlanScenario): PlanScenario {
  return { ...structuredClone(scenario), id: newScenarioId(), title: `${scenario.title} (copia)`, locked: null };
}

/** Examples table seeded from the <placeholders> already used in the steps. */
export function blankExamples(scenario: PlanScenario): PlanExamples {
  const names = [...new Set(scenario.steps.flatMap((s) => [...s.text.matchAll(/<([^<>]+)>/g)].map((m) => m[1].trim())))];
  const header = names.length ? names : ['dato'];
  return { keyword: '', name: '', header, rows: [header.map(() => '')] };
}

function content(scenario: PlanScenario): string {
  return JSON.stringify([scenario.comments, scenario.tags, scenario.title, scenario.steps, scenario.examples]);
}

export type ScenarioChange = 'new' | 'edited' | 'same';

export function scenarioChange(originals: Map<string, PlanScenario>, scenario: PlanScenario): ScenarioChange {
  const before = originals.get(scenario.id);
  if (!before) return 'new';
  return content(before) === content(scenario) ? 'same' : 'edited';
}

export interface DraftSummary {
  dirty: boolean;
  edited: number;
  added: number;
  removed: number;
  reordered: boolean;
}

export function summarizeDraft(original: PlanScenario[], draft: PlanScenario[]): DraftSummary {
  const originals = new Map(original.map((s) => [s.id, s]));
  const edited = draft.filter((s) => scenarioChange(originals, s) === 'edited').length;
  const added = draft.filter((s) => !originals.has(s.id)).length;
  const removed = original.filter((s) => !draft.some((d) => d.id === s.id)).length;
  const kept = draft.filter((s) => originals.has(s.id)).map((s) => s.id);
  const reordered = kept.join() !== original.map((s) => s.id).filter((id) => kept.includes(id)).join();
  return { dirty: edited + added + removed > 0 || reordered, edited, added, removed, reordered };
}

export function defaultCommitMessage(issueKey: string): string {
  return `test(${issueKey}): completar escenarios del plan de pruebas (QA Lab)`;
}

export type ReviewState = 'pending' | 'accepted' | 'committed' | 'outdated';

export function reviewState(review: PlanReviewSummary | null | undefined): ReviewState {
  if (!review) return 'pending';
  if (!review.current) return 'outdated';
  return review.outcome;
}

export const REVIEW_LABELS: Record<ReviewState, { label: string; className: string; hint: string }> = {
  pending: { label: 'Pendiente', className: 'bg-[#F4F1EA] text-[#58646D]', hint: 'Nadie ha revisado esta versión del plan.' },
  accepted: { label: 'Validado', className: 'bg-[#48A157]/10 text-[#48A157]', hint: 'Aceptado como válido sin cambios.' },
  committed: { label: 'Validado con cambios', className: 'bg-[#104B99]/10 text-[#104B99]', hint: 'QA completó los escenarios e hizo commit.' },
  outdated: { label: 'Revisión desactualizada', className: 'bg-[#FFF7E6] text-[#8A5A00]', hint: 'El archivo cambió después de la última revisión.' },
};

export interface DiffLine {
  kind: 'add' | 'del' | 'hunk' | 'ctx' | 'meta';
  text: string;
}

/** Classifies a unified diff for rendering; drops the git header lines. */
export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of diff.split(/\r?\n/)) {
    if (/^(diff --git|index |--- |\+\+\+ )/.test(line)) continue;
    if (line.startsWith('@@')) lines.push({ kind: 'hunk', text: line });
    else if (line.startsWith('+')) lines.push({ kind: 'add', text: line.slice(1) });
    else if (line.startsWith('-')) lines.push({ kind: 'del', text: line.slice(1) });
    else if (line.startsWith('\\')) lines.push({ kind: 'meta', text: line });
    else if (line.length) lines.push({ kind: 'ctx', text: line.slice(1) });
  }
  return lines;
}
