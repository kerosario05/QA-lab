import { describe, expect, it } from 'vitest';
import { buildActiveScenarioQueue, getInitialActiveScenario } from './active-scenario-queue';

describe('active scenario queue', () => {
  it('seeds the panel with the selected TestRail case title and authored steps in launch order', () => {
    const queue = buildActiveScenarioQueue([
      { id: '53821', title: 'Transferencia promovida', steps: ['Abrir la app', 'Autorizar'] },
      { id: '54373', title: 'Transferencia nueva', steps: ['Abrir la app', 'Consultar'] },
    ]);

    expect(queue).toEqual([
      { id: '53821', title: 'Transferencia promovida', steps: ['Abrir la app', 'Autorizar'], index: 1, total: 2 },
      { id: '54373', title: 'Transferencia nueva', steps: ['Abrir la app', 'Consultar'], index: 2, total: 2 },
    ]);
    expect(getInitialActiveScenario({ activeScenarios: queue })).toEqual(queue[0]);
  });

  it('normalizes markup inside a Jira-authored step without splitting that step into multiple panel rows', () => {
    const [scenario] = buildActiveScenarioQueue([{
      id: 'AA-88:jira:1',
      title: '  Redirigir <b>Estados de cuenta</b>  ',
      steps: ['<p>Clic en "Estados de cuenta"</p><br>y comprobar la pantalla de acceso'],
    }]);

    expect(scenario).toMatchObject({
      title: 'Redirigir Estados de cuenta',
      steps: ['Clic en "Estados de cuenta" y comprobar la pantalla de acceso'],
    });
  });

  it('returns no initial card when the launch contains no executable cases', () => {
    expect(buildActiveScenarioQueue([])).toEqual([]);
    expect(getInitialActiveScenario({ activeScenarios: [] })).toBeNull();
  });
});
