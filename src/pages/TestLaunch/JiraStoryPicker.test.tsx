import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraStoryPicker, filterJiraIssues, type PickedJiraIssue } from './JiraStoryPicker';

/**
 * Step 2 of "Lanzar pruebas" (web, Jira or Ambos): after the Jira project, the user sees the
 * project's HU (no sprint, no status), searches them and picks which ones get scenarios.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const recent = [
  { key: 'AA-1', summary: 'Login con OTP', status: 'To Do' },
  { key: 'AA-2', summary: 'Consulta de estados de cuenta', status: 'Done' },
  { key: 'AA-3', summary: 'Generar turno en kiosko', status: 'QA' },
];
const searchHit = { key: 'AA-90', summary: 'Transferencias entre cuentas propias', status: 'In Progress' };

function stubJira(options: { failList?: boolean } = {}) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/issues/search')) return new Response(JSON.stringify({ ok: true, issues: [searchHit] }), { status: 200 });
    if (options.failList) return new Response('{}', { status: 503, statusText: 'Service Unavailable' });
    return new Response(JSON.stringify({ ok: true, issues: recent }), { status: 200 });
  }));
  return calls;
}

async function render(selected: PickedJiraIssue[], onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<JiraStoryPicker projectKey="AA" selected={selected} onChange={onChange} />);
  });
  return onChange;
}

const text = () => container?.textContent ?? '';
const rowButton = (label: string) =>
  Array.from(container!.querySelectorAll('button')).find(button => button.textContent?.includes(label))!;
const typeSearch = async (value: string) => {
  const input = container!.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('JiraStoryPicker', () => {
  it('filters by key or title, case-insensitive', () => {
    expect(filterJiraIssues(recent, 'aa-2').map(i => i.key)).toEqual(['AA-2']);
    expect(filterJiraIssues(recent, 'KIOSKO').map(i => i.key)).toEqual(['AA-3']);
    expect(filterJiraIssues(recent, '  ')).toHaveLength(3);
  });

  it('opens with the project HU (no sprint, no status) and toggles one', async () => {
    const calls = stubJira();
    const onChange = await render([{ key: 'AA-1', summary: 'Login con OTP' }]);

    expect(calls[0]).toContain('/api/jira/projects/AA/issues');
    expect(calls[0]).not.toContain('sprint');
    expect(text()).toContain('Generar turno en kiosko');
    expect(text()).toContain('1 seleccionada');

    await act(async () => { rowButton('AA-2').click(); });
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'AA-1', summary: 'Login con OTP' }, { key: 'AA-2', summary: 'Consulta de estados de cuenta' }]);
  });

  it('searches the whole project from two characters and keeps earlier picks', async () => {
    vi.useFakeTimers();
    const calls = stubJira();
    const onChange = await render([{ key: 'AA-1', summary: 'Login con OTP' }]);

    await typeSearch('transfer');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(calls.some(url => url.includes('/api/jira/projects/AA/issues/search?q=transfer'))).toBe(true);
    expect(text()).toContain('AA-90');
    expect(text()).not.toContain('Generar turno en kiosko');

    await act(async () => { rowButton('Todas').click(); });
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'AA-1', summary: 'Login con OTP' }, { key: 'AA-90', summary: searchHit.summary }]);
  });

  it('a picked HU can be removed from its chip', async () => {
    stubJira();
    const onChange = await render([{ key: 'AA-1', summary: 'Login con OTP' }, { key: 'AA-3', summary: 'x' }]);
    await act(async () => { (container!.querySelector('button[aria-label="Quitar AA-1"]') as HTMLButtonElement).click(); });
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'AA-3', summary: 'x' }]);
  });

  it('shows Jira failures with a retry, and warns past the per-generation limit', async () => {
    stubJira({ failList: true });
    await render([]);
    expect(text()).toContain('No se pudieron cargar las historias de Jira');
    expect(text()).toContain('Reintentar');

    act(() => root?.unmount());
    container?.remove();
    stubJira();
    await render(Array.from({ length: 6 }, (_, i) => ({ key: `AA-${i + 1}`, summary: `HU ${i + 1}` })));
    expect(text()).toContain('máximo de 5 HU');
  });
});
