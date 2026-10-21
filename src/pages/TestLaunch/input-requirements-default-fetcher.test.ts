import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRequirementsAfterSelection } from './input-requirements-loader';

describe('loadRequirementsAfterSelection default fetcher', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('sends the sync as a POST with the case text, so cases without persisted requirements get them', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (method === 'POST') {
        return new Response(JSON.stringify({ inputRequirements: [{ key: 'input.rnc', label: 'RNC', controlType: 'text' }] }), { status: 200 });
      }
      const synced = calls.some((call) => call.method === 'POST');
      return new Response(JSON.stringify({ inputRequirements: synced ? [{ key: 'input.rnc', label: 'RNC', controlType: 'text' }] : [] }), { status: 200 });
    }) as never;

    const states = await loadRequirementsAfterSelection('fenix', [54353], [
      { id: 54353, title: 'Login', custom_steps: '<ol><li>Ingresar RNC en "RNC".</li></ol>', runtimeTransformStatus: 'success' } as never,
    ]);

    const sync = calls.find((call) => call.url.endsWith('/input-requirements/sync'));
    expect(sync?.method).toBe('POST');
    expect(JSON.parse(sync?.body ?? '{}').rawTestRailCase.id).toBe(54353);
    expect(states[54353]).toMatchObject({ status: 'loaded' });
    expect((states[54353] as { inputRequirements: unknown[] }).inputRequirements).toHaveLength(1);
  });
});
