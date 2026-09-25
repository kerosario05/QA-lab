import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestRailUploadScreen } from './TestRailUploadScreen';
import type { RecordedScenario } from '../../services/recordings/types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/testrail/projects/') && url.includes('/suites')) {
        return jsonResponse({ suites: [{ id: 501, name: 'Suite QA', is_master: false }] });
      }
      if (url.includes('/api/testrail/projects')) {
        return jsonResponse({ projects: [{ id: 401, name: 'Proyecto QA' }] });
      }
      if (url.includes('/sections')) {
        return jsonResponse({ sections: [{ id: 601, name: 'Sección QA', depth: 0 }] });
      }
      return jsonResponse({});
    }),
  );
}

const scenario: RecordedScenario = {
  scenarioId: 'REC-A1DCF6A5-01',
  title: 'Kiosko2',
  functionalActionCount: 5,
} as unknown as RecordedScenario;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(ui: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The searchable selector's panel is rendered through a portal onto document.body, not
// inside `container` — so these look at `document`, not `container`.
function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
}

async function openDropdown(triggerText: string) {
  const trigger = findButton(triggerText);
  await act(async () => {
    trigger?.click();
  });
}

async function pickOption(optionText: string) {
  const option = findButton(optionText);
  await act(async () => {
    option?.click();
  });
  await flush();
}

