import type { ActiveRun } from '../../types';

export type LiveExecutionSummaryLike = {
  scenarioCount?: number;
  totalStories?: number;
  total?: number;
  completed?: number;
  passed?: number;
  failed?: number;
  errorMessage?: string;
  promotionReason?: string;
  failureGroups?: Record<string, number>;
  testRailRunId?: number;
  testRailRunUrl?: string;
  pendingTestRailReportPath?: string;
  createdTestRailCases?: number;
  reusedTestRailCases?: number;
  reportedTestRailPassed?: number;
  reportedTestRailFailed?: number;
};

export type LiveExecutionStatusLike = {
  status?: string;
  progress?: number;
  total?: number;
  passed?: number;
  failed?: number;
  completed?: number;
  currentTest?: string;
  currentCase?: string;
  errorMessage?: string;
  summary?: LiveExecutionSummaryLike;
};

export type LiveExecutionMetrics = {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  progress: number;
  passRate: number;
  currentTestName: string;
  errorMessage: string | null;
  promotionReason: string | null;
  failureGroups: Record<string, number> | null;
  dominantFailure: string | null;
};

export type LiveExecutionOutcome = {
  status: 'running' | 'completed' | 'completed_with_failures' | 'technical_failure';
  title: string;
  subtitle: string;
  isTechnicalFailure: boolean;
  usesObservationsCopy: boolean;
};

function getNumeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function computeLiveExecutionMetrics(
  run: ActiveRun | null,
  data?: LiveExecutionStatusLike,
): LiveExecutionMetrics {
  const summary = data?.summary;
  const total = getNumeric(summary?.scenarioCount)
    ?? getNumeric(summary?.totalStories)
    ?? getNumeric(summary?.total)
    ?? getNumeric(data?.total)
    ?? run?.total
    ?? 0;
  const completed = getNumeric(data?.completed)
    ?? getNumeric(summary?.completed)
    ?? run?.completed
    ?? 0;
  const passed = getNumeric(data?.passed)
    ?? getNumeric(summary?.passed)
    ?? run?.passed
    ?? 0;
  const failed = getNumeric(data?.failed)
    ?? getNumeric(summary?.failed)
    ?? run?.failed
    ?? 0;
  const progress = getNumeric(data?.progress)
    ?? (total > 0 ? Math.round((completed / total) * 100) : run?.progress ?? 0);
  const passRateBase = completed > 0 ? completed : total;
  const passRate = passRateBase > 0 ? Math.round((passed / passRateBase) * 100) : 0;

  return {
    total,
    completed,
    passed,
    failed,
    progress,
    passRate,
    currentTestName: data?.currentCase || data?.currentTest || run?.currentTest || '',
    errorMessage: data?.errorMessage || summary?.errorMessage || null,
    promotionReason: (summary?.promotionReason as string | undefined) ?? null,
    failureGroups: (summary?.failureGroups as Record<string, number> | undefined) ?? null,
    dominantFailure: (() => {
      const groups = (summary?.failureGroups as Record<string, number> | undefined) ?? null;
      if (!groups) return null;
      const ordered = Object.entries(groups)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);
      return ordered[0]?.[0] ?? null;
    })(),
  };
}

export function getLiveExecutionStatusText(status: string, completed: number): string {
  if (status === 'failed' || status === 'error') {
    return completed > 0 ? 'Terminado con errores' : 'Ejecución fallida';
  }
  if (status === 'completed_with_failures') {
    return 'Ejecución completada con observaciones';
  }
  if (status === 'done' || status === 'completed') {
    return 'Ejecución completada';
  }
  return 'Ejecutándose ahora';
}

export function getLiveExecutionOutcome(
  status: string,
  summary: Pick<LiveExecutionMetrics, 'completed' | 'passed' | 'failed' | 'total'>,
  errorMessage?: string | null,
): LiveExecutionOutcome {
  const hasPartialResults = summary.completed > 0 || summary.passed > 0 || summary.failed > 0;
  const total = summary.total || summary.completed;

  if (status === 'completed_with_failures' && summary.passed > 0 && summary.failed > 0) {
    return {
      status: 'completed_with_failures',
      title: 'Ejecución completada con observaciones',
      subtitle: `${summary.passed} de ${total} escenarios pasaron. ${summary.failed} requiere${summary.failed === 1 ? '' : 'n'} revisión.`,
      isTechnicalFailure: false,
      usesObservationsCopy: true,
    };
  }

  if (status === 'completed') {
    return {
      status: 'completed',
      title: 'Ejecución completada',
      subtitle: `${summary.passed} de ${total} escenarios pasaron.`,
      isTechnicalFailure: false,
      usesObservationsCopy: false,
    };
  }

  if (status === 'failed' || status === 'error') {
    const technicalFailure = !hasPartialResults;
    return {
      status: technicalFailure ? 'technical_failure' : 'completed_with_failures',
      title: technicalFailure ? '✗ Error' : 'Ejecución completada con observaciones',
      subtitle: technicalFailure
        ? (errorMessage || 'La ejecución falló antes de iniciar el primer caso.')
        : `${summary.passed} de ${total} escenarios pasaron. ${summary.failed} requiere${summary.failed === 1 ? '' : 'n'} revisión.`,
      isTechnicalFailure: technicalFailure,
      usesObservationsCopy: !technicalFailure,
    };
  }

  return {
    status: 'running',
    title: 'Ejecutándose ahora',
    subtitle: '',
    isTechnicalFailure: false,
    usesObservationsCopy: false,
  };
}
