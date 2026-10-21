// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NewDraftForm } from './NewDraftForm';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { projectsRefApi, testDesignApi } = vi.hoisted(() => ({
  projectsRefApi: { list: vi.fn() },
  testDesignApi: { listJiraProjects: vi.fn(), createDraft: vi.fn(), generate: vi.fn() },
}));

vi.mock('../../services/identity', () => ({ projectsRefApi }));
vi.mock('../../services/test-design', () => ({ testDesignApi }));
vi.mock('../../components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ items, onSelect }: { items: { key: string; name: string }[]; onSelect: (item: { key: string; name: string }) => void }) => (
    <button onClick={() => onSelect(items[0])}>Elegir Jira</button>
  ),
}));
vi.mock('./StoryMultiPicker', () => ({
  StoryMultiPicker: ({ onChange }: { onChange: (stories: { issueKey: string; issueSummary: string }[]) => void }) => (
    <button onClick={() => onChange([{ issueKey: 'PAY-1', issueSummary: 'Pago' }])}>Elegir historia</button>
  ),
}));
vi.mock('../Recording/TestRailDestinationPicker', () => ({ TestRailDestinationPicker: () => null }));
vi.mock('./useTestDesignTestRailDestination', () => ({
  useTestDesignTestRailDestination: () => ({ destination: { projectId: '1', suiteId: '2', sectionId: '3' } }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
});

it('requires an automation profile before starting scenario generation', async () => {
  projectsRefApi.list.mockResolvedValue([{ slug: 'profile-a', name: 'Perfil A', enabled: true }]);
  testDesignApi.listJiraProjects.mockResolvedValue([{ key: 'PAY', name: 'Payments' }]);
  const created = { id: 'draft-1', stories: [] };
  testDesignApi.createDraft.mockResolvedValue(created);
  testDesignApi.generate.mockResolvedValue(created);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root!.render(<NewDraftForm onCancel={() => {}} onCreated={() => {}} />);
    await Promise.resolve();
  });
  const click = (label: string) => act(() => {
    [...host!.querySelectorAll('button')].find((button) => button.textContent?.includes(label))!.click();
  });
  click('Elegir Jira');
  click('Elegir historia');
  const generate = () => [...host!.querySelectorAll('button')].find((button) => button.textContent?.includes('Generar escenarios'))!;
  expect(generate().disabled).toBe(true);
  expect(generate().title).toContain('conocimiento');

  const profile = host.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    profile.value = 'profile-a';
    profile.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(generate().disabled).toBe(false);
});
