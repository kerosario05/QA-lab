import { describe, expect, it } from 'vitest';
import { buildScenarioReadiness, classifyScenarioReadiness } from './scenario-readiness';
import type { McpRouteProfile, McpScenario } from '../../services/scenarios';

const routeProfile: McpRouteProfile = {
  name: 'informacion_productos',
  entry: [{ businessLabel: 'Inicio', visibleLabel: 'Inicio' }],
  aliases: {},
  intermediates: {},
  domainTerms: { producto: 'producto' },
  visibleControls: ['Volver'],
  representativeFixture: {},
  notes: [],
};

describe('scenario readiness', () => {
  it('marca timeout o inactividad como unsupported_or_manual', () => {
    const scenario = {
      sourceIssueKey: 'AA-1',
      title: 'Cerrar sesión por inactividad',
      steps: ['Esperar 10 minutos'],
      preconditions: [],
      expectedResult: 'La sesión debe cerrarse sola',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'kiosko',
      routeProfile: 'informacion_productos',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, routeProfile);
    expect(readiness.status).toBe('unsupported_or_manual');
    expect(readiness.recommendation).toContain('manual');
  });

  it('no convierte expected result genérico en pasos fuertes', () => {
    const scenario = {
      sourceIssueKey: 'AA-2',
      title: 'Verificar pantalla de producto',
      steps: ['Validar que se muestre el encabezado'],
      preconditions: [],
      expectedResult: 'Clic en Continuar',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'kiosko',
      routeProfile: 'informacion_productos',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, routeProfile);
    expect(readiness.status).toBe('unsupported_or_manual');
    expect(readiness.blockingSignals).toContain('expected_result_translated_to_strong_steps');
  });

  it('requiere routeProfile cuando faltan rutas y hay acciones', () => {
    const scenario = {
      sourceIssueKey: 'AA-3',
      title: 'Abrir producto',
      steps: ['Seleccionar producto'],
      preconditions: [],
      expectedResult: 'Se abre la vista',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'kiosko',
      routeProfile: 'default',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, null);
    expect(readiness.status).toBe('needs_route_profile');
    expect(readiness.blockingSignals).toContain('route_profile_missing');
  });

  it('agrega conteos y separa ejecutables de excluidos', () => {
    const scenarios = [
      {
        sourceIssueKey: 'AA-4',
        title: 'Abrir producto',
        steps: ['Seleccionar producto'],
        preconditions: [],
        expectedResult: 'Se abre la vista',
        type: 'MCP',
        database: 'QA',
        isConverted: 1,
        automationType: 'ui',
        setupStrategy: 'standard',
        appSlug: 'kiosko',
        routeProfile: 'informacion_productos',
        dataRequirements: '',
        nonExecutableCriteria: '',
        mcpExecutable: true,
        validation: { valid: true, errors: [], warnings: [] },
      },
      {
        sourceIssueKey: 'AA-5',
        title: 'Cerrar sesión por inactividad',
        steps: ['Esperar 10 minutos'],
        preconditions: [],
        expectedResult: 'La sesión debe cerrarse sola',
        type: 'MCP',
        database: 'QA',
        isConverted: 1,
        automationType: 'ui',
        setupStrategy: 'standard',
        appSlug: 'kiosko',
        routeProfile: 'informacion_productos',
        dataRequirements: '',
        nonExecutableCriteria: '',
        mcpExecutable: true,
        validation: { valid: true, errors: [], warnings: [] },
      } as McpScenario,
    ] as McpScenario[];

    const summary = buildScenarioReadiness(scenarios, routeProfile);
    expect(summary.counts.auto_executable).toBe(1);
    expect(summary.counts.unsupported_or_manual).toBe(1);
  });

  it('no marca navegacion informativa como needs_test_data', () => {
    const scenario = {
      sourceIssueKey: 'AA-6',
      title: 'Ir a detalle de producto',
      steps: ['Clic en la card visible', 'Volver al listado'],
      preconditions: [],
      expectedResult: 'Se muestra el detalle',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'demo',
      routeProfile: 'informacion_productos',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, routeProfile);
    expect(readiness.status).toBe('auto_executable');
    expect(readiness.blockingSignals).not.toContain('test_data_required');
  });

  it('marca correo y completar formulario como needs_test_data', () => {
    const scenario = {
      sourceIssueKey: 'AA-7',
      title: 'Completar formulario de contacto',
      steps: ['Ingresar correo', 'Completar formulario'],
      preconditions: [],
      expectedResult: 'Se envía la información',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'demo',
      routeProfile: 'informacion_productos',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, routeProfile);
    expect(readiness.status).toBe('needs_test_data');
    expect(readiness.blockingSignals).toContain('test_data_required');
  });

  it('marca monto cuenta OTP PIN como needs_test_data', () => {
    const scenario = {
      sourceIssueKey: 'AA-8',
      title: 'Transferencia bancaria',
      steps: ['Ingresar monto', 'Seleccionar cuenta', 'Validar OTP'],
      preconditions: [],
      expectedResult: 'La operación se completa',
      type: 'MCP',
      database: 'QA',
      isConverted: 1,
      automationType: 'ui',
      setupStrategy: 'standard',
      appSlug: 'demo',
      routeProfile: 'informacion_productos',
      dataRequirements: '',
      nonExecutableCriteria: '',
      mcpExecutable: true,
      validation: { valid: true, errors: [], warnings: [] },
    } as McpScenario;

    const readiness = classifyScenarioReadiness(scenario, routeProfile);
    expect(readiness.status).toBe('needs_test_data');
    expect(readiness.blockingSignals).toContain('test_data_required');
  });
});
