import type { Project, Execution, ActiveRun, TestCase } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const projectsApi = {
  list: () => request<Project[]>('/api/projects'),
  get: (id: string) => request<Project>(`/api/projects/${id}`),
};

export const executionsApi = {
  list: () => request<Execution[]>('/api/executions'),
  active: () => request<ActiveRun[]>('/api/executions/active'),
  launch: (payload: { projectId: string; source: string; caseIds?: string[] }) =>
    request<ActiveRun>('/api/executions', { method: 'POST', body: JSON.stringify(payload) }),
  close: (id: string, payload: { notes: string; bugIds: string[] }) =>
    request<void>(`/api/executions/${id}/close`, { method: 'POST', body: JSON.stringify(payload) }),
};

export const testCasesApi = {
  list: (projectId: string) => request<TestCase[]>(`/api/projects/${projectId}/cases`),
};
