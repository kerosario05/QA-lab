import { describe, expect, it } from 'vitest';

import { getVisibleScenarioSelectionState, toggleVisibleScenarioSelection } from './step3-selection';

describe('step 3 selection', () => {
  it('select all selects only visible valid scenarios and toggles off when all are selected', () => {
    const visibleKeys = ['AA-1::0', 'AA-1::1', 'AA-2::0'];
    const initially = ['AA-99::0'];

    const selected = toggleVisibleScenarioSelection(initially, visibleKeys);
    expect(selected).toEqual(['AA-99::0', 'AA-1::0', 'AA-1::1', 'AA-2::0']);
    expect(getVisibleScenarioSelectionState(selected, visibleKeys)).toBe('all');

    const cleared = toggleVisibleScenarioSelection(selected, visibleKeys);
    expect(cleared).toEqual(['AA-99::0']);
    expect(getVisibleScenarioSelectionState(cleared, visibleKeys)).toBe('none');
  });
});
