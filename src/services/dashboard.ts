import type { ActiveRun } from '../types';

export interface DashboardProject {
  id: string;
  slug: string;
  name: string;
  projectType: number;
  status: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardExecution {
  launchId: string;
  createdAt: string;
  completedAt?: string;
  status: string;
  appSlug: string;
  scenarioCount: number;
  passed: number;
  failed: number;
  huKey?: string;
  huTitle?: string;
}

export interface DashboardData {
  projects: DashboardProject[];
  executions: DashboardExecution[];
  activeRuns: ActiveRun[];
  activeRunsAvailable: boolean;
  loadedAt: string;
}

interface JobRecord {
  id: string;
  type: string;
  status: string;
  params?: Record<string, unknown>;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: Record<string, unknown>;
  currentCase?: string | null;
  currentCaseTitle?: string | null;
}

type ActiveScenario = NonNullable<ActiveRun['activeScenarios']>[number];

function displayScenarioStep(value: unknown): string {
  if (typeof value !== 'string') return '';
  const step = value.trim();
  if (!step) return '';
  // Jobs created from recordings can carry the resolved input in params. The
  // dashboard only needs the authored action, so keep the field label while
  // masking values that are typed into controls.
  return step.replace(/^(\s*(?:Ingresar|Escribir|Completar)\s+")[^"]*("\s+en\s+")/i, '$1[REDACTED]$2');
}

export function buildActiveScenariosFromJobParams(
  params: Record<string, unknown>,
): NonNullable<ActiveRun['activeScenarios']> {
  const rawScenarios = Array.isArray(params.activeScenarios)
    ? params.activeScenarios
    : Array.isArray(params.scenarios) ? params.scenarios : [];
  const candidates = rawScenarios.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))).flatMap((scenario) => {
    const title = typeof scenario.title === 'string' ? scenario.title.trim() : '';
    const steps = Array.isArray(scenario.steps)
      ? scenario.steps.map(displayScenarioStep).filter(Boolean)
      : Array.isArray(scenario.testRailSteps)
        ? scenario.testRailSteps.flatMap((step) => displayScenarioStep(typeof step === 'string' ? step : (step as Record<string, unknown>)?.content)).filter(Boolean)
        : [];
    if (!title || !steps.length) return [];
    return [{ scenario, title, steps }];
  });
  const total = candidates.length;
  return candidates.map(({ scenario, title, steps }, offset): ActiveScenario => {
    const id = [scenario.id, scenario.scenarioId, scenario.recordedScenarioId, scenario.sourceIssueKey]
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      ?.trim() ?? `scenario-${offset + 1}`;
    return { id, title, index: offset + 1, total, steps };
  });
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizedSlug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function projectForSlug(projects: DashboardProject[], slug: unknown): DashboardProject | undefined {
  if (typeof slug !== 'string' || !slug.trim()) return undefined;
  const key = normalizedSlug(slug);
  return projects.find((project) => normalizedSlug(project.slug) === key);
}

