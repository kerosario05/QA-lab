import { api } from '../http';

/**
 * The QA Lab agent on the user's own PC (installed by IT or from the login offer) that opens the
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

/** A phone or emulator adb sees on the user's PC. */
export type AndroidDevice = {
  serial: string;
  /** adb state: 'device' is usable; 'unauthorized' waits for the USB debugging prompt. */
  state: string;
  kind: 'emulator' | 'physical';
  model?: string;
  avd?: string;
};

/** Android Studio on the user's PC, as the agent last reported it. */
export type AndroidStatus = {
  sdkFound: boolean;
  adbVersion?: string;
  emulatorFound: boolean;
  avds: string[];
  devices: AndroidDevice[];
  error?: string;
  checkedAt: string;
};

/** An emulator the panel asked the agent to start. */
export type AgentEmulatorState = {
  requestId: string;
  avd: string;
  state: 'starting' | 'launched' | 'booting' | 'ready' | 'error';
  serial?: string;
  message?: string;
};

export type LocalAgentInfo = {
  agentId: string;
  machine: string;
  windowsUser: string;
  agentVersion: string;
  chromiumInstalled: boolean;
  /** Android Studio (SDK with adb) found by an agent 0.2.0 or newer. */
  androidReady?: boolean;
  android?: AndroidStatus | null;
  /** managed: the agent (0.3.0+) installs and starts Appium itself; otherwise the user opens it. */
  appium?: { managed: boolean; installed: boolean; install: { state: string; percent: number; message?: string } | null };
  /** The server's agent version; updateAvailable when this agent is older (it never updates itself). */
  latestVersion?: string;
  updateAvailable?: boolean;
};

export type LocalAgentStatus = {
  requiredRevision: string | null;
  pairing: 'found' | 'none' | 'ambiguous';
  agent: LocalAgentInfo | null;
  candidates?: LocalAgentInfo[];
  install: LocalAgentInstallState | null;
  emulator?: AgentEmulatorState | null;
  /** Agent connected and Chromium installed: recordings can open on this PC. */
  ready: boolean;
};

export const AGENT_INSTALLER_FILE = 'instalar-agente-qalab.cmd';

/**
 * A double-clickable installer for PCs without the agent: it fetches the server's
 * instalar-agente.ps1 and runs it as the current user (no administrator), pointing the
 * agent at the same origin this panel was opened from.
 */
export function agentInstallerCmd(origin: string): string {
  const ps = `$f = Join-Path $env:TEMP 'qalab-instalar-agente.ps1'; Invoke-WebRequest -UseBasicParsing '${origin}/descargas/instalar-agente.ps1' -OutFile $f; & $f -Servidor '${origin}'; exit $LASTEXITCODE`;
  return [
    '@echo off',
    'rem Instalador del agente de grabacion de QA Lab (no requiere administrador)',
    'echo Instalando el agente de grabacion de QA Lab...',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`,
    'if errorlevel 1 (',
    '  echo.',
    '  echo No se pudo instalar el agente. Detalle: %LOCALAPPDATA%\\QALab\\agente\\logs\\instalador.log',
    '  pause',
    '  exit /b 1',
    ')',
    'echo Listo. Vuelve a QA Lab: se terminara de preparar solo.',
    'timeout /t 5 >nul',
    '',
  ].join('\r\n');
}

export function downloadAgentInstaller(origin: string = window.location.origin): void {
  const url = URL.createObjectURL(new Blob([agentInstallerCmd(origin)], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = AGENT_INSTALLER_FILE;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const localAgentApi = {
  status: () => api.get<LocalAgentStatus & { ok: true }>('/api/local-agent/status'),
  install: () => api.post<{ ok: true; install: LocalAgentInstallState }>('/api/local-agent/install'),
  select: (agentId: string) => api.post<LocalAgentStatus & { ok: true }>('/api/local-agent/select', { agentId }),
  startEmulator: (avd: string) => api.post<{ ok: true; emulator: AgentEmulatorState }>('/api/local-agent/android/emulator', { avd }),
  stopEmulator: (serial: string) => api.post<{ ok: true }>('/api/local-agent/android/emulator/stop', { serial }),
};
