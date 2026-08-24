import { C } from '../constants/theme';
import type { Project, Execution, ActiveRun, TestCase, SprintCycle, PendingDefect, AiRunComparison } from '../types';

export const projects: Project[] = [
  { id: 'p1', name: 'Core Banking', team: 'Plataforma', stack: 'Selenium · Java', automated: 248, runs: 1842, passRate: 94.2, defects: 12, lastRun: '2h', status: 'success', trend: [88, 91, 89, 93, 92, 94, 94] },
  { id: 'p2', name: 'Mobile Banking', team: 'Mobile', stack: 'Appium · JS', automated: 186, runs: 1203, passRate: 87.5, defects: 23, lastRun: '45m', status: 'success', trend: [82, 85, 83, 86, 88, 87, 87] },
  { id: 'p3', name: 'Portal Web Clientes', team: 'Digital', stack: 'Cypress · TS', automated: 312, runs: 2451, passRate: 91.8, defects: 18, lastRun: '15m', status: 'running', trend: [89, 90, 92, 91, 93, 91, 92] },
  { id: 'p4', name: 'API Pagos', team: 'Backend', stack: 'Newman', automated: 156, runs: 3120, passRate: 96.7, defects: 7, lastRun: '30m', status: 'success', trend: [94, 95, 96, 96, 97, 97, 97] },
  { id: 'p5', name: 'Originación Créditos', team: 'Productos', stack: 'Selenium · Py', automated: 98, runs: 542, passRate: 82.3, defects: 31, lastRun: '1d', status: 'failed', trend: [78, 80, 79, 82, 81, 82, 82] },
  { id: 'p6', name: 'Cajeros ATM', team: 'Canales', stack: 'Custom', automated: 64, runs: 412, passRate: 89.1, defects: 9, lastRun: '5h', status: 'success', trend: [85, 87, 88, 89, 88, 89, 89] },
];

export const executionHistory: Execution[] = [
  { id: 'e1', date: '20 May · 14:32', project: 'Portal Web Clientes', triggered: 'Carlos M.', duration: '12m 34s', total: 142, passed: 138, failed: 4, status: 'success' },
  { id: 'e2', date: '20 May · 13:15', project: 'Mobile Banking', triggered: 'Scheduler', duration: '8m 12s', total: 86, passed: 79, failed: 7, status: 'partial' },
  { id: 'e3', date: '20 May · 11:48', project: 'API Pagos', triggered: 'María R.', duration: '4m 22s', total: 156, passed: 156, failed: 0, status: 'success' },
  { id: 'e4', date: '20 May · 10:22', project: 'Core Banking', triggered: 'Pipeline CI', duration: '18m 45s', total: 248, passed: 232, failed: 16, status: 'partial' },
  { id: 'e5', date: '20 May · 09:05', project: 'Originación Créditos', triggered: 'Juan P.', duration: '15m 03s', total: 98, passed: 78, failed: 20, status: 'failed' },
  { id: 'e6', date: '19 May · 22:00', project: 'Portal Web Clientes', triggered: 'Scheduler', duration: '11m 56s', total: 142, passed: 140, failed: 2, status: 'success' },
];

export const weekData = [
  { d: 'L', val: 142, ok: 128 }, { d: 'M', val: 168, ok: 156 }, { d: 'X', val: 134, ok: 119 },
  { d: 'J', val: 198, ok: 184 }, { d: 'V', val: 224, ok: 211 }, { d: 'S', val: 89, ok: 84 }, { d: 'D', val: 76, ok: 72 },
];

export const severityData = [
  { name: 'Crítico', value: 8, fill: '#E63946' },
  { name: 'Alto', value: 24, fill: '#F4A261' },
  { name: 'Medio', value: 42, fill: C.blue },
  { name: 'Bajo', value: 26, fill: C.mute },
];

export const monthlyDefects = [
  { mes: 'Ene', encontrados: 84, resueltos: 78 },
  { mes: 'Feb', encontrados: 92, resueltos: 89 },
  { mes: 'Mar', encontrados: 76, resueltos: 81 },
  { mes: 'Abr', encontrados: 105, resueltos: 94 },
  { mes: 'May', encontrados: 100, resueltos: 87 },
];



