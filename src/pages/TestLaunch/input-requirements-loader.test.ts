import { describe, expect, it, vi } from 'vitest';
import {
  enrichCasesWithInputRequirements,
  loadInputRequirementsByCaseId,
  loadRequirementsAfterSelection,
  saveCaseInputRequirements,
} from './input-requirements-loader';
import { proxyCaseInputRequirements, proxySaveCaseInputRequirements } from '../../../server/routes/runtime-inputs';

describe('TestRail input requirements loader', () => {
  it('does not resurrect old inferred aliases after authoritative selection sync', async () => {
    const stale = [{ key: 'plan.source', label: 'Source' }, { key: 'input.source', label: 'Source' }];
    const current = [stale[0]];
    let count = 0;
    const states = await loadRequirementsAfterSelection('project-contract', [91], [{
      id: 91, custom_steps: 'Select source', inputRequirements: stale,
    }], async () => new Response(JSON.stringify({
      inputRequirements: ++count === 1 ? stale : current,
      inputRequirementsSyncVersion: 2,
    }), { status: 200 }));
    expect(states[91]).toEqual({ status: 'loaded', inputRequirements: current });
    expect(count).toBe(3);
  });
  it('loads requirements using the dynamic project slug and selected case id', async () => {
    const requests: string[] = [];
    const fetcher = async (url: string) => {
      requests.push(url);
      return new Response(JSON.stringify({
        projectSlug: 'project-from-config',
        caseId: 4171,
        inputRequirements: [{ key: 'account.email', required: true }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const states = await loadInputRequirementsByCaseId('project-from-config', [4171], fetcher);
    const cases = enrichCasesWithInputRequirements([{ id: 4171, title: 'Case 4171' }], states);

    expect(requests[0]).toMatch(/\/api\/projects\/project-from-config\/cases\/4171\/input-requirements$/);
    expect(cases[0].inputRequirements).toEqual([{ key: 'account.email', required: true }]);
    expect(states[4171]).toEqual({ status: 'loaded', inputRequirements: [{ key: 'account.email', required: true }] });
  });

  it('keeps requirements isolated by case id when several cases are selected', async () => {
    const fetcher = async (url: string) => {
      const caseId = Number(url.match(/cases\/(\d+)\//)?.[1]);
      return new Response(JSON.stringify({ inputRequirements: [{ key: `case.${caseId}`, required: true }] }), { status: 200 });
    };

    const states = await loadInputRequirementsByCaseId('project-b', [11, 22], fetcher);
    const cases = enrichCasesWithInputRequirements([{ id: 11, title: 'Case 11' }, { id: 22, title: 'Case 22' }], states);

    expect(cases.map((item) => item.inputRequirements)).toEqual([
      [{ key: 'case.11', required: true }],
      [{ key: 'case.22', required: true }],
    ]);
  });

  it('loads selected TestRail requirements and their last executed values without POST sync', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const rawCase = { id: 4171, title: 'Case 4171', runtimeTransformStatus: 'success', inputRequirements: [{ key: 'account.email', required: true }] };
    const fetcher = async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ inputRequirements: [{ key: 'account.email', required: true }], runtimeValues: { 'account.email': 'qa@example.test' } }), { status: 200 });
    };

    const states = await loadRequirementsAfterSelection('project-from-config', [4171], [rawCase], fetcher);

    expect(requests[0].url).toMatch(/\/api\/projects\/project-from-config\/cases\/4171\/input-requirements$/);
    expect(states[4171]).toEqual({
      status: 'loaded',
      inputRequirements: [{ key: 'account.email', required: true }],
      runtimeValues: { 'account.email': 'qa@example.test' },
    });
  });

  it('loads empty runtime requirements and preserves per-case transform errors', async () => {
    const states = await loadRequirementsAfterSelection('project-a', [1, 2], [
      { id: 1, title: 'Empty', runtimeTransformStatus: 'success', inputRequirements: [] },
      { id: 2, title: 'Broken', runtimeTransformStatus: 'error', runtimeTransformErrorCode: 'runtime_transform_failed' },
    ], async () => new Response('{}', { status: 200 }));

    expect(states[1]).toEqual({ status: 'loaded', inputRequirements: [] });
    expect(states[2]).toEqual({ status: 'error', error: 'runtime_transform_failed' });
  });

  it('syncs named fill fields after selection and reloads any saved runtime values', async () => {
    const requirements = [
      { key: 'input.username', label: 'Usuario', required: true },
      { key: 'input.password', label: 'Contraseña', controlType: 'password', required: true, sensitive: true },
    ];
    const requests: Array<{ url: string; method: string }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (method === 'POST') return new Response(JSON.stringify({ inputRequirements: requirements, persisted: true }), { status: 200 });
      const synced = requests.some((request) => request.method === 'POST');
      return new Response(JSON.stringify({
        inputRequirements: synced ? requirements : [],
        ...(synced ? { runtimeValues: { 'input.username': 'qa-user' } } : {}),
      }), { status: 200 });
    };

    const states = await loadRequirementsAfterSelection('project-from-config', [4172], [{
      id: 4172,
      title: 'Invalid sign in',
      runtimeTransformStatus: 'success',
      inputRequirements: [],
      custom_steps_separated: [{ content: 'Enter a user in "Username"' }],
    }], fetcher);

    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST', 'GET']);
    expect(requests[1].url).toMatch(/\/api\/projects\/project-from-config\/cases\/4172\/input-requirements\/sync$/);
    expect(states[4172]).toEqual({ status: 'loaded', inputRequirements: requirements, runtimeValues: { 'input.username': 'qa-user' } });
  });

  it('resyncs partial persisted fields so list inputs are not omitted', async () => {
    const partial = [{ key: 'saved.user', label: 'User' }];
    const complete = [...partial, { key: 'saved.account', label: 'Account', controlType: 'select' }];
    const methods: string[] = [];
    const states = await loadRequirementsAfterSelection('project-b', [42], [{
      id: 42, title: 'Selection', custom_steps: 'Select an account in "Account"', inputRequirements: partial,
    }], async (_url, init) => {
      methods.push(init?.method ?? 'GET');
      return new Response(JSON.stringify({ inputRequirements: methods.length === 1 ? partial : complete,
        inputRequirementsSyncVersion: 2,
        runtimeValues: { 'saved.user': 'synthetic-user', 'saved.account': 'synthetic-account' } }), { status: 200 });
    });
    expect(methods).toEqual(['GET', 'POST', 'GET']);
    expect(states[42]).toEqual({ status: 'loaded', inputRequirements: complete,
      runtimeValues: { 'saved.user': 'synthetic-user', 'saved.account': 'synthetic-account' } });
  });

  it('preserves populated contracts against an older backend that cannot complete partial fields safely', async () => {
    const requirements = [{ key: 'source', label: 'Source', controlType: 'select', required: true }];
    const methods: string[] = [];
    const states = await loadRequirementsAfterSelection('project-c', [43], [{
      id: 43, custom_steps: 'Select a value in "Source"',
    }], async (_url, init) => {
      methods.push(init?.method ?? 'GET');
      return new Response(JSON.stringify({ inputRequirements: requirements }), { status: 200 });
    });
    expect(methods).toEqual(['GET']);
    expect(states[43]).toEqual({ status: 'loaded', inputRequirements: requirements });
  });

  it('uses persisted spec-derived fields when the selected-case response has none', async () => {
    const persistedRequirements = [
      { key: 'usuario', label: 'Usuario', required: true },
      { key: 'contrasena', label: 'Contraseña', required: true, controlType: 'password' },
    ];
    const states = await loadRequirementsAfterSelection('fenix', [53821], [
      { id: 53821, title: 'Transferencia', runtimeTransformStatus: 'success', inputRequirements: [] },
    ], async () => new Response(JSON.stringify({ inputRequirements: persistedRequirements }), { status: 200 }));

    expect(states[53821]).toEqual({ status: 'loaded', inputRequirements: persistedRequirements });
  });

  it('keeps persisted fields available when selected TestRail transformation fails', async () => {
    const persistedRequirements = [{ key: 'account.number', label: 'Cuenta', required: true }];
    const states = await loadRequirementsAfterSelection('project-a', [53821], [
      { id: 53821, title: 'Promoted case', runtimeTransformStatus: 'error', runtimeTransformErrorCode: 'case_transform_failed' },
    ], async () => new Response(JSON.stringify({ inputRequirements: persistedRequirements }), { status: 200 }));

    expect(states[53821]).toEqual({ status: 'loaded', inputRequirements: persistedRequirements });
  });

  it('keeps requirements embedded in the selected case when transform status is missing', async () => {
    const requirements = [{ key: 'customer.email', label: 'Correo', required: true }];
    const states = await loadRequirementsAfterSelection('project-a', [53822], [
      { id: 53822, title: 'Case without transform marker', inputRequirements: requirements },
    ], async () => new Response('{}', { status: 200 }));

    expect(states[53822]).toEqual({ status: 'loaded', inputRequirements: requirements });
  });

  it('prefers fresh selected-case requirements over persisted copies with the same key', async () => {
    const states = await loadRequirementsAfterSelection('project-a', [22], [
      { id: 22, title: 'Case', runtimeTransformStatus: 'success', inputRequirements: [{ key: 'account.email', label: 'Fresh label', required: true }] },
    ], async () => new Response(JSON.stringify({ inputRequirements: [{ key: 'ACCOUNT.EMAIL', label: 'Stale label' }, { key: 'account.role', label: 'Role' }] }), { status: 200 }));

    expect(states[22].inputRequirements).toEqual([
      { key: 'account.email', label: 'Fresh label', required: true },
      { key: 'account.role', label: 'Role' },
    ]);
  });

  it('keeps runtime requirements isolated by TestRail caseId', async () => {
    const states = await loadRequirementsAfterSelection('project-a', [11, 22], [
      { id: 11, title: 'One', runtimeTransformStatus: 'success', inputRequirements: [{ key: 'case.11' }] },
      { id: 22, title: 'Two', runtimeTransformStatus: 'success', inputRequirements: [{ key: 'case.22' }] },
    ], async () => new Response('{}', { status: 200 }));

    expect(states[11].inputRequirements).toEqual([{ key: 'case.11' }]);
    expect(states[22].inputRequirements).toEqual([{ key: 'case.22' }]);
  });

  it('preserves the fresh canonical display, entity, value, and provenance metadata', async () => {
    const requirements = [{
      key: 'employee_1.document',
      label: 'Cédula empleado 1',
      displayLabel: 'Cédula',
      technicalLabel: 'employee_1.document',
      entityDisplayName: 'Empleado',
      datasetIdentity: 'employee',
      datasetOrdinal: 1,
      value: 'generated-document',
      source: 'deterministic_synthetic',
      generated: true,
      verified: false,
      editable: true,
      fieldCapability: { kind: 'text' as const },
    }];
    const states = await loadRequirementsAfterSelection('project-a', [44759], [{
      id: 44759,
      title: 'Fixture',
      runtimeTransformStatus: 'success',
      inputRequirements: requirements,
    }], async () => new Response('{}', { status: 200 }));

    expect(states[44759]).toEqual({ status: 'loaded', inputRequirements: requirements });
  });

  it('proxies persisted requirements by local project slug and case id', async () => {
    vi.stubEnv('SCENARIO_PREVIEW_BASE_URL', 'http://automation-engine.test');
    const request = { params: { projectSlug: 'project-a', caseId: '22' } } as any;
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })), json } as any;
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ inputRequirements: [] }), { status: 200 }));

    await proxyCaseInputRequirements(request, response, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/projects\/project-a\/cases\/22\/input-requirements$/),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(json).toHaveBeenCalledWith({ inputRequirements: [] });
  });

  it('forwards a valid PUT with both requirements unchanged', async () => {
    vi.stubEnv('SCENARIO_PREVIEW_BASE_URL', 'http://automation-engine.test');
    const request = {
      params: { projectSlug: 'project-a', caseId: '22' },
      body: { inputRequirements: [
        { key: 'account.email', label: 'Email', controlType: 'email', required: true, sensitive: false, allowedValues: [] },
        { key: 'account.role', label: 'Role', controlType: 'select', required: false, sensitive: false, allowedValues: ['admin'] },
      ] },
    } as any;
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })), json } as any;
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ ok: true, inputRequirements: request.body.inputRequirements }), { status: 200 });
    });

    await proxySaveCaseInputRequirements(request, response, fetcher);

    expect(captured?.url).toMatch(/\/api\/projects\/project-a\/cases\/22\/input-requirements$/);
    expect(captured?.init?.method).toBe('PUT');
    expect(JSON.parse(String(captured?.init?.body))).toEqual(request.body);
    expect(json).toHaveBeenCalledWith({ ok: true, inputRequirements: request.body.inputRequirements });
  });

  it('forwards an empty requirements list', async () => {
    vi.stubEnv('SCENARIO_PREVIEW_BASE_URL', 'http://automation-engine.test');
    const request = { params: { projectSlug: 'project-a', caseId: '22' }, body: { inputRequirements: [] } } as any;
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const response = { status: vi.fn(() => ({ json: vi.fn() })) } as any;

    await proxySaveCaseInputRequirements(request, response, fetcher);

    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ inputRequirements: [] });
  });

  it('rejects an invalid case id without calling Automation Engine', async () => {
    const request = { params: { projectSlug: 'project-a', caseId: 'not-an-id' }, body: { inputRequirements: [] } } as any;
    const response = { status: vi.fn(() => ({ json: vi.fn() })) } as any;
    const fetcher = vi.fn();

    await proxySaveCaseInputRequirements(request, response, fetcher);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a non-array inputRequirements body', async () => {
    const request = { params: { projectSlug: 'project-a', caseId: '22' }, body: { inputRequirements: {} } } as any;
    const response = { status: vi.fn(() => ({ json: vi.fn() })) } as any;
    const fetcher = vi.fn();

    await proxySaveCaseInputRequirements(request, response, fetcher);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('builds the frontend PUT request and preserves requirement metadata', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const requirements = [{ key: 'account.email', label: 'Email', controlType: 'email', required: true, sensitive: true, allowedValues: ['a'] }];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ ok: true, inputRequirements: requirements }), { status: 200 });
    });

    await saveCaseInputRequirements('project-a', 22, requirements, fetcher);

    expect(captured?.url).toMatch(/\/api\/projects\/project-a\/cases\/22\/input-requirements$/);
    expect(captured?.init?.method).toBe('PUT');
    expect(JSON.parse(String(captured?.init?.body))).toEqual({ inputRequirements: requirements });
  });
});
