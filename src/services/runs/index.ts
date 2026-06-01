import type { Story } from '../scenarios';

const PROXY = import.meta.env.VITE_API_URL ?? '';

export interface RunPayload {
  projectId: number;
  suiteId: number;
  sectionId?: number;
  stories: Story[];
  existingCaseIds: number[];
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

/** Parsea y consume un stream SSE de `GET /api/runs/{jobId}/logs`.
 *  Devuelve una función de cleanup que aborta la conexión. */
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
        buffer = lines.pop() ?? ''; // guarda la línea incompleta al final

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
                cb.onLog(data as LogEntry);
              } else if (evt === 'status') {
                cb.onStatus(data as RunStatusData);
              } else if (evt === 'done') {
                cb.onDone(data as RunStatusData);
              } else if (evt === 'message') {
                // evento genérico: si tiene `message` lo trato como log
                if ((data as any).message) cb.onLog(data as LogEntry);
                else                       cb.onStatus(data as RunStatusData);
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

export const runsProxy = {
  create: (payload: RunPayload): Promise<RunCreateResponse> =>
    request('/api/runs/from-scenarios', { method: 'POST', body: JSON.stringify(payload) }),

  streamLogs,
};
