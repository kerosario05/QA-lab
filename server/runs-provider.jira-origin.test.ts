import { afterEach, expect, it, vi } from 'vitest';
import { countScenarioDataOverrides, requestScenarioPreviewRun } from './runs-provider';
const original = process.env.RUN_PROVIDER_BASE_URL;
afterEach(() => { process.env.RUN_PROVIDER_BASE_URL = original; vi.restoreAllMocks(); });
it('forwards explicit Jira engine provenance and runtime input through the existing endpoint', async () => {
  process.env.RUN_PROVIDER_BASE_URL = 'http://localhost:3001';
  let body: any;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, jobId: 'fixture', status: 'queued' }), { status: 200 });
  });
  const story = { jiraKey: 'AA-88', title: 'Synthetic', scenarios: [{ scenarioId: 'AA-88:jira:1', refs: 'AA-88', title: 'Gate', unresolvedUiRequirements:[{stepIndex:1,requirement:'Action'}], conditionRequirements:[{key:'fixture',subject:'Fee',sourceClause:'Fee if applicable',stepIndices:[]}], reviewConfiguration:{conditions:{fixture:false}}, custom_steps_separated: [{ content: 'Click request' }] }] };
  const runtimeInputs = { 'AA-88:jira:1': { 'login.user': 'synthetic-user', 'login.password': 'synthetic-password' } };
  await requestScenarioPreviewRun([story] as any, 1, 2, 3, undefined, undefined, undefined, undefined, undefined, undefined, 'AA-88', 'synthetic', undefined,
    { executionEngine: 'jira_semantic', scenarioOrigin: { kind: 'jira_generated', jiraKey: 'AA-88' }, dataOverrides: runtimeInputs });
  expect(body.executionEngine).toBe('jira_semantic');
  expect(body.scenarioOrigin).toEqual({ kind: 'jira_generated', jiraKey: 'AA-88' });
  expect(body.dataOverrides).toEqual(runtimeInputs);
  expect(body.scenarios.map((scenario: any) => scenario.scenarioId)).toContain('AA-88:jira:1');
  expect(countScenarioDataOverrides(body.dataOverrides)).toEqual({ scenarios: 1, fields: 2 });
  expect(countScenarioDataOverrides({ 'AA-88:jira:1': { blank: '' } })).toEqual({ scenarios: 0, fields: 0 });
  expect(body.scenarios[0].appSlug).toBe('synthetic');
  expect(body.scenarios[0].unresolvedUiRequirements).toEqual(story.scenarios[0].unresolvedUiRequirements);
  expect(body.scenarios[0].conditionRequirements).toEqual(story.scenarios[0].conditionRequirements);
  expect(body.scenarios[0].reviewConfiguration).toEqual(story.scenarios[0].reviewConfiguration);
  await requestScenarioPreviewRun([story] as any, 1, 2, 3, undefined, undefined, undefined, undefined, undefined, undefined, 'AA-88', 'synthetic');
  expect(body.scenarios[0]).not.toHaveProperty('reviewConfiguration');
  expect(body.scenarios[0]).not.toHaveProperty('conditionRequirements');
});
