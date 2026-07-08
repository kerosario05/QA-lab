import type { Story } from '../scenarios';

const PROXY = import.meta.env.VITE_API_URL ?? '';

export interface RunPayload {
  projectId: number;
  suiteId: number;
  sectionId?: number;
  sectionName?: string;
  sectionSlug?: string;
  stories: Story[];
  existingCaseIds: number[];
  launchId?: string;
  testRunId?: number;
  publishedCases?: Array<{ scenarioId: string; caseId: number; title?: string }>;
  jiraKey?: string;
}

export interface RunCreateResponse {
  jobId: string;
  status: string;
}

export interface LogEntry {
  timestamp?: string;
  level?: string;
  message: string;
}

export interface RunStatusData {
  status?: string;
  progress?: number;
  total?: number;
  passed?: number;
  failed?: number;
  completed?: number;
  currentTest?: string;
  startedAt?: string;
  completedAt?: string;
  finishedAt?: string;
  lastEventAt?: string;
  receivedFinalEventAt?: string;
  durationMs?: number;
}

export function toRunLogEntry(entry: Record<string, unknown> | string): LogEntry | null {
  if (typeof entry === 'string') {
    const msg = entry.trim();
    if (!msg) return null;
    return { message: msg };
  }
  const raw = (entry.message ?? entry.line ?? entry.log ?? entry.text ?? '') as string;
  if (!raw.trim()) return null;
  return {
    message: raw,
    level: entry.level as string | undefined,
    timestamp: entry.timestamp as string | undefined,
  };
}

