export type GenerationPhase =
  | 'idle'
  | 'initializing'
  | 'consulting'
  | 'filtering'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'error';

export type GenerationProgressState = {
  status: 'idle' | 'running' | 'success' | 'error';
  phase: GenerationPhase;
  percent: number;
  label: string;
  indeterminate: boolean;
  stepLabel: string;
};

const PHASES = [
  { phase: 'initializing' as const, percent: 5, label: 'Inicializando...' },
  { phase: 'consulting' as const, percent: 20, label: 'Consultando historias del sprint activo...' },
  { phase: 'filtering' as const, percent: 40, label: 'Aplicando filtro de estado...' },
  { phase: 'generating' as const, percent: 70, label: 'Generando escenarios con IA...' },
  { phase: 'validating' as const, percent: 90, label: 'Validando escenarios generados...' },
] as const;

function getPhaseByElapsed(elapsedMs: number) {
  if (elapsedMs < 800) return PHASES[0];
  if (elapsedMs < 2000) return PHASES[1];
  if (elapsedMs < 3200) return PHASES[2];
  if (elapsedMs < 6000) return PHASES[3];
  return PHASES[4];
}

export function computeGenerationProgress(params: {
  storiesLoading: boolean;
  storiesError: string | null;
  storiesLoaded: boolean;
  currentStep: number;
  startedAt?: number | null;
  now?: number;
}): GenerationProgressState {
  const now = params.now ?? Date.now();
  const startedAt = params.startedAt ?? now;

  if (params.storiesError) {
    return {
      status: 'error',
      phase: 'error',
      percent: 0,
      label: 'Error generando escenarios',
      indeterminate: false,
      stepLabel: params.storiesError,
    };
  }

  if (!params.storiesLoading && params.storiesLoaded) {
    return {
      status: 'success',
      phase: 'completed',
      percent: 100,
      label: 'Escenarios generados',
      indeterminate: false,
      stepLabel: 'Completado',
    };
  }

  if (!params.storiesLoading && !params.storiesLoaded) {
    return {
      status: 'idle',
      phase: 'idle',
      percent: 0,
      label: 'Listo',
      indeterminate: false,
      stepLabel: 'Esperando',
    };
  }

  const phase = getPhaseByElapsed(Math.max(0, now - startedAt));
  const phaseIndex = PHASES.findIndex((p) => p.phase === phase.phase);
  const basePercent = phase.percent;
  const elapsedInPhase = Math.max(0, now - startedAt) % 1600;
  const jitter = phaseIndex >= 0 ? Math.min(6, Math.floor(elapsedInPhase / 300)) : 0;
  const percent = Math.min(95, basePercent + jitter);

  return {
    status: 'running',
    phase: phase.phase,
    percent,
    label: 'Generando escenarios...',
    indeterminate: phaseIndex >= 0,
    stepLabel: phase.label,
  };
}
