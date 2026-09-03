import { describe, expect, it } from 'vitest';
import {
  buildLiveExecutionBannerMetrics,
  canEnableDocumentDownload,
  computeBlockedCases,
  computeFunctionalPassRatePercent,
  computePassRatePercent,
  computeLiveExecutionElapsedMs,
  computeLiveExecutionMetrics,
  formatFunctionalPassRateLabel,
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
  LIVE_EXECUTION_BANNER_GRID_CLASS,
  shouldShowDefectChecklistButton,
  shouldResetDocumentStateForJob,
  withStableTerminalTimestamp,
  getCompactScenarioSteps,
  getScenarioStepState,
  normalizeCaseStartedScenario,
  resolveActiveScenarioUpdate,
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
  it('mapea case_started a activeScenario y limpia case_finished sin afectar logs normales', () => {
    const started = resolveActiveScenarioUpdate({
      type: 'case_started',
      caseId: 'PREVIEW-002',
      title: 'Escenario activo',
      index: 2,
      total: 6,
    });
    expect(started).toEqual({ id: 'PREVIEW-002', title: 'Escenario activo', index: 2, total: 6, steps: [] });
    expect(normalizeCaseStartedScenario({ type: 'case_started', caseId: 'PREVIEW-002', title: 'Escenario activo', index: 2, total: 6 })).not.toBeNull();
    expect(resolveActiveScenarioUpdate({ type: 'case_finished', caseId: 'PREVIEW-002' })).toBeNull();
    expect(resolveActiveScenarioUpdate({ message: 'log normal' })).toBeUndefined();
  });

  it('preserva activeScenario proveniente de polling', () => {
    const activeScenario = { id: 'PREVIEW-001', title: 'Polling', index: 1, total: 2, steps: [] };
    expect(resolveActiveScenarioUpdate({ activeScenario })).toEqual(activeScenario);
  });

  it('compacta pasos en orden, limita a cinco y conserva estados neutros sin resultados', () => {
    expect(getCompactScenarioSteps(['1. Uno', '2. Dos', '3. Tres', '4. Cuatro', '5. Cinco', '6. Seis'])).toEqual({
      steps: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
      remaining: 1,
    });
    expect(getScenarioStepState(undefined, 0)).toBe('pending');
    expect(getScenarioStepState([{ status: 'passed' }], 0)).toBe('completed');
    expect(getScenarioStepState([{ status: 'running' }], 0)).toBe('running');
  });

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

  it('pass rate queda null cuando executed=0', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'running',
      summary: {
        requested: 3,
        completed: 1,
        executed: 0,
        passed: 0,
        failed: 0,
        passRate: null,
      },
    });
    expect(metrics.passRate).toBeNull();
  });

  it('pass rate usa executed y no completed', () => {
    const metrics = computeLiveExecutionMetrics(baseRun, {
      status: 'running',
      summary: {
        requested: 3,
        completed: 2,
        executed: 1,
        passed: 1,
        failed: 0,
      },
    });
    expect(metrics.passRate).toBe(100);
  });

  it('resumen final reconciliado: processed 10, executed 6, blocked 4, pass rate 100% (6/6)', () => {
    const blocked = computeBlockedCases(10, 6, 4);
    const passRate = computeFunctionalPassRatePercent(6, 0);
    const label = formatFunctionalPassRateLabel({ passed: 6, failed: 0, status: 'completed' });
    expect(blocked).toBe(4);
    expect(6 + blocked).toBe(10);
    expect(passRate).toBe(100);
    expect(label).toBe('100%');
  });

  it('resumen final con 5 pass y 1 fail sobre 6 ejecutados muestra 83.33%', () => {
    const blocked = computeBlockedCases(10, 6, 4);
    const passRate = computeFunctionalPassRatePercent(5, 1);
    const label = formatFunctionalPassRateLabel({ passed: 5, failed: 1, status: 'completed_with_failures' });
    expect(blocked).toBe(4);
    expect(passRate).toBe(83.33);
    expect(label).toBe('83.33%');
  });

  it('running sin resultados funcionales muestra Pendiente', () => {
    const label = formatFunctionalPassRateLabel({ passed: 0, failed: 0, status: 'running' });
    expect(label).toBe('Pendiente');
  });

  it('pending sin resultados muestra Sin resultados', () => {
    const label = formatFunctionalPassRateLabel({ passed: 0, failed: 0, status: 'pending' });
    expect(label).toBe('Sin resultados');
  });

  it('completed sin resultados funcionales muestra No aplica', () => {
    const blocked = computeBlockedCases(10, 0, 10);
    const passRate = computeFunctionalPassRatePercent(0, 0);
    const label = formatFunctionalPassRateLabel({ passed: 0, failed: 0, status: 'completed' });
    expect(blocked).toBe(10);
    expect(passRate).toBeNull();
    expect(label).toBe('No aplica');
  });

  it('passed=1 y failed=0 muestra 100%', () => {
    const label = formatFunctionalPassRateLabel({ passed: 1, failed: 0, status: 'completed' });
    expect(label).toBe('100%');
  });

  it('passed=0 y failed=1 muestra 0%', () => {
    const label = formatFunctionalPassRateLabel({ passed: 0, failed: 1, status: 'completed_with_failures' });
    expect(label).toBe('0%');
  });

  it('bloqueados no alteran el denominador del pass rate', () => {
    const passRate = computeFunctionalPassRatePercent(5, 1);
    const label = formatFunctionalPassRateLabel({ passed: 5, failed: 1, status: 'completed_with_failures' });
    expect(passRate).toBe(83.33);
    expect(label).toBe('83.33%');
  });

  it('banner de resumen renderiza exactamente cuatro métricas sin bloqueados', () => {
    const metrics = buildLiveExecutionBannerMetrics({
      completed: 10,
      processedTotal: 10,
      executed: 6,
      passed: 6,
      failed: 0,
    });

    expect(metrics).toHaveLength(4);
    expect(metrics.map(metric => metric.label)).toEqual([
      'Procesados',
      'Ejecutados',
      'Aprobados',
      'Fallidos',
    ]);
    expect(metrics.some(metric => metric.label === 'Bloqueados')).toBe(false);
  });

  it('payload legacy con blockedCount no agrega quinta métrica en banner', () => {
    const legacyPayload: Parameters<typeof computeLiveExecutionMetrics>[1] & {
      summary: NonNullable<Parameters<typeof computeLiveExecutionMetrics>[1]>['summary'] & { blockedCount?: number };
    } = {
      status: 'completed',
      summary: {
        requested: 10,
        completed: 10,
        executed: 6,
        passed: 5,
        failed: 1,
        blockedCount: 4,
      },
    };
    const resolved = computeLiveExecutionMetrics(baseRun, legacyPayload);
    const metrics = buildLiveExecutionBannerMetrics({
      completed: resolved.completed,
      processedTotal: resolved.requested,
      executed: resolved.executed,
      passed: resolved.passed,
      failed: resolved.failed,
    });

    expect(metrics).toHaveLength(4);
    expect(metrics.every(metric => metric.id !== 'failed' || metric.value === 1)).toBe(true);
    expect(metrics.some(metric => metric.id === 'processed' && metric.total === 10)).toBe(true);
  });

  it('layout del banner usa distribución responsive de 4 métricas sin quinta columna', () => {
    expect(LIVE_EXECUTION_BANNER_GRID_CLASS).toContain('grid-cols-2');
    expect(LIVE_EXECUTION_BANNER_GRID_CLASS).toContain('md:grid-cols-4');
    expect(LIVE_EXECUTION_BANNER_GRID_CLASS).not.toContain('grid-cols-5');
  });

  it('métricas funcionales avanzan 0/3 → 1/3 → 2/3 → 3/3 con passRate real', () => {
    const start = computeLiveExecutionMetrics(baseRun, {
      status: 'running',
      summary: { requested: 3, completed: 0, executed: 0, passed: 0, failed: 0, passRate: null },
    });
    expect(start.completed).toBe(0);
    expect(start.requested).toBe(3);
    expect(start.progress).toBe(0);
    expect(start.passRate).toBeNull();

    const afterFirst = computeLiveExecutionMetrics(baseRun, {
      status: 'running',
      summary: { requested: 3, completed: 1, executed: 1, passed: 1, failed: 0, passRate: 100 },
    });
    expect(afterFirst.completed).toBe(1);
    expect(afterFirst.executed).toBe(1);
    expect(afterFirst.passed).toBe(1);
    expect(afterFirst.progress).toBe(33);
    expect(afterFirst.passRate).toBe(100);

    const afterSecond = computeLiveExecutionMetrics(baseRun, {
      status: 'running',
      summary: { requested: 3, completed: 2, executed: 2, passed: 1, failed: 1, passRate: 50 },
    });
    expect(afterSecond.completed).toBe(2);
    expect(afterSecond.executed).toBe(2);
    expect(afterSecond.passed).toBe(1);
    expect(afterSecond.failed).toBe(1);
    expect(afterSecond.progress).toBe(66);
    expect(afterSecond.passRate).toBe(50);

    const afterThird = computeLiveExecutionMetrics(baseRun, {
      status: 'done',
      summary: { requested: 3, completed: 3, executed: 3, passed: 2, failed: 1, passRate: 67 },
    });
    expect(afterThird.completed).toBe(3);
    expect(afterThird.executed).toBe(3);
    expect(afterThird.passed).toBe(2);
    expect(afterThird.failed).toBe(1);
    expect(afterThird.progress).toBe(100);
    expect(afterThird.passRate).toBe(67);
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

  it('muestra botón de checklist cuando failed>0 y checklistUrl existe sin issueKey', () => {
    expect(
      shouldShowDefectChecklistButton({
        failed: 1,
        defectCount: 1,
        checklistUrl: '/checklist/job:123',
        issueKey: null,
      }),
    ).toBe(true);
  });

  it('oculta botón cuando no hay fallos aunque exista checklistUrl', () => {
    expect(
      shouldShowDefectChecklistButton({
        failed: 0,
        defectCount: 0,
        checklistUrl: '/checklist/job:123',
        issueKey: null,
      }),
    ).toBe(false);
  });

  it('oculta botón cuando hay fallos pero no existe identidad de checklist', () => {
    expect(
      shouldShowDefectChecklistButton({
        failed: 1,
        defectCount: 0,
        checklistUrl: '',
        issueKey: '',
      }),
    ).toBe(false);
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
