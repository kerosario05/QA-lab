import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestScenarioPreviewRun } from './runs-provider';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.RUN_PROVIDER_BASE_URL = 'http://localhost:3001';
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

function makeStory() {
  return {
    jiraKey: 'HU-TEST',
    title: 'HU Test',
    scenarios: [
      {
        refs: 'HU-TEST',
        title: 'Scenario 1',
        custom_steps_separated: [{ content: 'Step 1', expected: 'Result 1' }],
        custom_preconds: null,
        custom_expected: null,
      },
    ],
  };
}

describe('requestScenarioPreviewRun appSlug propagation', () => {
  it('explicit appSlug=project-a is passed to runner request body', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-1', status: 'running', scenarioCount: 1 }), { status: 200 });
    });

    await requestScenarioPreviewRun([makeStory()] as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'project-a');

    expect(capturedBody.appSlug).toBe('project-a');
  });

  it('explicit appSlug=project-b is passed to runner request body', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-2', status: 'running', scenarioCount: 1 }), { status: 200 });
    });

    await requestScenarioPreviewRun([makeStory()] as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'project-b');

    expect(capturedBody.appSlug).toBe('project-b');
  });

  it('absent appSlug falls back to arquitectura-automatizacion', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-3', status: 'running', scenarioCount: 1 }), { status: 200 });
    });

    await requestScenarioPreviewRun([makeStory()] as any);

    expect(capturedBody.appSlug).toBe('arquitectura-automatizacion');
  });

  it('scenarios in body also receive the explicit appSlug', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-4', status: 'running', scenarioCount: 1 }), { status: 200 });
    });

    await requestScenarioPreviewRun([makeStory()] as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'project-a');

    expect(capturedBody.scenarios[0].appSlug).toBe('project-a');
    expect(capturedBody.appSlug).toBe('project-a');
  });

  it('forwards structured routeProfile at the provider top level', async () => {
    let capturedBody: any = null;
    const routeProfile = { appSlug: 'project-a', route: { path: '/login' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
      capturedBody = JSON.parse(init?.body ?? '{}');
      return new Response(JSON.stringify({ ok: true, jobId: 'job-route-profile', status: 'running', scenarioCount: 1 }), { status: 200 });
    });

    await requestScenarioPreviewRun(
      [makeStory()] as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'project-a',
      routeProfile,
    );

    expect(capturedBody.routeProfile).toEqual(routeProfile);
    expect(typeof capturedBody.routeProfile).toBe('object');
    expect(capturedBody.scenarios[0].routeProfile).toBe('');
  });
});
