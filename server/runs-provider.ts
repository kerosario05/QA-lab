import type { Story, StoryScenario } from '../src/services/scenarios/types';

export interface RunProviderConfig {
  baseUrl: string;
  endpointDiscovery: string;
  endpointPreview: string;
  timeoutMs: number;
}

export interface RunProviderResponse {
  ok: boolean;
  jobId?: string;
  status?: string;
  scenarioCount?: number;
  mode?: string;
  issueKey?: string;
  checklistUrl?: string;
  defectCount?: number;
  errorCode?: string;
  error?: string;
  message?: string;
}

export interface ActiveScenario {
  id: string;
  title: string;
  steps: string[];
  index: number;
  total: number;
  preconditions?: string[];
  expectedResult?: string | null;
  stepResults?: Array<{ status?: string; state?: string }>;
}

const activeScenariosByJob = new Map<string, ActiveScenario[]>();

function cleanScenarioText(value: string | null | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeActiveScenarios(stories: Story[]): ActiveScenario[] {
  const scenarios = stories.flatMap((story) => story.scenarios.map((scenario, index) => ({ story, scenario, index })));
  const total = scenarios.length;
  return scenarios.map(({ story, scenario, index }) => ({
    id: scenario.scenarioId || scenario.refs || `${story.jiraKey}-${index + 1}`,
    title: cleanScenarioText(scenario.title),
    preconditions: scenario.custom_preconds ? [cleanScenarioText(scenario.custom_preconds)] : [],
    steps: (scenario.custom_steps_separated ?? []).map((step) => cleanScenarioText(step.content)),
    expectedResult: scenario.custom_expected ? cleanScenarioText(scenario.custom_expected) : null,
    index: index + 1,
    total,
  }));
}

export function rememberActiveScenarios(jobId: string | undefined, stories: Story[]): void {
  if (!jobId) return;
  activeScenariosByJob.set(jobId, normalizeActiveScenarios(stories));
}

export function resolveActiveScenario(jobId: string, status: Record<string, unknown>): ActiveScenario | null {
  const scenarios = activeScenariosByJob.get(jobId) ?? [];
  if (scenarios.length === 0) return null;
  const current = String(status.currentCaseId ?? status.caseId ?? status.currentCase ?? status.currentTest ?? '').trim();
  if (!current) return null;
  const active = scenarios.find((scenario) => scenario.id === current)
    ?? scenarios.find((scenario) => scenario.title === current || current.includes(scenario.id));
  if (!active) return null;
  const stepResults = Array.isArray(status.stepResults) ? status.stepResults : undefined;
  return stepResults ? { ...active, stepResults: stepResults as ActiveScenario['stepResults'] } : active;
}

export interface DataContextEntry {
  key: string;
  value: string;
  source: string;
  sensitive: boolean;
}

export interface DiscoveryBatchRequestOptions {
  appSlug?: string;
  sectionName?: string;
  sectionSlug?: string;
  executePromotedSpecs?: boolean;
  forceRediscovery?: boolean;
  launchId?: string;
  testRunId?: number;
  jiraKey?: string;
  contextOnly?: boolean;
  runtimeEntriesByCase?: Record<string, DataContextEntry[]>;
  publishedCases?: Array<{
    scenarioId: string;
    caseId: number;
    title?: string;
    sourceType?: 'jira_preview' | 'testrail_case';
    sourceIssueKey?: string;
    launchScenarioId?: string;
    executionScenarioId?: string;
  }>;
}

function normalizeRuntimeEntriesByCase(
  entriesByCase: Record<string, DataContextEntry[]> | undefined,
): Record<string, DataContextEntry[]> | undefined {
  if (!entriesByCase || typeof entriesByCase !== 'object' || Array.isArray(entriesByCase)) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(entriesByCase)
      .map(([caseId, entries]) => [
        caseId,
        Array.isArray(entries)
          ? entries.filter((entry) => typeof entry?.key === 'string' && entry.key.trim() !== '' && typeof entry?.value === 'string' && entry.value.trim() !== '')
          : [],
      ])
      .filter(([, entries]) => entries.length > 0),
  ) as Record<string, DataContextEntry[]>;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export interface McpScenarioInput {
  scenarioId?: string;
  sourceIssueKey: string;
  title: string;
  steps: string[];
  preconditions: string[];
  expectedResult: string;
  type: string;
  database: string;
  isConverted: number;
  automationType: string;
  setupStrategy: string;
  appSlug: string;
  routeProfile: string;
  dataRequirements: string;
  nonExecutableCriteria: string;
  mcpExecutable: boolean;
  targetAppSlug?: string;
  targetAppName?: string;
  caseId?: number;
  validation?: { valid: boolean; errors: string[]; warnings: string[] };
  authIntent?: "gate_observation" | "full_authentication";
}

export function getRunProviderConfig(): RunProviderConfig {
  const baseUrl = process.env.RUN_PROVIDER_BASE_URL || process.env.SCENARIO_PREVIEW_BASE_URL || '';
  const endpointDiscovery = process.env.RUN_PROVIDER_ENDPOINT_DISCOVERY || '/api/runs/discovery-batch';
  const endpointPreview = process.env.RUN_PROVIDER_ENDPOINT_PREVIEW || '/api/runs/scenario-preview';
  const timeoutMs = parseInt(process.env.RUN_PROVIDER_TIMEOUT_MS || '180000', 10);
  return { baseUrl, endpointDiscovery, endpointPreview, timeoutMs };
}

function extractRouteProfileFromPreconditions(preconds: string | null): string | undefined {
  if (!preconds) return undefined;
  const match = preconds.match(/Route\s*Profile:\s*(\S+)/i);
  return match ? match[1] : undefined;
}

function storiesToMcpScenarios(stories: Story[], appSlug?: string): McpScenarioInput[] {
  const result: McpScenarioInput[] = [];
  for (const story of stories) {
    for (const sc of story.scenarios) {
      const legacyRouteProfile = typeof sc.routeProfile === 'string' ? sc.routeProfile : undefined;
      const routeProfile = legacyRouteProfile
        || extractRouteProfileFromPreconditions(sc.custom_preconds)
        || extractRouteProfileFromPreconditions(story.title)
        || '';
      result.push({
        scenarioId: sc.scenarioId,
        sourceIssueKey: sc.refs || story.jiraKey,
        title: sc.title,
        steps: sc.custom_steps_separated.map(
          step => step.content + (step.expected ? `\nEsperado:${step.expected}` : '')
        ),
        preconditions: sc.custom_preconds ? [sc.custom_preconds] : [],
        expectedResult: sc.custom_expected ?? '',
        type: 'functional',
        database: 'sqlserver',
        isConverted: 0,
        automationType: 'playwright',
        setupStrategy: 'basic',
        appSlug: appSlug || 'arquitectura-automatizacion',
        routeProfile,
        dataRequirements: '',
        nonExecutableCriteria: '',
        mcpExecutable: true,
        authIntent: sc.authIntent,
      });
    }
  }
  return result;
}

async function fetchProvider(url: string, body: unknown, timeoutMs: number): Promise<RunProviderResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawBody = await res.text();

    if (!rawBody.trim()) {
      return { ok: false, errorCode: 'RUN_PROVIDER_EMPTY_RESPONSE', error: 'Empty response from provider', message: `HTTP ${res.status}` };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, errorCode: 'RUN_PROVIDER_INVALID_RESPONSE', error: 'Invalid JSON from provider', message: `HTTP ${res.status}: not JSON` };
    }

    if (!res.ok) {
      const errorCode = parsed?.errorCode ?? parsed?.error ?? `PROVIDER_${res.status}`;
      const errorMsg = parsed?.message ?? parsed?.error ?? `Provider returned ${res.status}`;
      return { ok: false, errorCode, error: errorMsg, message: `HTTP ${res.status}` };
    }

    return {
      ok: true,
      jobId: parsed.jobId,
      status: parsed.status,
      scenarioCount: parsed.scenarioCount,
      mode: parsed.mode,
      issueKey: typeof parsed.issueKey === 'string' ? parsed.issueKey : undefined,
      checklistUrl: typeof parsed.checklistUrl === 'string' ? parsed.checklistUrl : undefined,
      defectCount: typeof parsed.defectCount === 'number' ? parsed.defectCount : undefined,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, errorCode: 'RUN_PROVIDER_TIMEOUT', error: 'Provider request timed out', message: `Timeout after ${timeoutMs}ms` };
    }
    return { ok: false, errorCode: 'RUN_PROVIDER_ERROR', error: 'Provider request failed', message: err?.message ?? 'Unknown error' };
  }
}

