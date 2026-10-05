import { C } from '../constants/theme';
import type { Project, Execution, ActiveRun, TestCase, SprintCycle, PendingDefect, AiRunComparison } from '../types';

export const projects: Project[] = [
  { id: 'p1', name: 'portal empresarial', team: 'Equipo QA', stack: 'Web · Playwright', automated: 18, runs: 31, passRate: 77.4, defects: 4, lastRun: 'hoy', status: 'running', trend: [70, 74, 72, 78, 75, 80, 77] },
  { id: 'p2', name: 'KIOSKO', team: 'Equipo QA', stack: 'Web · Playwright', automated: 12, runs: 18, passRate: 83.3, defects: 4, lastRun: 'ayer', status: 'success', trend: [76, 79, 82, 80, 84, 81, 83] },
  { id: 'p3', name: 'Portal comercial', team: 'Equipo QA', stack: 'Web · Playwright', automated: 9, runs: 11, passRate: 81.8, defects: 2, lastRun: 'hace 2 días', status: 'partial', trend: [72, 75, 78, 76, 80, 79, 82] },
  { id: 'p4', name: 'Fenix', team: 'Equipo QA', stack: 'Web · Playwright', automated: 24, runs: 42, passRate: 78.6, defects: 6, lastRun: 'hoy', status: 'partial', trend: [68, 72, 75, 73, 79, 77, 79] },
  { id: 'p5', name: 'ROKE', team: 'Equipo QA', stack: 'Web · Playwright', automated: 7, runs: 8, passRate: 87.5, defects: 1, lastRun: 'hace 3 días', status: 'success', trend: [75, 78, 81, 80, 84, 86, 88] },
];

export const executionHistory: Execution[] = [
  { id: 'e1', date: '03 oct · 14:32', project: 'Fenix', triggered: 'Carlos M.', duration: '3m 24s', total: 12, passed: 10, failed: 2, status: 'partial' },
  { id: 'e2', date: '03 oct · 13:15', project: 'portal empresarial', triggered: 'Carlos M.', duration: '2m 12s', total: 8, passed: 6, failed: 2, status: 'partial' },
  { id: 'e3', date: '02 oct · 11:48', project: 'KIOSKO', triggered: 'María R.', duration: '1m 22s', total: 5, passed: 5, failed: 0, status: 'success' },
  { id: 'e4', date: '02 oct · 10:22', project: 'Portal comercial', triggered: 'Carlos M.', duration: '2m 45s', total: 9, passed: 7, failed: 2, status: 'partial' },
  { id: 'e5', date: '01 oct · 09:05', project: 'Fenix', triggered: 'Carlos M.', duration: '4m 03s', total: 14, passed: 11, failed: 3, status: 'partial' },
  { id: 'e6', date: '30 sep · 22:00', project: 'ROKE', triggered: 'María R.', duration: '1m 56s', total: 6, passed: 5, failed: 1, status: 'partial' },
];

export const weekData = [
  { d: 'L', val: 14, ok: 11 }, { d: 'M', val: 18, ok: 15 }, { d: 'X', val: 12, ok: 9 },
  { d: 'J', val: 21, ok: 17 }, { d: 'V', val: 16, ok: 13 }, { d: 'S', val: 8, ok: 6 }, { d: 'D', val: 3, ok: 3 },
];

export const severityData = [
  { name: 'Crítico', value: 2, fill: '#E63946' },
  { name: 'Alto', value: 5, fill: '#F4A261' },
  { name: 'Medio', value: 7, fill: C.blue },
  { name: 'Bajo', value: 3, fill: C.mute },
];

export const monthlyDefects = [
  { mes: 'Jun', encontrados: 8, resueltos: 6 },
  { mes: 'Jul', encontrados: 11, resueltos: 9 },
  { mes: 'Ago', encontrados: 13, resueltos: 10 },
  { mes: 'Sep', encontrados: 18, resueltos: 12 },
  { mes: 'Oct', encontrados: 17, resueltos: 13 },
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
    id: 'RUN-1064',
    project: 'Fenix',
    triggered: 'Carlos M.',
    startedAt: 'Hace 2m',
    progress: 50,
    total: 12,
    completed: 6,
    passed: 5,
    failed: 1,
    currentTest: 'Transferencias Cuentas Propias',
    eta: '1m 40s',
    status: 'running',
  },
  {
    id: 'RUN-1063',
    project: 'portal empresarial',
    triggered: 'Carlos M.',
    startedAt: 'Hace 4m',
    progress: 35,
    total: 8,
    completed: 3,
    passed: 3,
    failed: 0,
    currentTest: 'Registro varios clientes',
    eta: '1m 15s',
    status: 'running',
  },
  {
    id: 'RUN-1062',
    project: 'KIOSKO',
    triggered: 'María R.',
    startedAt: 'Hace 1m',
    progress: 20,
    total: 5,
    completed: 1,
    passed: 1,
    failed: 0,
    currentTest: 'Consulta de balance',
    eta: '1m 05s',
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
