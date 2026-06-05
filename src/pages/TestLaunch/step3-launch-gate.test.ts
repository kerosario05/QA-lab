import { describe, expect, it } from 'vitest';

import { canContinueFromStep3, getStep3SelectionMessage } from './step3-launch-gate';

describe('step 3 launch gate - Jira source', () => {
  it('disables continue while stories are loading', () => {
    expect(canContinueFromStep3({
      storiesLoading: true, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: ['A'], source: 'jira',
    })).toBe(false);
  });

  it('disables continue when stories error', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: 'boom', totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBe(false);
  });

  it('disables continue when no stories', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBe(false);
  });

  it('disables continue when stories exist but none selected', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBe(false);
  });

  it('enables continue when stories exist and at least one selected', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: ['AA-1::0'], source: 'jira',
    })).toBe(true);
  });

  it('disables continue again when all deselected', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBe(false);
  });

  it('disables continue while re-fetching', () => {
    expect(canContinueFromStep3({
      storiesLoading: true, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBe(false);
  });
});

describe('step 3 launch gate - TestRail source', () => {
  it('disables continue while TR cases are loading', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: true, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], selectedTestRailCaseIds: [1], source: 'testrail',
    })).toBe(false);
  });

  it('disables continue when TR cases error', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: 'network error', trCasesCount: 0,
      selectedScenarioKeys: [], source: 'testrail',
    })).toBe(false);
  });

  it('disables continue when no TR cases', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'testrail',
    })).toBe(false);
  });

  it('disables continue when TR cases exist but none selected', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], source: 'testrail',
    })).toBe(false);
  });

  it('enables continue when TR cases exist and at least one selected', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], selectedTestRailCaseIds: [42], source: 'testrail',
    })).toBe(true);
  });
});

describe('step 3 launch gate - Both source', () => {
  it('disables continue while Jira stories loading', () => {
    expect(canContinueFromStep3({
      storiesLoading: true, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: ['AA-1::0'], selectedTestRailCaseIds: [42], source: 'both',
    })).toBe(false);
  });

  it('disables continue while TR cases loading', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: true, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: ['AA-1::0'], selectedTestRailCaseIds: [42], source: 'both',
    })).toBe(false);
  });

  it('enables continue when one source errored but the other has selections', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: 'boom', totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], selectedTestRailCaseIds: [42], source: 'both',
    })).toBe(true);
  });

  it('enables continue when both have data and either has selections', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: ['AA-1::0'], selectedTestRailCaseIds: [], source: 'both',
    })).toBe(true);
  });

  it('disables continue when both have no data', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'both',
    })).toBe(false);
  });

  it('disables continue when both have data but neither has selections', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], selectedTestRailCaseIds: [], source: 'both',
    })).toBe(false);
  });
});

describe('step 3 launch gate - edge cases', () => {
  it('handles undefined selectedTestRailCaseIds', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], source: 'testrail',
    })).toBe(false);

    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 5,
      selectedScenarioKeys: [], source: 'both',
    })).toBe(false);
  });

  it('disables continue on error with no fallback in both mode', () => {
    expect(canContinueFromStep3({
      storiesLoading: false, storiesError: 'boom', totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'both',
    })).toBe(false);
  });
});

describe('step 3 launch gate - selection message', () => {
  it('returns selection message when no scenarios selected', () => {
    expect(getStep3SelectionMessage({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toContain('Selecciona al menos un caso');
  });

  it('returns null while loading', () => {
    expect(getStep3SelectionMessage({
      storiesLoading: true, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBeNull();
  });

  it('returns null on stories error', () => {
    expect(getStep3SelectionMessage({
      storiesLoading: false, storiesError: 'error', totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBeNull();
  });

  it('returns null when no items', () => {
    expect(getStep3SelectionMessage({
      storiesLoading: false, storiesError: null, totalScenarios: 0,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: [], source: 'jira',
    })).toBeNull();
  });

  it('returns null when there are selections', () => {
    expect(getStep3SelectionMessage({
      storiesLoading: false, storiesError: null, totalScenarios: 3,
      trCasesLoading: false, trCasesError: null, trCasesCount: 0,
      selectedScenarioKeys: ['AA-1::0'], source: 'jira',
    })).toBeNull();
  });
});