/** Callbacks para el stream SSE de logs */
export interface StreamCallbacks {
  onLog:    (entry: LogEntry) => void;
  onStatus: (data: RunStatusData) => void;
  onDone:   (data: RunStatusData) => void;
  onError:  (err: Error) => void;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Aplana campos anidados de `summary`/`stats` y mapea nombres alternativos */
function normalizeRunData(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // Formato summary gen├⌐rico
  const summary = raw.summary as Record<string, unknown> | undefined;
  if (summary) {
    if (out.passed    === undefined && summary.passed     !== undefined) out.passed    = summary.passed;
    if (out.failed    === undefined && summary.failed     !== undefined) out.failed    = summary.failed;
    if (out.completed === undefined && summary.completed  !== undefined) out.completed = summary.completed;
    if (out.progress  === undefined && summary.progress   !== undefined) out.progress  = summary.progress;
    if (out.total === undefined) {
      if      (summary.total         !== undefined) out.total = summary.total;
      else if (summary.totalStories  !== undefined) out.total = summary.totalStories;
      else if (summary.scenarioCount !== undefined) out.total = summary.scenarioCount;
    }
  }

  // Formato stats de Newman: { stats: { assertions: { total, failed }, requests: { total, pending, executed } } }
  const stats = raw.stats as Record<string, any> | undefined;
  if (stats) {
    const assertions = stats.assertions as Record<string, any> | undefined;
    const requests   = stats.requests   as Record<string, any> | undefined;

    if (assertions) {
      // Newman no incluye assertions.passed ΓÇö lo calcula como total - failed
      if (out.passed === undefined) {
        if (assertions.passed !== undefined) {
          out.passed = assertions.passed;
        } else if (assertions.total !== undefined && assertions.failed !== undefined) {
          out.passed = Math.max(0, Number(assertions.total) - Number(assertions.failed));
        }
      }
      if (out.failed === undefined && assertions.failed !== undefined) out.failed = assertions.failed;
    }

    if (requests) {
      // completed = requests ejecutados hasta ahora (total - pending, o executed, o total al final)
      if (out.completed === undefined) {
        if (requests.executed !== undefined) {
          out.completed = requests.executed;
        } else if (requests.total !== undefined && requests.pending !== undefined) {
          out.completed = Math.max(0, Number(requests.total) - Number(requests.pending));
        } else if (requests.total !== undefined) {
          out.completed = requests.total;
        }
      }
      if (out.total === undefined && requests.total !== undefined) out.total = requests.total;
    }

    if (out.progress === undefined && out.total && Number(out.total) > 0) {
      out.progress = Math.round((Number(out.completed ?? 0) / Number(out.total)) * 100);
    }
  }

  // itemCount como total alternativo
  if (out.total === undefined && raw.itemCount !== undefined) out.total = raw.itemCount;

  // Si no hay completed pero hay progress + total, inferirlo (├║til en eventos intermedios sin stats)
  if (out.completed === undefined && out.progress != null && out.total != null && Number(out.total) > 0) {
    out.completed = Math.round(Number(out.progress) * Number(out.total) / 100);
  }

  // Si hay passed + failed pero no completed, completados = suma de ambos
  if (out.completed === undefined && out.passed != null && out.failed != null) {
    out.completed = Number(out.passed) + Number(out.failed);
  }

  if (!out.currentTest && raw.currentCase) out.currentTest = raw.currentCase;
  return out;
}

/** Parsea y consume un stream SSE de `GET /api/runs/{jobId}/logs`.
 *  Devuelve una funci├│n de cleanup que aborta la conexi├│n. */
function streamLogs(jobId: string, cb: StreamCallbacks): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${PROXY}/api/runs/${jobId}/logs`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      if (!res.body)  throw new Error('Response body is null');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer       = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // guarda la l├¡nea incompleta al final

        for (const raw of lines) {
          const line = raw.trimEnd();

          if (line.startsWith(':')) continue; // SSE comment, ignorar

          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const payload = line.slice(5).trim();
            try {
              const data = JSON.parse(payload);
              const evt  = currentEvent || 'message';

              if (evt === 'log') {
                const entry = toRunLogEntry(data);
                if (entry) cb.onLog(entry);
              } else if (evt === 'status') {
                cb.onStatus(normalizeRunData(data) as RunStatusData);
              } else if (evt === 'done') {
                cb.onDone(normalizeRunData(data) as RunStatusData);
              } else if (evt === 'message') {
                const entry = toRunLogEntry(data);
                if (entry) cb.onLog(entry);
                else cb.onStatus(normalizeRunData(data) as RunStatusData);
              }
            } catch {
              // dato malformado, ignorar
            }
          } else if (line === '') {
            currentEvent = ''; // reset entre mensajes SSE
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') cb.onError(err);
    }
  })();

  return () => controller.abort();
}

export interface LaunchExecutionPayload {
  appSlug: string;
  projectId: number;
  suiteId?: number;
  sectionId?: number;
  sectionName?: string;
  sectionSlug?: string;
  testrailSectionId?: number;
  jiraKey?: string;
  sprintName?: string;
  selectedScenarios: Array<{
    title: string;
    steps: string[];
    expectedResult: string;
    preconditions: string[];
    sourceIssueKey?: string;
  }>;
  publishStrategy?: 'always_create' | 'use_existing';
}

export interface LaunchExecutionResponse {
  ok: boolean;
  launchId?: string;
  status?: string;
  publishedCases?: Array<{ scenarioId: string; caseId: number; title: string }>;
  testRunId?: number;
  manifestPath?: string;
  error?: string;
  message?: string;
}

export const runsProxy = {
  create: (payload: RunPayload): Promise<RunCreateResponse> =>
    request('/api/runs/from-scenarios', { method: 'POST', body: JSON.stringify(payload) }),

  launchExecution: (payload: LaunchExecutionPayload): Promise<LaunchExecutionResponse> =>
    request('/api/runs/launch-execution', { method: 'POST', body: JSON.stringify(payload) }),

  getJob: (jobId: string): Promise<Record<string, unknown>> =>
    request(`/api/runs/${jobId}`),

  rerun: (jobId: string, mode: 'all' | 'failed_only' = 'all', issueKey?: string, checklistUrl?: string): Promise<Record<string, unknown>> => {
    const body: Record<string, unknown> = { mode };
    if (issueKey) body.issueKey = issueKey;
    if (checklistUrl) body.checklistUrl = checklistUrl;
    return request(`/api/runs/${jobId}/rerun`, { method: 'POST', body: JSON.stringify(body) });
  },

  /** Descarga el archivo DOCX de evidencia para un jobId */
  downloadEvidence: async (jobId: string): Promise<void> => {
    const res = await fetch(`${PROXY}/api/runs/${jobId}/evidence-docx`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    // Obtener el nombre del archivo desde el header o usar uno por defecto
    const contentDisposition = res.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = filenameMatch ? filenameMatch[1].replace(/['"]/g, '') : `evidencia-${jobId}.docx`;

    // Descargar el archivo
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

  streamLogs,
};