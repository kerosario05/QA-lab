export type TestFileAsset = {
  fileRef: string;
  projectSlug: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
type FileArea = 'test-design' | 'runs';

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body as T;
}

export const testFilesApi = {
  async list(area: FileArea, projectSlug: string): Promise<TestFileAsset[]> {
    const path = area === 'test-design' ? '/api/test-design/files' : '/api/runs/test-files';
    const response = await fetch(`${API_BASE}${path}?projectSlug=${encodeURIComponent(projectSlug)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    return (await parseResponse<{ files: TestFileAsset[] }>(response)).files;
  },
  async upload(area: FileArea, projectSlug: string, file: File): Promise<TestFileAsset> {
    const path = area === 'test-design' ? '/api/test-design/files' : '/api/runs/test-files';
    const form = new FormData();
    form.set('projectSlug', projectSlug);
    form.set('file', file);
    const response = await fetch(`${API_BASE}${path}?projectSlug=${encodeURIComponent(projectSlug)}`, { method: 'POST', body: form });
    return (await parseResponse<{ file: TestFileAsset }>(response)).file;
  },
};
