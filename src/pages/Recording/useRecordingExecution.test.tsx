import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { RecordedScenario } from '../../services/recordings/types';

const mobile = vi.hoisted(() => ({
  publishToTestRail: vi.fn(async () => ({ launchId: 'l1', testRunId: 7, publishedCases: [] })),
  executeRun: vi.fn(async () => ({ jobId: 'job-1' })),
}));
vi.mock('../../services/mobile', () => ({ mobileProxy: mobile }));

const { useRecordingExecution } = await import('./useRecordingExecution');

const scenario = {
  scenarioId: 's1',
  sourceRecordingId: 'abcdef0123',
  title: 'Entrar',
  mobileSteps: [{ action: 'tap' }],
  testRailSteps: [{ expected: 'ok' }],
  preconditions: [],
  requiredData: [],
  provenance: 'observed',
} as unknown as RecordedScenario;

const project = { slug: 'app', name: 'App', type: 'mobile' as const, testRail: { projectIdTr: '1', sectionId: '2' } };

async function run(deviceSerial?: string | null) {
  let execute!: ReturnType<typeof useRecordingExecution>['execute'];
  function Probe() {
    execute = useRecordingExecution().execute;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  await act(async () => { await execute(project, [scenario], {}, deviceSerial); });
  act(() => root.unmount());
}

describe('useRecordingExecution', () => {
  it('ejecuta en el dispositivo del equipo del usuario donde se grabó', async () => {
    await run('emulator-5554');
    expect(mobile.executeRun).toHaveBeenLastCalledWith(expect.objectContaining({ deviceSerial: 'emulator-5554', launchId: 'l1' }));
  });

  it('sin dispositivo elegido usa el emulador del servidor', async () => {
    await run(null);
    expect(mobile.executeRun.mock.lastCall?.[0]).not.toHaveProperty('deviceSerial');
  });
});