// React overrides the native `value` setter on a tracked controlled input, so writing
// `input.value = x` directly does not trip its change-detection — the native setter must be
// invoked explicitly for `dispatchEvent('input')` to reach the component's onChange.
async function typeIntoSearch(input: HTMLInputElement, text: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    nativeSetter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('TestRailUploadScreen', () => {
  // CASE 4
  it('shows the dedicated destination title', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="a1dcf6a5-4a69-4015-8e44-cfb3ab75fd66"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(container?.textContent).toContain('Subir escenarios a TestRail');
    expect(container?.textContent).not.toContain('¿De dónde vienen los casos?');
    expect(container?.textContent).not.toContain('Generar escenarios');
    expect(container?.textContent).not.toContain('Enviar a TestRail');
    expect(container?.textContent).not.toContain('Reproducir y generar spec');
  });

  // CASE 4, 5, 6: only the "Solo TestRail" source card is shown — Recording's origin is
  // already known, so Jira and the combined option (both from the unrelated Jira/TestRail
  // "sources" flow) never appear here.
  it('shows only the "Solo TestRail" source card, never Jira or the combined option', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(container?.textContent).toContain('Solo TestRail');
    expect(container?.textContent).not.toContain('Solo Jira');
    expect(container?.textContent).not.toContain('Ambos combinados');
  });

  // CASE 5 / CASE UI-10 / CASE UI-11: no native <select> for Proyecto or Sección — the real
  // TestRail popup selector is used instead, with data sourced from the mocked API.
  it('shows Proyecto/Suite/Sección controls sourced from the API, not hardcoded, with no native <select> for Proyecto/Sección', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(container?.querySelectorAll('select').length).toBe(0);
    expect(findButton('Selecciona un proyecto…')).toBeTruthy();
    expect(findButton('Selecciona una sección…')).toBeTruthy();
    await openDropdown('Selecciona un proyecto…');
    expect(document.body.textContent).toContain('Proyecto QA'); // CASE 8: from mocked API, not a literal
    expect(document.body.textContent).not.toContain('Portal Empresarial');
  });

  // CASE UI-1 / CASE UI-2: project selector opens a custom popup with the search box.
  it('CASE UI-1/UI-2: project selector opens a custom popup with "Buscar proyecto..."', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(document.querySelector('input[placeholder="Buscar proyecto..."]')).toBeFalsy();
    await openDropdown('Selecciona un proyecto…');
    expect(document.querySelector('input[placeholder="Buscar proyecto..."]')).toBeTruthy();
    expect(document.body.textContent).toContain('1 de 1 proyecto');
  });

  // CASE UI-3 / CASE UI-4: search filters the list; selecting shows the green/check state.
  it('CASE UI-3/UI-4: project search filters, and the selected project shows a check', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/suites')) return jsonResponse({ suites: [{ id: 501, name: 'Suite QA', is_master: false }] });
      if (url.includes('/api/testrail/projects')) return jsonResponse({ projects: [{ id: 401, name: 'Proyecto QA' }, { id: 402, name: 'Otro proyecto' }] });
      if (url.includes('/sections')) return jsonResponse({ sections: [{ id: 601, name: 'Sección QA', depth: 0 }] });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    await openDropdown('Selecciona un proyecto…');
    expect(document.body.textContent).toContain('Proyecto QA');
    expect(document.body.textContent).toContain('Otro proyecto');

    const search = document.querySelector('input[placeholder="Buscar proyecto..."]') as HTMLInputElement;
    await typeIntoSearch(search, 'Otro');
    expect(document.body.textContent).not.toContain('Proyecto QA');
    expect(document.body.textContent).toContain('Otro proyecto');

    await pickOption('Otro proyecto');
    await openDropdown('Otro proyecto');
    // The selected row shows the filled green check indicator, not just its label.
    const selectedRow = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Otro proyecto') && b.className.includes('border-b'));
    expect(selectedRow?.className).toContain('bg-[#48A157]/5');
  });

  // CASE UI-5 / UI-6 / UI-7 / UI-8: section selector has the same popup/search/filter/selected
  // pattern.
  it('CASE UI-5..8: section selector opens a popup, filters by search, and shows selected state', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/suites')) return jsonResponse({ suites: [{ id: 501, name: 'Suite QA', is_master: false }] });
      if (url.includes('/api/testrail/projects')) return jsonResponse({ projects: [{ id: 401, name: 'Proyecto QA' }] });
      if (url.includes('/sections')) return jsonResponse({ sections: [{ id: 601, name: 'Sección QA', depth: 0 }, { id: 602, name: 'Subsección', depth: 1 }] });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    await openDropdown('Selecciona un proyecto…');
    await pickOption('Proyecto QA');
    await flush();

    await openDropdown('Selecciona una sección…');
    expect(document.querySelector('input[placeholder="Buscar sección..."]')).toBeTruthy();
    expect(document.body.textContent).toContain('2 de 2 secciones');
    // CASE UI-9: the depth badge only appears for the subsection, never invented for the root.
    expect(document.body.textContent).toContain('niv. 1');

    const search = document.querySelector('input[placeholder="Buscar sección..."]') as HTMLInputElement;
    await typeIntoSearch(search, 'Sub');
    expect(document.body.textContent).not.toContain('Sección QA');
    expect(document.body.textContent).toContain('Subsección');

    await pickOption('Subsección');
    await openDropdown('Subsección');
    const selectedRow = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Subsección') && b.className.includes('border-b'));
    expect(selectedRow?.className).toContain('bg-[#48A157]/5');
  });

  // CASE 7
  it('renders the TestRail panel header', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(container?.textContent).toContain('TestRail');
  });

  // CASE 6 + CASE 7
  it('disables Ejecutar Automatización until the TestRail destination is complete, then enables it', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    const button = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Ejecutar Automatización'));
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);

    await openDropdown('Selecciona un proyecto…');
    await pickOption('Proyecto QA');
    await flush(); // suite auto-selects (single suite in the mock)
    await openDropdown('Selecciona una sección…');
    await pickOption('Sección QA');

    const buttonAfter = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Ejecutar Automatización'));
    expect(buttonAfter?.disabled).toBe(false);
  });

  // Scenario summary (Phase 6)
  it('shows a compact selected-scenarios summary with functional action counts', async () => {
    stubFetch();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(container?.textContent).toContain('1 escenario seleccionado');
    expect(container?.textContent).toContain('Kiosko2');
    expect(container?.textContent).toContain('5 acciones funcionales');
  });

  // Back navigation
  it('calls onBack from the back link without discarding anything else', async () => {
    stubFetch();
    const onBack = vi.fn();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={onBack}
      />,
    );
    await flush();
    const back = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Volver a la grabación'));
    act(() => back?.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  async function selectFullDestination() {
    await openDropdown('Selecciona un proyecto…');
    await pickOption('Proyecto QA');
    await flush(); // suite auto-selects (single suite in the mock)
    await openDropdown('Selecciona una sección…');
    await pickOption('Sección QA');
  }

  // Single-call contract (Phase 9): "Ejecutar Automatización" makes exactly one request to
  // /execute, carrying testRailDestination alongside recordingId/scenarioIds — never a
  // separate publish call composed in front of it.
  it('sends one /execute request carrying testRailDestination, not a separate publish call', async () => {
    const executeCalls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/testrail/projects/') && url.includes('/suites')) return jsonResponse({ suites: [{ id: 501, name: 'Suite QA', is_master: false }] });
        if (url.includes('/api/testrail/projects')) return jsonResponse({ projects: [{ id: 401, name: 'Proyecto QA' }] });
        if (url.includes('/sections')) return jsonResponse({ sections: [{ id: 601, name: 'Sección QA', depth: 0 }] });
        if (url.includes('/testrail')) throw new Error('publishToTestRail must not be called by the destination screen anymore');
        if (url.includes('/execute')) {
          executeCalls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
          return jsonResponse({ ok: true, jobId: 'job-1', scenarioCount: 1, executionMode: 'shared_mcp_core' }, 202);
        }
        return jsonResponse({});
      }),
    );
    const onLaunch = vi.fn();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
        onLaunch={onLaunch}
      />,
    );
    await flush();
    await selectFullDestination();

    const button = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Ejecutar Automatización'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    await flush();

    expect(executeCalls.length).toBe(1);
    expect(executeCalls[0].url).toContain('/api/recordings/rec-1/execute');
    expect(executeCalls[0].body).toMatchObject({
      scenarioIds: ['REC-A1DCF6A5-01'],
      testRailDestination: { projectId: '401', suiteId: '501', sectionId: '601' },
    });
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }));
  });

  // reuse_existing now always runs as a background job (backend fix): the response carries a
  // jobId immediately, so this screen must hand off to the execution/Pass Rate view exactly
  // like any other launch — never show a static "reutilizado" summary as a stand-in for the
  // live run, and never leave the button in a loading state waiting for Playwright.
  it('CASE UI-1/2/7: reuse_existing hands off to onLaunch immediately via its jobId, button stops loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/testrail/projects/') && url.includes('/suites')) return jsonResponse({ suites: [{ id: 501, name: 'Suite QA', is_master: false }] });
        if (url.includes('/api/testrail/projects')) return jsonResponse({ projects: [{ id: 401, name: 'Proyecto QA' }] });
        if (url.includes('/sections')) return jsonResponse({ sections: [{ id: 601, name: 'Sección QA', depth: 0 }] });
        if (url.includes('/execute')) {
          return jsonResponse({
            ok: true,
            jobId: 'reuse-job-1',
            executionMode: 'reuse_existing_promoted_spec',
            scenarioCount: 1,
            fastPath: [{ scenarioId: 'REC-A1DCF6A5-01', caseId: 501, specPath: 'case.spec.ts', status: 'skipped' }],
            publishToTestRailInvoked: false,
            specGenerationInvoked: false,
          }, 202);
        }
        return jsonResponse({});
      }),
    );
    const onLaunch = vi.fn();
    render(
      <TestRailUploadScreen
        recordingId="rec-1"
        projectSlug="project"
        projectDetail={null}
        scenarios={[scenario]}
        dataOverrides={{}}
        datasetValues={{}}
        onBack={vi.fn()}
        onLaunch={onLaunch}
      />,
    );
    await flush();
    await selectFullDestination();

    const button = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Ejecutar Automatización'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    await flush();

    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'reuse-job-1', status: 'running' }));
    expect(container?.textContent).not.toContain('Automatización existente reutilizada');
    const buttonAfter = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Ejecutar Automatización'));
    expect(buttonAfter?.disabled).toBe(false);
  });
});
