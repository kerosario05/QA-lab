import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogService, ProjectServiceEntry } from '../../services/service-catalog';

const saved: Array<{ slug: string; enabled: boolean; settings: Record<string, unknown> }> = [];
const configs: Record<string, ProjectServiceEntry[]> = {};
const testCalls: Array<Record<string, unknown>> = [];

vi.mock('../../services/service-catalog', () => ({
  serviceCatalogApi: {
    projectServices: async (slug: string) => configs[slug] ?? [],
    saveProjectService: async (slug: string, _key: string, input: { enabled: boolean; settings: Record<string, unknown> }) => {
      saved.push({ slug, ...input });
      return { ok: true, action: 'updated' };
    },
    test: async (_slug: string, _key: string, params: Record<string, unknown>) => (testCalls.push(params), { ok: true, value: '482916', valueLength: 6, meta: { channel: 'ONBOARDINGWEB', source: 'generate' }, durationMs: 312 }),
  },
}));

const { ServiceConfigDrawer } = await import('./ServiceConfigDrawer');

/** One service, several projects: one form applies to every checked project. */

const service = {
  key: 'otp.oracle-local-token',
  name: 'OTP · Token local',
  category: 'otp',
  availability: { available: true, reasons: [], environment: 'local' },
  projects: [],
} as unknown as CatalogService;

const projects = ['fenix', 'kiosko', 'portal'].map((slug) => ({ id: slug, slug, name: slug.toUpperCase(), projectType: 1, status: 1, enabled: true }));

function entry(enabled: boolean, defaultChannel: string): ProjectServiceEntry {
  return {
    serviceKey: service.key, name: service.name, category: 'otp', configured: true, enabled, legacy: false, updatedAt: null,
    settings: { defaultChannel, allowedChannels: [defaultChannel], enabledEnvironments: ['local', 'qa'] },
  };
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  saved.length = 0;
  testCalls.length = 0;
  for (const key of Object.keys(configs)) delete configs[key];
});

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function checkbox(name: string) {
  return document.body.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
}

function button(text: string) {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim().endsWith(text)) as HTMLButtonElement;
}

describe('ServiceConfigDrawer', () => {
  it('enables the service in several projects with the same values and disables the unchecked ones', async () => {
    configs.fenix = [entry(true, 'ONBOARDINGWEB')];
    configs.kiosko = [entry(true, 'APP')];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<ServiceConfigDrawer service={service} projects={projects} onClose={() => undefined} onSaved={() => undefined} />));
    await flush();

    expect(checkbox('FENIX').checked).toBe(true);
    expect(checkbox('KIOSKO').checked).toBe(true);
    expect(checkbox('PORTAL').checked).toBe(false);
    // The form starts from the first enabled project; KIOSKO differs and is told so.
    expect(document.body.textContent).toContain('KIOSKO tiene otros valores');

    act(() => checkbox('PORTAL').click());
    act(() => checkbox('KIOSKO').click());
    await act(async () => { button('Guardar').click(); });
    await flush();

    const onboarding = { defaultChannel: 'ONBOARDINGWEB', allowedChannels: ['ONBOARDINGWEB'], enabledEnvironments: ['local', 'qa'] };
    expect(saved).toEqual([
      { slug: 'fenix', enabled: true, settings: onboarding },
      { slug: 'portal', enabled: true, settings: onboarding },
      // Disabling keeps KIOSKO's own values for when it is turned back on.
      { slug: 'kiosko', enabled: false, settings: { defaultChannel: 'APP', allowedChannels: ['APP'], enabledEnvironments: ['local', 'qa'] } },
    ]);
  });

  it('shows the code the test generated', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<ServiceConfigDrawer service={service} projects={projects} onClose={() => undefined} onSaved={() => undefined} />));
    await flush();
    const identity = document.body.querySelector('#service-identity') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setValue.call(identity, '00112345678'); identity.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { button('Probar').click(); });
    await flush();
    expect(document.body.querySelector('[aria-label="Código generado"]')?.textContent).toBe('482916');
    expect(document.body.textContent).toContain('channel: ONBOARDINGWEB');
  });

});
