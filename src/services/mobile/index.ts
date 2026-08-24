import { mobileRequest } from './client';
import type {
  EmulatorStatus, AppiumStatus,
  MobileScenarioPreviewParams, MobileScenarioPreviewResponse,
  MobileScenarioGenerationStartResponse, MobileScenarioGenerationStatusResponse,
  MobileLaunchExecutionParams, MobileLaunchExecutionResponse,
  MobileRunExecuteParams, MobileRunExecuteResponse,
} from './types';

export const mobileProxy = {
  startEmulator: (payload?: { avdName?: string; headless?: boolean }): Promise<{ ok: boolean; jobId: string; status: string; mode: string }> =>
    mobileRequest('/api/mobile/emulator/start', { method: 'POST', body: JSON.stringify(payload ?? {}) }),

  getEmulatorStatus: (): Promise<EmulatorStatus & { ok: boolean }> =>
    mobileRequest('/api/mobile/emulator/status', { method: 'GET' }),

  stopEmulator: (): Promise<{ ok: boolean; running: boolean; bootCompleted: boolean }> =>
    mobileRequest('/api/mobile/emulator/stop', { method: 'POST' }),

  getAppiumStatus: (): Promise<AppiumStatus & { ok: boolean }> =>
    mobileRequest('/api/mobile/appium/status', { method: 'GET' }),

  previewScenarios: (params: MobileScenarioPreviewParams): Promise<MobileScenarioPreviewResponse> =>
    mobileRequest('/api/mobile/scenarios/preview', { method: 'POST', body: JSON.stringify(params) }),

  startScenarioGeneration: (params: MobileScenarioPreviewParams): Promise<MobileScenarioGenerationStartResponse> =>
    mobileRequest('/api/mobile/scenarios/generation', { method: 'POST', body: JSON.stringify(params) }),

  getScenarioGenerationStatus: (generationJobId: string): Promise<MobileScenarioGenerationStatusResponse> =>
    mobileRequest(`/api/mobile/scenarios/generation/${encodeURIComponent(generationJobId)}`, { method: 'GET' }),

  publishToTestRail: (params: MobileLaunchExecutionParams): Promise<MobileLaunchExecutionResponse> =>
    mobileRequest('/api/mobile/runs/launch-execution', { method: 'POST', body: JSON.stringify(params) }),

  executeRun: (params: MobileRunExecuteParams): Promise<MobileRunExecuteResponse> =>
    mobileRequest('/api/mobile/runs/execute', { method: 'POST', body: JSON.stringify(params) }),
};

export * from './types';
