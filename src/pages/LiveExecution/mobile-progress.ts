// Deriva contadores a nivel ESCENARIO para runs mobile parseando las líneas de log
// del stream SSE. El backend mobile reporta passed/failed a nivel PASO en su summary,
// pero emite una línea de verdad por escenario que usamos para mostrar el progreso
// igual que el flujo web (1 escenario = 1 pass/fail), no por paso.

export type MobileScenarioStatus = 'passed' | 'failed';

export type MobileScenarioEvent =
  | { kind: 'start'; scenarioId: string; title: string }
  | { kind: 'finish'; scenarioId: string; status: MobileScenarioStatus }
  | null;

export interface MobileProgressState {
  /** scenarioId -> estado final del escenario. */
  results: Map<string, MobileScenarioStatus>;
  /** Título del último escenario iniciado (para mostrar como "test actual"). */
  currentTitle: string;
}

export interface MobileProgressCounters {
  passed: number;
  failed: number;
  completed: number;
  currentTest: string;
  /** 0-100; requiere el total de escenarios (lo aporta el caller). */
  progress: number;
}

export function createMobileProgressState(): MobileProgressState {
  return { results: new Map(), currentTitle: '' };
}

// Ej: [mobile:launch] scenario MOBILE-AA-84-001 "Validación exitosa..." — starting
const START_RE = /\bscenario\s+(\S+)\s+"([^"]*)"\s*[—–-]\s*starting/i;
// Ej: [mobile:launch] scenario MOBILE-AA-84-001 finished status=failed passed=7 failed=1
const FINISH_RE = /\bscenario\s+(\S+)\s+finished\s+status=(passed|failed)/i;

export function parseMobileScenarioEvent(message: string): MobileScenarioEvent {
  if (!message) return null;

  const finish = FINISH_RE.exec(message);
  if (finish) {
    return { kind: 'finish', scenarioId: finish[1], status: finish[2].toLowerCase() as MobileScenarioStatus };
  }

  const start = START_RE.exec(message);
  if (start) {
    return { kind: 'start', scenarioId: start[1], title: start[2] };
  }

  return null;
}

/**
 * Aplica un evento al estado (muta el Map, idempotente por scenarioId) y devuelve
 * los contadores derivados. Devuelve `null` si el mensaje no era un evento relevante.
 */
export function reduceMobileProgress(
  state: MobileProgressState,
  message: string,
  total: number,
): MobileProgressCounters | null {
  const event = parseMobileScenarioEvent(message);
  if (!event) return null;

  if (event.kind === 'start') {
    state.currentTitle = event.title;
  } else {
    // idempotente: si ya estaba registrado, no cambia el conteo
    state.results.set(event.scenarioId, event.status);
    // el escenario terminó: ya no es el "actual"
    state.currentTitle = '';
  }

  return computeMobileCounters(state, total);
}

export function computeMobileCounters(state: MobileProgressState, total: number): MobileProgressCounters {
  let passed = 0;
  let failed = 0;
  for (const status of state.results.values()) {
    if (status === 'passed') passed++;
    else failed++;
  }
  const completed = state.results.size;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { passed, failed, completed, currentTest: state.currentTitle, progress };
}
