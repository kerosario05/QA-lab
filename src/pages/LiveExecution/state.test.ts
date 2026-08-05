import { describe, expect, it } from 'vitest';
import {
  canEnableDocumentDownload,
  computePassRatePercent,
  computeLiveExecutionElapsedMs,
  computeLiveExecutionMetrics,
  getLiveExecutionElapsedSeconds,
  getLiveExecutionOutcome,
  getLiveExecutionStatusText,
  getTerminalUserMessage,
  resolveDocumentAvailabilityState,
  resolveProgressPercent,
  isActiveRunStatus,
  isErrorTerminalStatus,
  isSuccessTerminalStatus,
  isTerminalStatus,
  isTerminalRunStatus,
  shouldResetDocumentStateForJob,
  withStableTerminalTimestamp,
} from './state';
import type { ActiveRun } from '../../types';

const baseRun: ActiveRun = {
  id: 'job-1',
  jobId: 'job-1',
  project: 'Kiosko',
  triggered: 'Carlos',
  startedAt: '2026-06-05T10:00:00.000Z',
  progress: 0,
  total: 7,
  completed: 0,
  passed: 0,
  failed: 0,
  currentTest: '',
  eta: '',
  status: 'running',
};

describe('LiveExecution state', () => {
  it('status failed + summary parcial muestra counters correctos', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'failed',
      summary: {
        completed: 7,
        passed: 5,
        failed: 2,
        scenarioCount: 7,
        totalStories: 7,
      },
    });

    expect(metrics.completed).toBe(7);
    expect(metrics.passed).toBe(5);
    expect(metrics.failed).toBe(2);
    expect(metrics.total).toBe(7);
  });

  it('pass rate muestra 71% para 5 de 7', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'failed',
      summary: {
        completed: 7,
        passed: 5,
        failed: 2,
        scenarioCount: 7,
      },
    });
    expect(metrics.passRate).toBe(71);
  });

  it('progreso incremental 0/4 -> 0%', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 0, total: 4 })).toBe(0);
  });

  it('progreso incremental 1/4 -> 25%', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 1, total: 4 })).toBe(25);
  });

  it('progreso incremental 2/4 -> 50%', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 2, total: 4 })).toBe(50);
  });

  it('progreso incremental 3/4 -> 75%', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 3, total: 4 })).toBe(75);
  });

  it('progreso incremental 4/4 -> 100%', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 4, total: 4 })).toBe(100);
  });

  it('3 aprobados + 1 fallido da progreso 100 y pass rate 75', () => {
    expect(resolveProgressPercent({ previousProgress: 0, completed: 4, total: 4 })).toBe(100);
    expect(computePassRatePercent(3, 4)).toBe(75);
  });

  it('progress=0 obsoleto no sobrescribe completed=2/total=4', () => {
    expect(
      resolveProgressPercent({ previousProgress: 0, completed: 2, total: 4, backendProgress: 0 }),
    ).toBe(50);
  });

  it('evento antiguo no hace retroceder porcentaje', () => {
    expect(
      resolveProgressPercent({ previousProgress: 50, completed: 1, total: 4, backendProgress: 25 }),
    ).toBe(50);
  });

  it('status failed con completed>0 usa texto terminado con errores', () => {
    expect(getLiveExecutionStatusText('failed', 7)).toBe('Terminado con errores');
  });

  it('completed_with_failures devuelve copy de observaciones', () => {
    const outcome = getLiveExecutionOutcome('completed_with_failures', {
      completed: 8,
      passed: 7,
      failed: 1,
      total: 8,
    });

    expect(outcome.title).toBe('Ejecución completada con observaciones');
    expect(outcome.subtitle).toContain('7 de 8 escenarios pasaron');
    expect(outcome.isTechnicalFailure).toBe(false);
  });

  it('failed sin casos completados se trata como error técnico', () => {
    const outcome = getLiveExecutionOutcome('failed', {
      completed: 0,
      passed: 0,
      failed: 0,
      total: 8,
    }, 'stderr tail');

    expect(outcome.title).toBe('✗ Error');
    expect(outcome.subtitle).toBe('stderr tail');
    expect(outcome.isTechnicalFailure).toBe(true);
  });

  it('promotionReason se expone como detalle', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'failed',
      summary: {
        completed: 7,
        passed: 5,
        failed: 2,
        scenarioCount: 7,
        promotionReason: 'Promoción no aplicada porque el discovery quedó parcial.',
      },
    });

    expect(metrics.promotionReason).toContain('discovery quedó parcial');
  });
  it('failureGroups se expone y detecta dominantFailure', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'failed',
      summary: {
        completed: 9,
        passed: 2,
        failed: 7,
        scenarioCount: 9,
        failureGroups: {
          environment_navigation_error: 1,
          ordinal_selection_no_safe_candidate: 3,
          assertion_not_found_unrecovered: 2,
        },
      },
    });

    expect(metrics.failureGroups?.ordinal_selection_no_safe_candidate).toBe(3);
    expect(metrics.dominantFailure).toBe('ordinal_selection_no_safe_candidate');
  });

  it('completed_with_failures conserva summary para el stream', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'completed_with_failures',
      summary: {
        completed: 8,
        passed: 7,
        failed: 1,
        scenarioCount: 8,
        failureGroups: {
          assertion_not_found_unrecovered: 1,
        },
      },
    });

    const outcome = getLiveExecutionOutcome('completed_with_failures', metrics);
    expect(metrics.completed).toBe(8);
    expect(metrics.passed).toBe(7);
    expect(metrics.failed).toBe(1);
    expect(outcome.subtitle).toContain('7 de 8');
  });

  it('pending TestRail report no cambia el copy de observaciones', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'completed_with_failures',
      summary: {
        completed: 8,
        passed: 7,
        failed: 1,
        scenarioCount: 8,
        pendingTestRailReportPath: 'C:/tmp/pending-testrail-report.json',
        testRailRunId: 901,
        testRailRunUrl: 'https://testrail.local/index.php?/runs/view/901',
        createdTestRailCases: 2,
        reusedTestRailCases: 1,
      },
    });

    const outcome = getLiveExecutionOutcome('completed_with_failures', metrics, 'Resultados pendientes de sincronizar');
    expect(outcome.isTechnicalFailure).toBe(false);
    expect(outcome.subtitle).toContain('7 de 8');
    expect(metrics.dominantFailure).toBe(null);
  });

  it('isTerminalRunStatus detecta estados finales', () => {
    expect(isTerminalRunStatus('completed')).toBe(true);
    expect(isTerminalRunStatus('completed_with_failures')).toBe(true);
    expect(isTerminalRunStatus('failed')).toBe(true);
    expect(isTerminalRunStatus('cancelled')).toBe(true);
    expect(isTerminalRunStatus('canceled')).toBe(true);
    expect(isTerminalRunStatus('stopped')).toBe(true);
    expect(isTerminalRunStatus('timeout')).toBe(true);
    expect(isTerminalRunStatus('error')).toBe(true);
    expect(isTerminalRunStatus('running')).toBe(false);
  });

  it('elapsed en running usa Date.now - startedAt', () => {
    const now = new Date('2026-06-05T10:00:12.000Z').getTime();
    expect(computeLiveExecutionElapsedMs(baseRun, { status: 'running' }, now)).toBe(12_000);
    expect(getLiveExecutionElapsedSeconds(baseRun, { status: 'running' }, now)).toBe(12);
  });

  it('elapsed terminal usa durationMs cuando viene del backend', () => {
    const now = new Date('2026-06-05T10:01:00.000Z').getTime();
    expect(
      computeLiveExecutionElapsedMs(baseRun, {
        status: 'completed',
        durationMs: 42_000,
        completedAt: '2026-06-05T10:00:42.000Z',
      }, now),
    ).toBe(42_000);
  });

  it('elapsed terminal usa completedAt-startedAt cuando no hay durationMs', () => {
    const now = new Date('2026-06-05T10:01:00.000Z').getTime();
    expect(
      computeLiveExecutionElapsedMs(baseRun, {
        status: 'completed',
        completedAt: '2026-06-05T10:00:42.000Z',
      }, now),
    ).toBe(42_000);
  });

  it('elapsed terminal falla sin seguir avanzando si solo hay finishedAt', () => {
    const now = new Date('2026-06-05T10:01:00.000Z').getTime();
    expect(
      computeLiveExecutionElapsedMs(baseRun, {
        status: 'failed',
        finishedAt: '2026-06-05T10:00:42.000Z',
      }, now),
    ).toBe(42_000);
  });

  it('running se considera estado activo', () => {
    expect(isActiveRunStatus('running')).toBe(true);
    expect(isTerminalStatus('running')).toBe(false);
  });

  it('done se considera estado terminal exitoso', () => {
    expect(isTerminalStatus('done')).toBe(true);
    expect(isSuccessTerminalStatus('done')).toBe(true);
  });

  it('failed se considera estado terminal con error', () => {
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isErrorTerminalStatus('failed')).toBe(true);
    expect(isActiveRunStatus('failed')).toBe(false);
  });

  it('elapsed terminal sin finishedAt se congela con timestamp capturado una sola vez', () => {
    const terminalSnapshot = withStableTerminalTimestamp(
      { status: 'done' },
      '2026-06-05T10:00:42.000Z',
    );
    const now1 = new Date('2026-06-05T10:01:00.000Z').getTime();
    const now2 = new Date('2026-06-05T10:05:00.000Z').getTime();

    const elapsed1 = computeLiveExecutionElapsedMs(baseRun, terminalSnapshot, now1);
    const elapsed2 = computeLiveExecutionElapsedMs(baseRun, terminalSnapshot, now2);
    expect(elapsed1).toBe(42_000);
    expect(elapsed2).toBe(42_000);
  });

  it('progreso 100 con running no habilita descarga', () => {
    expect(
      canEnableDocumentDownload('running', {
        status: 'running',
        progress: 100,
        completed: 10,
        total: 10,
        documentReady: false,
      }),
    ).toBe(false);
  });

  it('done sin documento listo no habilita descarga', () => {
    expect(
      canEnableDocumentDownload('done', {
        status: 'done',
        completed: 10,
        total: 10,
      }),
    ).toBe(false);
  });

  it('done con documento confirmado habilita descarga', () => {
    expect(
      canEnableDocumentDownload('done', {
        status: 'done',
        documentReady: true,
      }),
    ).toBe(true);
  });

  it('resolver de disponibilidad en estado preparing sigue haciendo polling', () => {
    const resolution = resolveDocumentAvailabilityState({
      ready: false,
      state: 'preparing',
      statusCode: 404,
      attempt: 1,
      maxAttempts: 30,
    });
    expect(resolution.state).toBe('preparing');
    expect(resolution.continuePolling).toBe(true);
  });

  it('resolver de disponibilidad deja de esperar al exceder intentos', () => {
    const resolution = resolveDocumentAvailabilityState({
      ready: false,
      state: 'preparing',
      statusCode: 404,
      attempt: 30,
      maxAttempts: 30,
    });
    expect(resolution.state).toBe('unavailable');
    expect(resolution.continuePolling).toBe(false);
  });

  it('resolver de disponibilidad marca failed con error explícito del backend', () => {
    const resolution = resolveDocumentAvailabilityState({
      ready: false,
      state: 'failed',
      statusCode: 500,
      attempt: 2,
      maxAttempts: 30,
    });
    expect(resolution.state).toBe('failed');
    expect(resolution.continuePolling).toBe(false);
  });

  it('cambiar jobId obliga reset del estado de documento', () => {
    expect(shouldResetDocumentStateForJob('job-1', 'job-2')).toBe(true);
    expect(shouldResetDocumentStateForJob('job-2', 'job-2')).toBe(false);
  });

  it('mensaje terminal para done usa copy semántico y sin texto dañado', () => {
    const message = getTerminalUserMessage('done');
    expect(message.text).toBe('✓ Ejecución completada');
    expect(message.tone).toBe('success');
    expect(message.text.includes('Γ£ù')).toBe(false);
    expect(message.text.includes('estado: done')).toBe(false);
  });
});
