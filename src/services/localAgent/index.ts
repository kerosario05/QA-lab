import { api } from '../http';

/**
 * The QA Lab agent on the user's own PC (installed by IT) that opens the
 * recording Chromium there instead of streaming the server's browser.
 *
 * The panel never talks to the agent: it asks the server, which pairs the agent
 * that connects from the same PC (same IP) as this browser.
 */

export type LocalAgentInstallState = {
  requestId: string;
  revision: string;
  state: 'preparing' | 'download' | 'extract' | 'done' | 'error';
  /** Overall progress 0-100. */
  percent: number;
  receivedBytes?: number;
  totalBytes?: number;
  message?: string;
};

export type LocalAgentInfo = {
  agentId: string;
  machine: string;
  windowsUser: string;
  agentVersion: string;
  chromiumInstalled: boolean;
};

export type LocalAgentStatus = {
  requiredRevision: string | null;
  pairing: 'found' | 'none' | 'ambiguous';
  agent: LocalAgentInfo | null;
  candidates?: LocalAgentInfo[];
  install: LocalAgentInstallState | null;
  /** Agent connected and Chromium installed: recordings can open on this PC. */
  ready: boolean;
};

export const localAgentApi = {
  status: () => api.get<LocalAgentStatus & { ok: true }>('/api/local-agent/status'),
  install: () => api.post<{ ok: true; install: LocalAgentInstallState }>('/api/local-agent/install'),
  select: (agentId: string) => api.post<LocalAgentStatus & { ok: true }>('/api/local-agent/select', { agentId }),
};
