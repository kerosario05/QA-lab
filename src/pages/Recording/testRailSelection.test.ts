import { describe, expect, it } from 'vitest';
import { getTestRailSelections, mergeTestRailSelections, setTestRailScenarioSelected, toggleTestRailSelection, type TestRailSelection } from './testRailSelection';
import type { RecordedScenario } from '../../services/recordings/types';

function entry(recordingId: string, scenarioId: string) {
  return {
    recordingId,
    scenario: { scenarioId, title: scenarioId } as RecordedScenario,
    dataOverrides: {},
    datasetValues: {},
  };
}

describe('TestRail selection across recordings', () => {
  it('preserves both selections and order across recording identities', () => {
    let selected: TestRailSelection = {};
    selected = toggleTestRailSelection(selected, entry('recording-a', 'scenario-a'));
    expect(getTestRailSelections(selected)).toHaveLength(1);
    selected = toggleTestRailSelection(selected, entry('recording-b', 'scenario-b'));
    expect(getTestRailSelections(selected).map(({ scenario }) => scenario.scenarioId)).toEqual(['scenario-a', 'scenario-b']);
    expect(Object.keys(selected)).toHaveLength(2);
  });

  it('deselects only the target composite recording/scenario identity', () => {
    let selected: TestRailSelection = {};
    selected = toggleTestRailSelection(selected, entry('recording-a', 'scenario-a'));
    selected = toggleTestRailSelection(selected, entry('recording-b', 'scenario-b'));
    selected = toggleTestRailSelection(selected, entry('recording-a', 'scenario-a'));
    expect(getTestRailSelections(selected).map(({ scenario }) => scenario.scenarioId)).toEqual(['scenario-b']);
  });

  it('does not duplicate the same selection when the event is repeated', () => {
    let selected: TestRailSelection = {};
    const selectedEntry = entry('recording-a', 'scenario-a');
    selected = setTestRailScenarioSelected(selected, selectedEntry, true);
    selected = setTestRailScenarioSelected(selected, selectedEntry, true);
    expect(getTestRailSelections(selected)).toHaveLength(1);
  });

  it('keeps same scenario IDs distinct when they belong to different recordings', () => {
    let selected: TestRailSelection = {};
    selected = toggleTestRailSelection(selected, entry('recording-a', 'scenario-shared'));
    selected = toggleTestRailSelection(selected, entry('recording-b', 'scenario-shared'));
    expect(getTestRailSelections(selected)).toHaveLength(2);
  });

  it('includes execute-only scenarios and deduplicates items checked for both actions', () => {
    const testrailSelection = entry('recording-a', 'scenario-a');
    const executeSelection = [entry('recording-a', 'scenario-a'), entry('recording-a', 'scenario-b')];
    expect(mergeTestRailSelections([testrailSelection], executeSelection).map(({ scenario }) => scenario.scenarioId))
      .toEqual(['scenario-a', 'scenario-b']);
  });
});
