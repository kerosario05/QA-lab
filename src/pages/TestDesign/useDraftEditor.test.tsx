import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDesignApi, type TestDesignDraftWithStories, type TestDesignScenario } from '../../services/test-design';
import { useDraftEditor } from './useDraftEditor';

let host: HTMLDivElement | undefined;
let unmount: (() => Promise<void>) | undefined;

afterEach(async () => {
  await unmount?.();
  host?.remove();
  host = undefined;
  unmount = undefined;
  vi.restoreAllMocks();
});

const scenario: TestDesignScenario = {
  id: 'case-a', title: 'Caso', preconditions: '', steps: [], data: [], expectedResult: '',
  priority: 'medium', type: 'functional', selectedForTestRail: true, selectedForJira: false,
  testRailCaseId: null, origin: 'ai', edited: false,
};
const draft = {
  id: 'draft-a', status: 'draft', stories: [{ id: 'story-a', generationStatus: 'ready', scenarios: [scenario] }],
} as unknown as TestDesignDraftWithStories;

function renderEditor() {
  let editor: ReturnType<typeof useDraftEditor> | undefined;
  function Harness({ children }: { children?: ReactNode }) {
    editor = useDraftEditor('draft-a');
    return children ?? null;
  }
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  unmount = async () => { await act(async () => root.unmount()); };
  act(() => root.render(<Harness />));
  return () => editor!;
}

describe('useDraftEditor autosave', () => {
  it('does not mark an identical scenario list dirty or send an autosave', async () => {
    vi.spyOn(testDesignApi, 'getDraft').mockResolvedValue(draft);
    const save = vi.spyOn(testDesignApi, 'saveScenarios').mockResolvedValue({ ...draft.stories[0], scenarios: [scenario] });
    const getEditor = renderEditor();
    await vi.waitFor(() => expect(getEditor().draft).not.toBeNull());

    const current = getEditor().scenarios['story-a'];
    act(() => getEditor().updateScenarios('story-a', current));
    await new Promise(resolve => setTimeout(resolve, 900));

    expect(save).not.toHaveBeenCalled();
    expect(getEditor().saveState).toBe('idle');
    expect(getEditor().isDirty('story-a')).toBe(false);
  });

  it('keeps local catalog bindings when the save response omits them', async () => {
    const bound = {
      ...scenario,
      data: [{
        key: 'account', label: 'Cuenta de origen', value: '001111', sensitive: false, description: '',
        catalogBinding: { catalogId: 'accounts', optionId: 'checking', revision: 1, mode: 'automatic' as const },
      }],
    };
    const fixture = {
      ...draft,
      stories: [{ ...draft.stories[0], scenarios: [bound] }],
    } as TestDesignDraftWithStories;
    vi.spyOn(testDesignApi, 'getDraft').mockResolvedValue(fixture);
    vi.spyOn(testDesignApi, 'saveScenarios').mockResolvedValue({
      ...fixture.stories[0],
      scenarios: [{ ...bound, data: [{ key: 'account', label: 'Cuenta de origen', value: '001111', sensitive: false, description: '' }] }],
    });
    const getEditor = renderEditor();
    await vi.waitFor(() => expect(getEditor().draft).not.toBeNull());

    act(() => getEditor().updateScenarios('story-a', current => current.map(item => ({ ...item, edited: true }))));
    await vi.waitFor(() => expect(getEditor().saveState).toBe('saved'), { timeout: 2000 });

    expect(getEditor().scenarios['story-a'][0].data?.[0].catalogBinding).toEqual(bound.data[0].catalogBinding);
  });
});
