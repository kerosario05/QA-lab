const labels: Record<string, string> = {
  typescript: 'Validar TypeScript',
  playwright_collection: 'Comprobar que Playwright reconoce el spec',
  spec_execution: 'Ejecutar el spec candidato antes de promover',
};

export interface PromotionLogCounterState {
  active: boolean;
  current: number;
  outcomes: Map<number, string>;
}

export interface PromotionLogCounterSummary {
  active: boolean;
  current: number;
  completed: number;
  passed: number;
  failed: number;
}

export function createPromotionLogCounterState(): PromotionLogCounterState {
  return {active: false, current: 0, outcomes: new Map()};
}

export function advancePromotionLogCounterState(state: PromotionLogCounterState, message: string): PromotionLogCounterState {
  const reset = /"type"\s*:\s*"case_started"/.test(message)
    || /\[promotion-progress\] stage=spec_execution status=started/.test(message);
  let active = reset ? false : state.active;
  let current = reset ? 0 : state.current;
  let outcomes = reset ? new Map<number, string>() : state.outcomes;

  if (/\[promotion-progress\]/.test(message)) active = true;
  const step = message.match(/\[promoted-step\].*?\bstepIndex=(\d+)\s+phase=(start|passed|failed)\b/);
  if (!active || !step) {
    if (active === state.active && current === state.current && outcomes === state.outcomes) return state;
    return {active, current, outcomes};
  }

  const stepIndex = Number(step[1]);
  const phase = step[2];
  if (current === stepIndex && (phase === 'start' || outcomes.get(stepIndex) === phase) && outcomes === state.outcomes) return state;
  current = stepIndex;
  if (phase !== 'start' && outcomes.get(stepIndex) !== phase) {
    outcomes = new Map(outcomes);
    outcomes.set(stepIndex, phase);
  }
  return {active, current, outcomes};
}

export function summarizePromotionLogCounterState(state: PromotionLogCounterState): PromotionLogCounterSummary {
  const outcomes = [...state.outcomes.values()];
  return {
    active: state.active,
    current: state.current,
    completed: state.outcomes.size,
    passed: outcomes.filter(status => status === 'passed').length,
    failed: outcomes.filter(status => status === 'failed').length,
  };
}

export function getPromotionProgress(logs: {msg: string}[]) {
  const stages = new Map<string, {id: string; label: string; status: string}>();
  for (const {msg} of logs) {
    if (/"type"\s*:\s*"case_started"/.test(msg)) stages.clear();
    const match = msg.match(/\[promotion-progress\] stage=(\w+) status=(\w+)/);
    if (match && labels[match[1]]) stages.set(match[1], {id: match[1], label: labels[match[1]], status: match[2]});
  }
  return [...stages.values()];
}

export function formatPromotionLog(message: string): string {
  const stage = message.match(/\[promotion-progress\] stage=(\w+) status=(\w+)/);
  if (stage && labels[stage[1]]) {
    const status = stage[2] === 'started' ? 'En curso' : stage[2] === 'passed' ? 'Aprobado' : stage[2] === 'failed' ? 'Fallido' : 'Finalizado';
    return `[Promoción] ${labels[stage[1]]} · ${status}`;
  }
  const step = message.match(/\[promoted-step\].*?\bstepIndex=(\d+)\s+phase=(start|passed|failed)\b/);
  if (step) return `[Promoción · Spec] Paso ${step[1]} · ${step[2] === 'start' ? 'Ejecutando' : step[2] === 'passed' ? 'Aprobado' : 'Fallido'}${message.slice((step.index ?? 0) + step[0].length)}`;
  return message;
}

export function getPromotionLogCounters(logs: {msg: string}[]): PromotionLogCounterSummary {
  const state = logs.reduce((current, {msg}) => advancePromotionLogCounterState(current, msg), createPromotionLogCounterState());
  return summarizePromotionLogCounterState(state);
}
