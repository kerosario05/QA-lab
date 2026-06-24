const PROXY = import.meta.env.VITE_NEWMAN_API_URL ?? import.meta.env.VITE_API_URL ?? '';

export interface NewmanCollection {
  name: string;
  requestCount: number;
}

export interface NewmanRunPayload {
  collection: string;
  testrailProjectId: number;
  testrailSuiteId: number;
  testrailSectionId: number;
  testrailRunName?: string;
}

export interface NewmanRunResponse {
  ok: boolean;
  jobId: string;
  error?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function extractRequestCount(c: any): number {
  if (typeof c === 'string') return 0;
  if (typeof c.itemCount === 'number') return c.itemCount;
  if (typeof c.requestCount === 'number') return c.requestCount;
  if (typeof c.total_requests === 'number') return c.total_requests;
  if (typeof c.totalRequests === 'number') return c.totalRequests;
  if (Array.isArray(c.request)) return c.request.length;
  if (Array.isArray(c.item)) return c.item.reduce((n: number, i: any) => n + (Array.isArray(i.item) ? i.item.length : 1), 0);
  return 0;
}

function extractName(c: any): string {
  if (typeof c === 'string') return c;
  return c.name ?? c.id ?? String(c);
}

export const newmanProxy = {
  getCollections: async (): Promise<NewmanCollection[]> => {
    const data = await request<any>('/api/newman/collections');
    const toCollection = (c: any): NewmanCollection => ({ name: extractName(c), requestCount: extractRequestCount(c) });
    if (Array.isArray(data)) return data.map(toCollection);
    if (data?.collections) return (data.collections as any[]).map(toCollection);
    return [];
  },

  run: (payload: NewmanRunPayload): Promise<NewmanRunResponse> =>
    request('/api/newman/run', { method: 'POST', body: JSON.stringify(payload) }),

  downloadReport: async (jobId: string): Promise<void> => {
    const res = await fetch(`${PROXY}/api/newman/${jobId}/report`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const contentDisposition = res.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = filenameMatch ? filenameMatch[1].replace(/['"]/g, '') : `reporte-${jobId}.pdf`;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
