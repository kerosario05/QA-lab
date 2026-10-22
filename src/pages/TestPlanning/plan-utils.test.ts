import { describe, expect, it } from 'vitest';
import type { PlanScenario } from '../../services/test-planning';
import {
  blankExamples,
  blankScenario,
  moveItem,
  parseDiff,
  reviewState,
  scenarioChange,
  summarizeDraft,
} from './plan-utils';

const doc = {
  keywordOptions: [
    { keyword: 'Dado', kind: 'given' as const },
    { keyword: 'Cuando', kind: 'when' as const },
    { keyword: 'Entonces', kind: 'then' as const },
    { keyword: 'Y', kind: 'and' as const },
    { keyword: 'Pero', kind: 'but' as const },
  ],
};

const scenario = (id: string, title = id): PlanScenario => ({
  id,
  comments: [],
  tags: [],
  keyword: 'Escenario',
  title,
  steps: [{ keyword: 'Dado', text: 'algo' }],
  examples: [],
  locked: null,
});

describe('plan-utils', () => {
  it('blankScenario uses the plan language', () => {
    expect(blankScenario(doc).steps.map((s) => s.keyword)).toEqual(['Dado', 'Cuando', 'Entonces']);
  });

  it('moveItem swaps neighbours and ignores out-of-range moves', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('summarizeDraft counts edits, additions, removals and reordering', () => {
    const original = [scenario('s1'), scenario('s2'), scenario('s3')];
    expect(summarizeDraft(original, structuredClone(original)).dirty).toBe(false);
    const draft = [scenario('s2'), { ...scenario('s1'), title: 'otro' }, scenario('new-1')];
    expect(summarizeDraft(original, draft)).toEqual({ dirty: true, edited: 1, added: 1, removed: 1, reordered: true });
  });

  it('scenarioChange flags new and edited scenarios', () => {
    const originals = new Map([['s1', scenario('s1')]]);
    expect(scenarioChange(originals, scenario('s1'))).toBe('same');
    expect(scenarioChange(originals, { ...scenario('s1'), steps: [] })).toBe('edited');
    expect(scenarioChange(originals, scenario('x'))).toBe('new');
  });

  it('blankExamples takes the column names from <placeholders>', () => {
    const s = { ...scenario('s1'), steps: [{ keyword: 'Dado', text: 'el cliente "<cliente>" con <método>' }] };
    expect(blankExamples(s)).toEqual({ keyword: '', name: '', header: ['cliente', 'método'], rows: [['', '']] });
  });

  it('reviewState marks reviews of an older version as outdated', () => {
    expect(reviewState(null)).toBe('pending');
    const review = { outcome: 'accepted' as const, userName: 'ana', reviewedAt: '', commitSha: null, current: true };
    expect(reviewState(review)).toBe('accepted');
    expect(reviewState({ ...review, current: false })).toBe('outdated');
  });

  it('parseDiff drops headers and classifies lines', () => {
    const diff = 'diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n';
    expect(parseDiff(diff)).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'ctx', text: 'ctx' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
    ]);
  });
});
