import { describe, expect, it } from 'vitest';
import {
  computeLiveExecutionElapsedMs,
  computeLiveExecutionMetrics,
  getLiveExecutionElapsedSeconds,
  getLiveExecutionOutcome,
  getLiveExecutionStatusText,
  isTerminalRunStatus,
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
});
