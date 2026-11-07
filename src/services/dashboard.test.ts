import { describe, expect, it, vi } from 'vitest';
import { buildActiveScenariosFromJobParams, loadDashboardData } from './dashboard';

it('renders compact dashboard data without waiting for optional execution detail requests',async()=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.endsWith('/api/projects'))return new Response(JSON.stringify({projects:[{id:'p',slug:'fenix',name:'Fenix',enabled:true}]}));
    if(url.endsWith('/api/executions'))return new Response(JSON.stringify({executions:[{launchId:'run',appSlug:'fenix',createdAt:'2026-10-31T12:00:00Z',passed:1,failed:0,scenarioCount:1}]}));
    if(url.endsWith('/api/runs'))return new Response(JSON.stringify({jobs:[]}));
    throw new Error('Unexpected detail request');
  });
  vi.stubGlobal('fetch',fetcher);
  try{const data=await loadDashboardData();expect(data.executions).toHaveLength(1);expect(data.executions[0].launchId).toBe('run');expect(fetcher).toHaveBeenCalledTimes(3);}finally{vi.unstubAllGlobals();}
});

describe('dashboard active scenario hydration', () => {
  it('rebuilds recording steps so case_started can render the current step', () => {
    const scenarios = buildActiveScenariosFromJobParams({
      scenarios: [{
        recordedScenarioId: 'REC-1-01',
        title: 'Crear Cliente',
        steps: [
          'Abrir la aplicación configurada del proyecto',
          'Ingresar "usuario-real" en "Usuario"',
          'Presionar "Continuar"',
          'Seleccionar "Cliente" en "Tipo"',
        ],
      }],
    });

    expect(scenarios).toEqual([{
      id: 'REC-1-01',
      title: 'Crear Cliente',
      index: 1,
      total: 1,
      steps: [
        'Abrir la aplicación configurada del proyecto',
        'Ingresar "[REDACTED]" en "Usuario"',
        'Presionar "Continuar"',
        'Seleccionar "Cliente" en "Tipo"',
      ],
    }]);
  });

  it('accepts testRailSteps and ignores malformed or empty scenarios', () => {
    const scenarios = buildActiveScenariosFromJobParams({
      activeScenarios: [
        { scenarioId: 'REC-2-01', title: 'Caso 2', testRailSteps: [{ content: 'Ingresar "secreto" en "Clave"' }] },
        null,
        { title: '', steps: ['No debe aparecer'] },
      ],
    });

    expect(scenarios).toEqual([{
      id: 'REC-2-01',
      title: 'Caso 2',
      index: 1,
      total: 1,
      steps: ['Ingresar "[REDACTED]" en "Clave"'],
    }]);
  });
});