export async function requestDiscoveryBatch(
  caseIds: number[],
  sectionName?: string,
  testRailProjectName?: string,
  options?: DiscoveryBatchRequestOptions,
): Promise<RunProviderResponse> {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return { ok: false, errorCode: 'RUN_PROVIDER_NOT_CONFIGURED', error: 'Run provider base URL is not set' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${config.endpointDiscovery}`;
  const runtimeEntriesByCase = normalizeRuntimeEntriesByCase(options?.runtimeEntriesByCase);
  const body: Record<string, unknown> = {
    caseIds,
    appSlug: options?.appSlug || undefined,
    sectionName: options?.sectionName || sectionName || undefined,
    sectionSlug: options?.sectionSlug || undefined,
    ...(options?.forceRediscovery === true
      ? { contextOnly: false }
      : options?.contextOnly === true
        ? { contextOnly: true }
        : {}),
    forceRediscovery: options?.forceRediscovery === true,
    runtimeEntriesByCase,
    overwrite: true,
    autoPromote: true,
    autoPom: true,
    rerunActive: true,
  };

  if (options?.executePromotedSpecs === true) {
    body.executePromotedSpecs = true;
    body.launchId = options.launchId || undefined;
    body.testRunId = options.testRunId || undefined;
    body.jiraKey = options.jiraKey || undefined;
    body.publishedCases = options.publishedCases || undefined;
  }

  if (testRailProjectName) {
    body.testRailProjectName = testRailProjectName;
  }

  console.log(
    `[runs] provider request discovery-batch caseIds=${caseIds.length} executePromotedSpecs=${options?.executePromotedSpecs === true}`,
  );
  const result = await fetchProvider(url, body, config.timeoutMs);
  console.log(`[runs] provider response ok=${result.ok} jobId=${result.jobId ?? 'ΓÇö'} status=${result.status ?? 'ΓÇö'}`);
  return result;
}

export async function requestScenarioPreviewRun(
  stories: Story[],
  projectId?: number,
  suiteId?: number,
  sectionId?: number,
  testRailProjectName?: string,
  sectionName?: string,
  sectionSlug?: string,
  launchId?: string,
  testRunId?: number,
  publishedCases?: Array<{ scenarioId: string; caseId: number; title?: string }>,
  jiraKey?: string,
  appSlug?: string,
  routeProfile?: Record<string, unknown>,
): Promise<RunProviderResponse> {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return { ok: false, errorCode: 'RUN_PROVIDER_NOT_CONFIGURED', error: 'Run provider base URL is not set' };
  }

  const scenarios = storiesToMcpScenarios(stories, appSlug);
  if (scenarios.length === 0) {
    return { ok: false, errorCode: 'INVALID_RUN_REQUEST', error: 'No valid scenarios to run after conversion' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${config.endpointPreview}`;
  const body: Record<string, unknown> = {
    scenarios,
    appSlug: appSlug || 'arquitectura-automatizacion',
    routeProfile: routeProfile || undefined,
    testrailProjectId: (projectId && projectId > 0) ? projectId : undefined,
    testrailSuiteId: (suiteId && suiteId > 0) ? suiteId : undefined,
    testrailSectionId: (sectionId && sectionId > 0) ? sectionId : undefined,
    sectionName: sectionName || undefined,
    sectionSlug: sectionSlug || undefined,
    launchId: launchId || undefined,
    testRunId: testRunId || undefined,
    publishedCases: publishedCases || undefined,
    jiraKey: jiraKey || undefined,
    options: {
      overwrite: true,
      autoPromote: true,
      autoPom: true,
      rerunActive: true,
    },
  };

  if (testRailProjectName) {
    body.testRailProjectName = testRailProjectName;
  }

  console.log(`[launch-app-propagation] launchAppSlug=${appSlug ?? 'undefined'} runnerRequestedAppSlug=${body.appSlug} source=launch`);

  const scenarioIds = scenarios.map(sc => sc.scenarioId ?? '').filter(Boolean).join(",");
  const caseIds = (publishedCases ?? []).map(pc => pc.caseId).join(",");
  const publishedScenarioIds = (publishedCases ?? []).map(pc => pc.scenarioId).join(",");
  console.log(`[runs] provider request scenario-preview routeProfile presente=${Boolean(routeProfile)} stories=${stories.length} scenarios=${scenarios.length} launchId=${launchId ?? 'ΓÇö'} testRunId=${testRunId ?? 'ΓÇö'} publishedCases=${publishedCases?.length ?? 0} scenarioIds=${scenarioIds} publishedScenarioIds=${publishedScenarioIds} caseIds=${caseIds} jiraKey=${jiraKey ?? 'ΓÇö'}`);
  const result = await fetchProvider(url, body, config.timeoutMs);
  rememberActiveScenarios(result.jobId, stories);
  console.log(`[runs] provider response ok=${result.ok} jobId=${result.jobId ?? 'ΓÇö'} status=${result.status ?? 'ΓÇö'}`);
  return result;
}
