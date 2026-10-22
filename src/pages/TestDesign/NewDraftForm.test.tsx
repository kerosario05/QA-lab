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

it('requires choosing the project card before the stories step and before generation', async () => {
  projectsRefApi.list.mockResolvedValue([{ id: 'p-a', slug: 'profile-a', name: 'Perfil A', projectType: 1, enabled: true }]);
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
  const button = (label: string) => [...host!.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label))!;

  // Step 1: the project panel comes first and is mandatory; the old <select> is gone.
  expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).toContain('¿Para qué proyecto diseñamos las pruebas?');
  expect(button('Continuar').disabled).toBe(true);
  expect(button('Elegir Jira')).toBeUndefined();

  click('Perfil A');
  expect(button('Continuar').disabled).toBe(false);
  click('Continuar');

  // Step 2: stories/destination; generation needs the Jira project and a story.
  expect(host.textContent).toContain('¿De qué historias generamos los casos?');
  expect(button('Generar escenarios').disabled).toBe(true);
  click('Elegir Jira');
  click('Elegir historia');
  expect(button('Generar escenarios').disabled).toBe(false);

  click('Generar escenarios');
  await act(async () => { await Promise.resolve(); });
  expect(testDesignApi.createDraft).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'profile-a', jiraProjectKey: 'PAY' }));
});
