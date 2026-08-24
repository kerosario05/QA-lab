import { afterEach, describe, expect, it, vi } from 'vitest';
import { runsProxy, toRunLogEntry, type RunPayload } from './index';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('runs service log mapping', () => {
  it('preserva logs SSE con payload { line }', () => {
    expect(toRunLogEntry({ line: '[discovery:preview] Results: 5 passed, 2 failed out of 7' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: '[discovery:preview] Results: 5 passed, 2 failed out of 7',
    });
  });

  it('mantiene payloads que ya vienen con message', () => {
    expect(toRunLogEntry({ message: 'stdout real', level: 'info' })).toEqual({
      message: 'stdout real',
      level: 'info',
    });
  });

  it('maneja payload con { log }', () => {
    expect(toRunLogEntry({ log: 'texto desde log' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: 'texto desde log',
    });
  });

  it('maneja payload con { text }', () => {
    expect(toRunLogEntry({ text: 'texto plano' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: 'texto plano',
    });
  });

  it('maneja string directo', () => {
    expect(toRunLogEntry('linea directa')).toEqual({
      message: 'linea directa',
    });
  });

  it('retorna null para string vacío', () => {
    expect(toRunLogEntry('')).toBeNull();
  });

  it('retorna null para objeto con línea vacía', () => {
    expect(toRunLogEntry({ line: '' })).toBeNull();
  });

  it('retorna null para objeto vacío', () => {
    expect(toRunLogEntry({})).toBeNull();
  });
});

describe('runsProxy.getEvidenceDocumentStatus', () => {
  it('devuelve ready con contrato estructurado', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        jobId: 'job-ready',
        status: 'ready',
        documentReady: true,
        reasonCode: 'ready',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    const result = await runsProxy.getEvidenceDocumentStatus('job-ready');
    expect(result.status).toBe('ready');
    expect(result.documentReady).toBe(true);
    expect(result.reasonCode).toBe('ready');
  });

  it('maneja 404 job_not_found sin lanzar excepción', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        jobId: 'job-missing',
        status: 'not_found',
        documentReady: false,
        reasonCode: 'job_not_found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    const result = await runsProxy.getEvidenceDocumentStatus('job-missing');
    expect(result.status).toBe('not_found');
    expect(result.documentReady).toBe(false);
    expect(result.reasonCode).toBe('job_not_found');
    expect(result.statusCode).toBe(404);
  });

  it('normaliza fallback a failed cuando la respuesta no trae JSON válido', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('gateway error', { status: 502 }),
    ) as any;

    const result = await runsProxy.getEvidenceDocumentStatus('job-err');
    expect(result.status).toBe('failed');
    expect(result.documentReady).toBe(false);
    expect(result.statusCode).toBe(502);
  });
});

describe('runsProxy.create', () => {
  const payload: RunPayload = {
    projectId: 56,
    suiteId: 1731,
    stories: [],
    existingCaseIds: [42958],
  };

  it('preserva checklistUrl y defectCount cuando issueKey no existe', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        jobId: 'job-discovery-1',
        status: 'queued',
        checklistUrl: '/checklist/job:job-discovery-1',
        defectCount: 1,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    const result = await runsProxy.create(payload);
    expect(result.jobId).toBe('job-discovery-1');
    expect(result.checklistUrl).toBe('/checklist/job:job-discovery-1');
    expect(result.defectCount).toBe(1);
    expect(result.issueKey).toBeUndefined();
  });
});
