import { describe, it, expect } from 'vitest';
import {
  parseMobileScenarioEvent,
  reduceMobileProgress,
  createMobileProgressState,
  computeMobileCounters,
} from './mobile-progress';

describe('parseMobileScenarioEvent', () => {
  it('parses a scenario start line', () => {
    const ev = parseMobileScenarioEvent('[mobile:launch] scenario MOBILE-AA-84-001 "Validación exitosa de documento" — starting');
    expect(ev).toEqual({ kind: 'start', scenarioId: 'MOBILE-AA-84-001', title: 'Validación exitosa de documento' });
  });

  it('parses a scenario finished=failed line', () => {
    const ev = parseMobileScenarioEvent('[mobile:launch] scenario MOBILE-AA-84-001 finished status=failed passed=7 failed=1');
    expect(ev).toEqual({ kind: 'finish', scenarioId: 'MOBILE-AA-84-001', status: 'failed' });
  });

  it('parses a scenario finished=passed line', () => {
    const ev = parseMobileScenarioEvent('[mobile:launch] scenario MOBILE-AA-90-002 finished status=passed passed=5 failed=0');
    expect(ev).toEqual({ kind: 'finish', scenarioId: 'MOBILE-AA-90-002', status: 'passed' });
  });

  it('tolerates a plain hyphen instead of em-dash on start', () => {
    const ev = parseMobileScenarioEvent('scenario X-1 "Titulo" - starting');
    expect(ev).toEqual({ kind: 'start', scenarioId: 'X-1', title: 'Titulo' });
  });

  it('ignores unrelated log lines', () => {
    expect(parseMobileScenarioEvent('[mobile:scenario] step 3/8 action=click ...')).toBeNull();
    expect(parseMobileScenarioEvent('')).toBeNull();
  });
});

describe('reduceMobileProgress — 1 escenario con 8 pasos (7 passed / 1 failed)', () => {
  it('cuenta 1 escenario fallado, no 8 pasos', () => {
    const state = createMobileProgressState();
    const total = 1;

    reduceMobileProgress(state, 'scenario MOBILE-AA-84-001 "Validación exitosa" — starting', total);
    // pasos individuales no deben afectar
    expect(reduceMobileProgress(state, '[mobile:scenario] step 8/8 action=click', total)).toBeNull();

    const counters = reduceMobileProgress(
      state,
      '[mobile:launch] scenario MOBILE-AA-84-001 finished status=failed passed=7 failed=1',
      total,
    );

    expect(counters).toEqual({ passed: 0, failed: 1, completed: 1, currentTest: '', progress: 100 });
  });
});

describe('reduceMobileProgress — 2 escenarios (1 passed / 1 failed)', () => {
  it('cuenta a nivel escenario', () => {
    const state = createMobileProgressState();
    const total = 2;

    reduceMobileProgress(state, 'scenario S-1 "Primero" — starting', total);
    let c = reduceMobileProgress(state, 'scenario S-1 finished status=passed passed=4 failed=0', total);
    expect(c).toEqual({ passed: 1, failed: 0, completed: 1, currentTest: '', progress: 50 });

    reduceMobileProgress(state, 'scenario S-2 "Segundo" — starting', total);
    c = reduceMobileProgress(state, 'scenario S-2 finished status=failed passed=2 failed=1', total);
    expect(c).toEqual({ passed: 1, failed: 1, completed: 2, currentTest: '', progress: 100 });
  });
});

describe('reduceMobileProgress — idempotencia (replay histórico)', () => {
  it('no doble-cuenta si la línea finished llega repetida', () => {
    const state = createMobileProgressState();
    const total = 1;
    reduceMobileProgress(state, 'scenario S-1 finished status=passed passed=3 failed=0', total);
    reduceMobileProgress(state, 'scenario S-1 finished status=passed passed=3 failed=0', total);
    expect(computeMobileCounters(state, total)).toEqual({ passed: 1, failed: 0, completed: 1, currentTest: '', progress: 100 });
  });
});

describe('computeMobileCounters — currentTest mientras corre', () => {
  it('expone el título del escenario en curso hasta que termina', () => {
    const state = createMobileProgressState();
    reduceMobileProgress(state, 'scenario S-1 "En progreso" — starting', 3);
    expect(computeMobileCounters(state, 3)).toEqual({ passed: 0, failed: 0, completed: 0, currentTest: 'En progreso', progress: 0 });
  });
});