export const sampleTestCases: TestCase[] = [
  { id: 'C1042', title: 'Login con credenciales válidas', suite: 'Autenticación', priority: 'Alta', complexity: 'Baja', steps: 4, duration: '45s' },
  { id: 'C1043', title: 'Login con contraseña incorrecta', suite: 'Autenticación', priority: 'Alta', complexity: 'Baja', steps: 3, duration: '30s' },
  { id: 'C1044', title: 'Recuperación de contraseña vía email', suite: 'Autenticación', priority: 'Media', complexity: 'Media', steps: 8, duration: '1m 20s' },
  { id: 'C1058', title: 'Transferencia entre cuentas propias', suite: 'Transferencias', priority: 'Crítica', complexity: 'Alta', steps: 12, duration: '2m 10s' },
  { id: 'C1059', title: 'Transferencia a terceros banco propio', suite: 'Transferencias', priority: 'Crítica', complexity: 'Alta', steps: 14, duration: '2m 30s' },
  { id: 'C1060', title: 'Transferencia interbancaria ACH', suite: 'Transferencias', priority: 'Crítica', complexity: 'Muy alta', steps: 22, duration: '3m 15s' },
  { id: 'C1061', title: 'Validación de límites diarios', suite: 'Transferencias', priority: 'Alta', complexity: 'Media', steps: 9, duration: '1m 45s' },
  { id: 'C1075', title: 'Consulta de saldo en cuenta corriente', suite: 'Consultas', priority: 'Media', complexity: 'Baja', steps: 3, duration: '20s' },
  { id: 'C1076', title: 'Descarga de estado de cuenta PDF', suite: 'Consultas', priority: 'Media', complexity: 'Media', steps: 6, duration: '40s' },
  { id: 'C1092', title: 'Pago de servicios públicos · Edenorte', suite: 'Pagos', priority: 'Alta', complexity: 'Alta', steps: 11, duration: '1m 50s' },
  { id: 'C1093', title: 'Pago de tarjeta de crédito propia', suite: 'Pagos', priority: 'Alta', complexity: 'Media', steps: 8, duration: '1m 30s' },
  { id: 'C1094', title: 'Pago programado recurrente', suite: 'Pagos', priority: 'Media', complexity: 'Alta', steps: 13, duration: '2m 00s' },
];

export const pendingDefects: PendingDefect[] = [
  { id: 'CB-2341', title: 'Saldo no se actualiza tras transferencia ACH', severity: 'Bloqueante', resolvedBy: 'Ana Pérez', daysWaiting: 1, sprint: 'Sprint 24', component: 'Transferencias' },
  { id: 'CB-2338', title: 'Sesión expira antes del timeout configurado', severity: 'Crítico', resolvedBy: 'Luis Gómez', daysWaiting: 2, sprint: 'Sprint 24', component: 'Autenticación' },
  { id: 'CB-2335', title: 'Validación de cédula acepta caracteres especiales', severity: 'Crítico', resolvedBy: 'María R.', daysWaiting: 3, sprint: 'Sprint 24', component: 'Originación' },
  { id: 'CB-2330', title: 'Mensaje de error genérico en pago fallido', severity: 'Alto', resolvedBy: 'Pedro S.', daysWaiting: 4, sprint: 'Sprint 24', component: 'Pagos' },
  { id: 'CB-2328', title: 'Estado de cuenta PDF sin logo del banco', severity: 'Medio', resolvedBy: 'Ana Pérez', daysWaiting: 5, sprint: 'Sprint 24', component: 'Consultas' },
  { id: 'CB-2325', title: 'Tooltip de límites diarios cortado en mobile', severity: 'Bajo', resolvedBy: 'Luis Gómez', daysWaiting: 6, sprint: 'Sprint 24', component: 'Mobile' },
];

export const sprintCycles: SprintCycle[] = [
  { id: 1, name: 'Ciclo 1 · Smoke inicial', date: '12 May', total: 42, passed: 38, failed: 4, defects: 7, duration: '8m', status: 'completed' },
  { id: 2, name: 'Ciclo 2 · Regresión funcional', date: '15 May', total: 142, passed: 128, failed: 14, defects: 11, duration: '14m', status: 'completed' },
  { id: 3, name: 'Ciclo 3 · Re-test de bugs', date: '18 May', total: 28, passed: 24, failed: 4, defects: 3, duration: '5m', status: 'completed' },
  { id: 4, name: 'Ciclo 4 · Regresión completa', date: '20 May', total: 142, passed: 132, failed: 10, defects: 6, duration: '13m', status: 'running' },
];

export const efficiencyData = [
  { casos: 42, tiempo: 8, label: 'Ciclo 1' },
  { casos: 86, tiempo: 12, label: 'Mobile sprint 17' },
  { casos: 142, tiempo: 14, label: 'Ciclo 2' },
  { casos: 28, tiempo: 5, label: 'Ciclo 3' },
  { casos: 142, tiempo: 13, label: 'Ciclo 4' },
  { casos: 156, tiempo: 4, label: 'API smoke' },
  { casos: 98, tiempo: 15, label: 'Originación' },
  { casos: 64, tiempo: 6, label: 'ATM' },
  { casos: 248, tiempo: 18, label: 'Core completo' },
  { casos: 186, tiempo: 11, label: 'Mobile completo' },
  { casos: 312, tiempo: 22, label: 'Portal completo' },
];

