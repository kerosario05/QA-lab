import { describe, expect, it } from 'vitest';
import { proxyScenarioAutofill } from './runtime-inputs';

function responseMock() {
  const result = { statusCode: 0, body: undefined as unknown };
  return {
    result,
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
}

describe('scenario autofill proxy', () => {
  it('forwards the configured target request and preserves the JSON response', async () => {
    const previous = process.env.SCENARIO_PREVIEW_BASE_URL;
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://configured-engine:3002/';
    const response = responseMock();
    let request: { url: string; init?: RequestInit } | undefined;
    const body = {
      seed: 'fixture-seed',
      requirements: [{ key: 'fixture.value', inputRole: 'scenario', valuePolicy: 'scenario_controlled', scenarioDataPolicy: 'synthetic_allowed', fieldCapability: { kind: 'number', constraints: { min: 1, max: 3 } } }],
    };

    await proxyScenarioAutofill({ body } as any, response as any, async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ generated: [{ key: 'fixture.value', status: 'generated', value: 2 }] }), { status: 201 });
    });

    expect(request?.url).toBe('http://configured-engine:3002/api/runtime-inputs/scenario-autofill');
    expect(request?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(request?.init?.body))).toEqual(body);
    expect(response.result).toEqual({ statusCode: 201, body: { generated: [{ key: 'fixture.value', status: 'generated', value: 2 }] } });
    if (previous === undefined) delete process.env.SCENARIO_PREVIEW_BASE_URL;
    else process.env.SCENARIO_PREVIEW_BASE_URL = previous;
  });

  it('preserves upstream error status and returns proxy errors as JSON', async () => {
    process.env.SCENARIO_PREVIEW_BASE_URL = 'http://configured-engine:3002';
    const upstreamError = responseMock();
    await proxyScenarioAutofill({ body: {} } as any, upstreamError as any, async () => new Response(JSON.stringify({ error: 'rejected' }), { status: 422 }));
    expect(upstreamError.result).toEqual({ statusCode: 422, body: { error: 'rejected' } });

    const networkError = responseMock();
    await proxyScenarioAutofill({ body: {} } as any, networkError as any, async () => { throw new Error('engine unavailable'); });
    expect(networkError.result.statusCode).toBe(502);
    expect(networkError.result.body).toMatchObject({ ok: false, errorCode: 'PROXY_ERROR' });
  });
});
