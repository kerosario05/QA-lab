import type { RecordedScenario } from '../../services/recordings/types';

export interface TestRailScenarioSelection {
  recordingId: string;
  scenario: RecordedScenario;
  dataOverrides: Record<number, string>;
  datasetValues: Record<string, string | undefined>;
}

export type TestRailSelection = Record<string, TestRailScenarioSelection>;

export function testRailSelectionKey(recordingId: string, scenarioId: string): string {
  return JSON.stringify([recordingId, scenarioId]);
}

function selectionIdentity(selection: TestRailScenarioSelection): string {
  const caseId = selection.scenario.testRailCaseId;
  return typeof caseId === 'number' && Number.isInteger(caseId) && caseId > 0
    ? JSON.stringify(['testrail-case', caseId])
    : testRailSelectionKey(selection.recordingId, selection.scenario.scenarioId);
}

export function toggleTestRailSelection(
  previous: TestRailSelection,
  selection: TestRailScenarioSelection,
): TestRailSelection {
  const key = testRailSelectionKey(selection.recordingId, selection.scenario.scenarioId);
  if (previous[key]) {
    const next = { ...previous };
    delete next[key];
    return next;
  }
  const duplicateKey = Object.entries(previous).find(([, current]) => (
    selectionIdentity(current) === selectionIdentity(selection)
  ))?.[0];
  if (duplicateKey) {
    const next = { ...previous };
    delete next[duplicateKey];
    return next;
  }
  return setTestRailScenarioSelected(previous, selection, true);
}

export function addDefaultTestRailSelection(
  previous: TestRailSelection,
  selection: TestRailScenarioSelection,
): TestRailSelection {
  return setTestRailScenarioSelected(previous, selection, true);
}

export function setTestRailScenarioSelected(
  previous: TestRailSelection,
  selection: TestRailScenarioSelection,
  isSelected: boolean,
): TestRailSelection {
  const key = testRailSelectionKey(selection.recordingId, selection.scenario.scenarioId);
  if (isSelected) {
    const withoutDuplicateCase = Object.fromEntries(Object.entries(previous).filter(([, current]) => (
      selectionIdentity(current) !== selectionIdentity(selection)
    )));
    return { ...withoutDuplicateCase, [key]: selection };
  }
  const next = Object.fromEntries(Object.entries(previous).filter(([, current]) => (
    selectionIdentity(current) !== selectionIdentity(selection)
  )));
  return Object.keys(next).length === Object.keys(previous).length ? previous : next;
}

export function getTestRailSelections(selection: TestRailSelection): TestRailScenarioSelection[] {
  return mergeTestRailSelections(Object.values(selection));
}

export function mergeTestRailSelections(
  ...groups: TestRailScenarioSelection[][]
): TestRailScenarioSelection[] {
  const merged = new Map<string, TestRailScenarioSelection>();
  for (const group of groups) {
    for (const selection of group) {
      const key = selectionIdentity(selection);
      if (!merged.has(key)) merged.set(key, selection);
    }
  }
  return [...merged.values()];
}