export const complexityData = [
  { name: 'Baja', value: 84, fill: '#48A157', count: 84 },
  { name: 'Media', value: 96, fill: '#104B99', count: 96 },
  { name: 'Alta', value: 52, fill: '#F4A261', count: 52 },
  { name: 'Muy alta', value: 16, fill: '#E63946', count: 16 },
];

export const activeRuns: ActiveRun[] = [
  {
    id: 'EXE-4821',
    project: 'Portal Web Clientes',
    triggered: 'Carlos M.',
    startedAt: 'Hace 3m',
    progress: 42,
    total: 142,
    completed: 60,
    passed: 57,
    failed: 3,
    currentTest: 'C1058 · Transferencia entre cuentas propias',
    eta: '7m 12s',
    status: 'running',
  },
  {
    id: 'EXE-4820',
    project: 'API Pagos',
    triggered: 'Scheduler · Nightly',
    startedAt: 'Hace 1m',
    progress: 12,
    total: 156,
    completed: 19,
    passed: 19,
    failed: 0,
    currentTest: 'C2103 · Validación de token OAuth',
    eta: '3m 45s',
    status: 'running',
  },
  {
    id: 'EXE-4819',
    project: 'Mobile Banking',
    triggered: 'Pipeline CI',
    startedAt: 'Hace 6m',
    progress: 78,
    total: 86,
    completed: 67,
    passed: 62,
    failed: 5,
    currentTest: 'C3045 · Validación biométrica iOS',
    eta: '1m 50s',
    status: 'running',
  },
];

export const aiRunComparisons: AiRunComparison[] = [
  {
    id: 'aa-91-gpt-5-4',
    projectKey: 'AA-91',
    label: 'GPT-5.4',
    provider: 'copilot_cli',
    model: 'gpt-5.4',
    status: 'historical',
    calls: 1,
    generated: 6,
    automatable: 6,
    validVisible: 6,
    rejected: 0,
    durationSeconds: 87.222,
    tokens: {
      total: 68557,
      input: 64352,
      cachedInput: 41088,
      nonCachedInput: 23264,
      output: 4205,
      reasoning: 547,
    },
    repair: {
      routePrefix: 6,
      aiRepair: '3 repairs',
      aiRepairSuccess: '0 success',
    },
    huPerCycle: '18-20',
    efficiencyScore: 92,
    qualityScore: 84,
    notes: [
      '6/6 validos y visibles',
      '6/6 con route-prefix repair',
      'Capacidad estimada 18-20 HU/ciclo',
    ],
  },
  {
    id: 'aa-91-gpt-5-4-integral',
    projectKey: 'AA-91',
    label: 'GPT-5.4 integral',
    provider: 'copilot_cli',
    model: 'gpt-5.4',
    status: 'historical',
    calls: 1,
    generated: 6,
    automatable: 6,
    validVisible: 6,
    rejected: 0,
    durationSeconds: null,
    tokens: {
      total: 227757,
      input: 0,
      output: 0,
      copilot: 'Generacion 70,801 + AI-REPAIR 156,956',
    },
    repair: {
      routePrefix: 6,
      aiRepair: '3 repairs',
      aiRepairSuccess: '0 success',
    },
    huPerCycle: '18-20',
    efficiencyScore: 74,
    qualityScore: 84,
    notes: [
      'Historico integral conservado',
      'Capacidad estimada basada en 70,801 tokens/HU',
      'No se recalculan tokens de Copilot',
    ],
  },
  {
    id: 'aa-91-claude-sonnet-4-6',
    projectKey: 'AA-91',
    label: 'Claude Sonnet 4.6',
    provider: 'copilot_cli',
    model: 'claude-sonnet-4.6',
    status: 'partial',
    calls: 1,
    generated: 6,
    automatable: 6,
    validVisible: 5,
    rejected: 1,
    durationSeconds: 64.02,
    tokens: {
      copilot: 'No disponible / no calculable',
    },
    repair: {
      routePrefix: 6,
      branchCoverage: '1/1',
      aiRepair: 'desactivado',
      aiRepairSuccess: 'N/A',
    },
    huPerCycle: 'No calculable',
    efficiencyScore: 100,
    qualityScore: 79,
    notes: [
      '1 rechazado por patron MCP',
      '6/6 route-prefix repair',
      'Comparabilidad parcial hasta ejecutar Claude',
    ],
  },
];
