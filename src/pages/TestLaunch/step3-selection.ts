export function getVisibleScenarioSelectionState(selectedKeys: string[], visibleKeys: string[]): 'all' | 'partial' | 'none' {
  const visibleSelected = selectedKeys.filter(key => visibleKeys.includes(key));
  if (visibleKeys.length === 0 || visibleSelected.length === 0) return 'none';
  if (visibleSelected.length === visibleKeys.length) return 'all';
  return 'partial';
}

export function toggleVisibleScenarioSelection(selectedKeys: string[], visibleKeys: string[]): string[] {
  const state = getVisibleScenarioSelectionState(selectedKeys, visibleKeys);
  if (state === 'all') {
    return selectedKeys.filter(key => !visibleKeys.includes(key));
  }
  const remaining = selectedKeys.filter(key => !visibleKeys.includes(key));
  return [...remaining, ...visibleKeys];
}