function formatAge(isoDate: string | undefined): string {
  if (!isoDate) return '—';
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function normalizeActiveJob(job: JobRecord, project: DashboardProject): ActiveRun {
  const summary = job.summary ?? {};
  const params = job.params ?? {};
  const passed = asNumber(summary.passed);
  const failed = asNumber(summary.failed);
  const total = asNumber(summary.totalCases ?? summary.scenarioCount ?? params.scenarioCount) || passed + failed;
  const completed = asNumber(summary.completed ?? summary.executed) || passed + failed;
  const progress = summary.progressPercent == null
    ? (total > 0 ? Math.round((completed / total) * 100) : 0)
    : Math.min(100, asNumber(summary.progressPercent));
  return {
    id: job.id,
    jobId: job.id,
    project: project.name,
    triggered: 'QA Lab',
    startedAt: formatAge(job.startedAt ?? job.createdAt),
    progress,
    total,
    completed,
    passed,
    failed,
    currentTest: job.currentCaseTitle || job.currentCase || job.type,
    eta: '—',
    status: job.status,
    activeScenarios: buildActiveScenariosFromJobParams(params),
  };
}

function terminalJobToExecution(job: JobRecord, projects: DashboardProject[]): DashboardExecution | null {
  if (job.status === 'queued' || job.status === 'running' || !job.createdAt) return null;
  if (!['discovery-batch', 'scenario-preview', 'sprint', 'mobile-test-run', 'mobile-launch-execution'].includes(job.type)) return null;

  const params = job.params ?? {};
  const projectSlug = params.appSlug ?? params.projectSlug;
  const project = projectForSlug(projects, projectSlug);
  if (!project) return null;

  const summary = job.summary ?? {};
  const passed = asNumber(summary.passed);
  const failed = asNumber(summary.failed);
  const scenarioCount = asNumber(
    summary.totalCases ?? summary.scenarioCount ?? params.scenarioCount ?? passed + failed,
  );
  const title = [job.currentCaseTitle, params.huTitle, params.scenarioTitle, params.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const typeTitles: Record<string, string> = {
    'discovery-batch': 'Descubrimiento de casos',
    'scenario-preview': 'Ejecución de escenarios',
    sprint: 'Ejecución de sprint',
    'mobile-test-run': 'Ejecución móvil',
    'mobile-launch-execution': 'Ejecución móvil',
  };
  const launchId = typeof params.launchId === 'string' ? params.launchId : job.id;

  return {
    launchId,
    createdAt: job.completedAt ?? job.createdAt,
    completedAt: job.completedAt,
    status: job.status,
    appSlug: project.slug,
    scenarioCount,
    passed,
    failed,
    huKey: undefined,
    huTitle: title ?? typeTitles[job.type] ?? 'Ejecución',
  };
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [projectsResponse, executionsResponse, jobsResult] = await Promise.all([
    getJson<{ projects?: DashboardProject[] }>('/api/projects'),
    getJson<{ executions?: Array<Partial<DashboardExecution>> }>('/api/executions'),
    getJson<{ jobs?: JobRecord[] }>('/api/runs').then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: { jobs: [] } })),
  ]);
  const projects = (projectsResponse.projects ?? []).filter((project) => project.enabled);
  const projectByKey = new Map(projects.map((project) => [normalizedSlug(project.slug), project]));
  const executions = (executionsResponse.executions ?? []).flatMap((raw) => {
    const project = projectForSlug(projects, raw.appSlug);
    if (!project || typeof raw.launchId !== 'string' || typeof raw.createdAt !== 'string') return [];
    return [{
      launchId: raw.launchId,
      createdAt: raw.createdAt,
      completedAt: raw.completedAt,
      status: raw.status ?? 'unknown',
      appSlug: project.slug,
      scenarioCount: asNumber(raw.scenarioCount),
      passed: asNumber(raw.passed),
      failed: asNumber(raw.failed),
      huKey: raw.huKey,
      huTitle: raw.huTitle,
    } satisfies DashboardExecution];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeRuns = (jobsResult.value.jobs ?? [])
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .flatMap((job) => {
      const params = job.params ?? {};
      const projectSlug = params.appSlug ?? params.projectSlug;
      const project = typeof projectSlug === 'string' ? projectByKey.get(normalizedSlug(projectSlug)) : undefined;
      return project ? [normalizeActiveJob(job, project)] : [];
    });
  const byLaunchId = new Map<string, DashboardExecution>(executions.map((execution) => [execution.launchId, execution]));
  for (const job of jobsResult.value.jobs ?? []) {
    const execution = terminalJobToExecution(job, projects);
    if (!execution) continue;
    const existing = byLaunchId.get(execution.launchId);
    if (!existing) {
      byLaunchId.set(execution.launchId, execution);
      continue;
    }
    // Preserve TestRail metadata while taking the richer terminal job result/title.
    byLaunchId.set(execution.launchId, {
      ...existing,
      ...execution,
      huKey: existing.huKey ?? execution.huKey,
      huTitle: execution.huTitle ?? existing.huTitle,
    });
  }
  const allExecutions = [...byLaunchId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Execution details and evidence are loaded when the user opens a run.

  return { projects, executions: allExecutions, activeRuns, activeRunsAvailable: jobsResult.ok, loadedAt: new Date().toISOString() };
}

export function lastThirtyDays(now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from, to };
}
