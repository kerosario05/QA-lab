// @vitest-environment node
import { it, vi } from 'vitest';
import fs from 'node:fs';

it('repro loader against real backend', async () => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3001');
  const mod: any = await import('./input-requirements-loader');
  const raw = fs.readFileSync('C:/MisProyectos/arquitectura-IA-Playwright-feature-auth-gate/.artifacts/tmp/cases-4761.json', 'utf8').replace(/^\uFEFF/, '');
  const cases = JSON.parse(raw).cases;
  const logging = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    const clone = response.clone();
    console.log('REPRO-HTTP', init?.method ?? 'GET', url.replace('http://localhost:3001', ''), response.status, (await clone.text()).slice(0, 120));
    return response;
  };
  const states = await mod.loadRequirementsAfterSelection('fenix', [53821, 54353, 54373], cases, logging);
  for (const [id, st] of Object.entries<any>(states)) {
    console.log('REPRO', id, st.status, (st.inputRequirements ?? []).map((r: any) => r.key).join(','), st.error ?? '');
  }
}, 120000);
