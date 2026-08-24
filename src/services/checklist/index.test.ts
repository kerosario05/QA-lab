import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChecklist } from './index';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('checklist service', () => {
  it('consulta checklist usando identity codificada y preserva jobId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        issueKey: 'launch:abc-123',
        checklistUrl: '/checklist/launch:abc-123',
        defects: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as any;

    await getChecklist('launch:abc-123', 'job-42');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/checklists/launch%3Aabc-123?jobId=job-42');
  });

  it('expone status HTTP cuando falla la consulta', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    await expect(getChecklist('launch:missing')).rejects.toMatchObject({
      name: 'ChecklistFetchError',
      status: 404,
    });
  });

  it('retorna todos los defectos del checklist sin recorte', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        issueKey: 'launch:full-1',
        checklistUrl: '/checklist/launch:full-1',
        defects: [
          { id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }, { id: 'd5' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    const result = await getChecklist('launch:full-1');
    expect(result.defects).toHaveLength(5);
  });
});
