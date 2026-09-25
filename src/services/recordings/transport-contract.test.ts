import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildRecordingExecutePayload, buildScenarioValueUpdateCommand, recordingsApi, serializedPayloadBytes } from './index';

describe('Recording command transport', () => {
  it('sends a small value command without the read model', () => {
    const command = buildScenarioValueUpdateCommand('project', 'scenario', 'entity_2.amount', '50000');
    expect(command).toEqual({ projectSlug: 'project', scenarioId: 'scenario', valueKey: 'entity_2.amount', value: '50000' });
    expect(JSON.stringify(command)).not.toContain('technicalKnowledge');
    expect(JSON.stringify(command)).not.toContain('rawTrace');
    expect(serializedPayloadBytes(command)).toBeLessThan(1024);
  });

  it('measures commands as UTF-8 bytes for transport diagnostics', () => {
    expect(serializedPayloadBytes({ value: 'á' })).toBeGreaterThan(serializedPayloadBytes({ value: 'a' }));
  });

  it('preserves the complete persisted scenario catalog through the proxy contract', async () => {
    const ids = ['primary', 'repeat', 'zero', 'alternative'];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      scenarios: ids.map((scenarioId) => ({ scenarioId })),
      lifecycle: { scenariosReady: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await recordingsApi.scenarios('recording', 'project');
    expect(result.scenarios.map((scenario) => scenario.scenarioId)).toEqual(ids);
    expect(result.scenarios).toHaveLength(4);
    vi.unstubAllGlobals();
  });

  it('keeps runtime requirement identity and constraint metadata in the preview model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      scenarios: [{
        scenarioId: 'repeat',
        runtimeInputRequirements: [{
          valueKey: 'entity_2.colaborador',
          semanticField: 'Colaborador',
          valueRole: 'action_input',
          required: true,
          editable: true,
          value: null,
          source: 'unresolved',
          resolved: false,
          constraints: [{ type: 'uniqueWithinCollection', uniqueWithinCollection: true }],
        }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await recordingsApi.scenarios('recording', 'project');
    const requirement = result.scenarios[0]?.runtimeInputRequirements?.[0];
    expect(requirement).toMatchObject({
      valueKey: 'entity_2.colaborador',
      required: true,
      editable: true,
      source: 'unresolved',
      resolved: false,
    });
    expect(requirement?.constraints?.[0]).toMatchObject({ type: 'uniqueWithinCollection', uniqueWithinCollection: true });
    vi.unstubAllGlobals();
  });

  // 2/status409 root cause: the backend's structured errorCode must survive the throw so a
  // caller can react to SCENARIO_NOT_READY specifically, without matching on human message text.
  it('a 409 SCENARIO_NOT_READY response throws an ApiError carrying the real errorCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      errorCode: 'SCENARIO_NOT_READY',
      error: 'SCENARIO_NOT_READY',
      message: 'La grabación todavía no tiene escenarios materializados',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })));

    await expect(recordingsApi.updateScenarioValue('rec-1', 'project', 'scenario-1', 'campo', 'valor')).rejects.toThrow(ApiError);
    try {
      await recordingsApi.updateScenarioValue('rec-1', 'project', 'scenario-1', 'campo', 'valor');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).errorCode).toBe('SCENARIO_NOT_READY');
    }
    vi.unstubAllGlobals();
  });
});

describe('Recording /execute — explicit spec-generation intent', () => {
  // CASE 1: plain replay (generateSpec omitted) must not carry the field at all.
  it('plain replay payload has no generateSpec field', () => {
    const payload = buildRecordingExecutePayload('project', ['s1', 's2']);
    expect(payload).toEqual({ projectSlug: 'project', scenarioIds: ['s1', 's2'], dataOverrides: undefined, datasetValues: undefined });
    expect('generateSpec' in payload).toBe(false);
  });

  it('plain replay payload has no generateSpec field when explicitly false', () => {
    const payload = buildRecordingExecutePayload('project', ['s1'], undefined, undefined, false);
    expect('generateSpec' in payload).toBe(false);
  });

  // CASE 2: "Reproducir y generar spec" must send exactly generateSpec: true.
  it('explicit replay payload carries generateSpec: true', () => {
    const payload = buildRecordingExecutePayload('project', ['s1', 's2'], undefined, undefined, true);
    expect(payload).toMatchObject({ projectSlug: 'project', scenarioIds: ['s1', 's2'], generateSpec: true });
  });

  // CASE 3: same recordingId/scenarioIds are used regardless of the generateSpec value —
  // only the flag changes between a plain replay and an explicit one.
  it('same recordingId and scenarioIds are sent for both plain and explicit replay', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.body);
      return new Response(JSON.stringify({ ok: true, jobId: 'job-1', scenarioCount: 2 }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await recordingsApi.execute('rec-1', 'project', ['s1', 's2'], undefined, undefined, false);
    await recordingsApi.execute('rec-1', 'project', ['s1', 's2'], undefined, undefined, true);

    const [plainBody, explicitBody] = calls.map((body) => JSON.parse(body as string));
    expect(plainBody.scenarioIds).toEqual(['s1', 's2']);
    expect(explicitBody.scenarioIds).toEqual(['s1', 's2']);
    expect(plainBody).not.toHaveProperty('generateSpec');
    expect(explicitBody.generateSpec).toBe(true);
    vi.unstubAllGlobals();
  });

  // CASE 4: the boolean reaches the wire as a real JSON boolean, not a coerced string.
  it('recordingsApi.execute transports generateSpec as a real boolean, not coerced', async () => {
    let sentBody: string | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = init?.body as string;
      return new Response(JSON.stringify({ ok: true, jobId: 'job-1', scenarioCount: 1 }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await recordingsApi.execute('rec-1', 'project', ['s1'], undefined, undefined, true);

    const parsed = JSON.parse(sentBody!);
    expect(parsed.generateSpec).toBe(true);
    expect(typeof parsed.generateSpec).toBe('boolean');
    vi.unstubAllGlobals();
  });

  // CASE 5: the payload builder has no knowledge of button labels/text — it only reacts to
  // the structured boolean argument. Passing any non-true value never fabricates intent.
  it('never infers intent from anything but the explicit boolean', () => {
    // @ts-expect-error verifying runtime behavior against a non-boolean caller mistake
    const truthyString = buildRecordingExecutePayload('project', ['s1'], undefined, undefined, 'Reproducir y generar spec');
    expect('generateSpec' in truthyString).toBe(false);
  });
});
