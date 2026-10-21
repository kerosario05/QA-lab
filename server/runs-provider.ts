import { engineHeaders } from './engine-auth';
import type { Story } from '../src/services/scenarios/types';

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

export interface ActiveScenarioInput {
  id: string;
  title: string;
  steps: string[];
  preconditions?: string[];
  expectedResult?: string | null;
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

export function rememberActiveScenariosWithCases(
  jobId: string | undefined,
  stories: Story[],
  caseScenarios: ActiveScenarioInput[] = [],
): void {
  if (!jobId) return;
  const jiraScenarios = normalizeActiveScenarios(stories);
  const normalizedCases = caseScenarios
    .filter((scenario) => typeof scenario.id === 'string' && scenario.id.trim() && typeof scenario.title === 'string' && scenario.title.trim())
    .map((scenario, index) => ({
      id: scenario.id.trim(),
      title: cleanScenarioText(scenario.title),
      steps: Array.isArray(scenario.steps) ? scenario.steps.map(cleanScenarioText).filter(Boolean) : [],
      preconditions: Array.isArray(scenario.preconditions) ? scenario.preconditions.map(cleanScenarioText).filter(Boolean) : [],
      expectedResult: scenario.expectedResult ? cleanScenarioText(scenario.expectedResult) : null,
      index: index + 1,
      total: caseScenarios.length,
    }));
  const all = [...jiraScenarios, ...normalizedCases];
  activeScenariosByJob.set(jobId, all.map((scenario, index) => ({ ...scenario, index: index + 1, total: all.length })));
}

/** Carry presentation-only scenario metadata to the new job created by a rerun. */
export function copyActiveScenariosToRerun(sourceJobId: string, rerunJobId: string): boolean {
  if (!sourceJobId || !rerunJobId || sourceJobId === rerunJobId) return false;
  const scenarios = activeScenariosByJob.get(sourceJobId);
  if (!scenarios?.length) return false;
  activeScenariosByJob.set(rerunJobId, scenarios.map((scenario) => ({
    ...scenario,
    steps: [...scenario.steps],
    preconditions: scenario.preconditions ? [...scenario.preconditions] : undefined,
    stepResults: scenario.stepResults?.map((step) => ({ ...step })),
  })));
  return true;
}

function normalizeScenarioId(value: string): string {
  return value.trim().replace(/^C(?=\d+$)/i, '');
}

export function resolveActiveScenario(jobId: string, status: Record<string, unknown>): ActiveScenario | null {
  const scenarios = activeScenariosByJob.get(jobId) ?? [];
  if (scenarios.length === 0) return null;
  const current = String(status.currentCaseId ?? status.caseId ?? status.currentCase ?? status.currentTest ?? '').trim();
  if (!current) return null;
  const active = scenarios.find((scenario) => scenario.id === current)
    ?? scenarios.find((scenario) => normalizeScenarioId(scenario.id) === normalizeScenarioId(current))
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
  jiraSemantic?: { stories: Story[]; executionEngine: unknown; scenarioOrigin?: unknown; dataOverrides?: unknown };
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
  inputRequirements?: Story['scenarios'][number]['inputRequirements'];
  unresolvedUiRequirements?: Story['scenarios'][number]['unresolvedUiRequirements'];
  conditionRequirements?: Story['scenarios'][number]['conditionRequirements'];
  reviewConfiguration?: Story['scenarios'][number]['reviewConfiguration'];
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

function storiesToMcpScenarios(stories: Story[], appSlug?: string, jiraSemantic = false): McpScenarioInput[] {
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
        ...(jiraSemantic ? {inputRequirements:sc.inputRequirements,unresolvedUiRequirements:sc.unresolvedUiRequirements,conditionRequirements:sc.conditionRequirements,reviewConfiguration:sc.reviewConfiguration} : {}),
      });
    }
  }
  return result;
}

/** Safe transport telemetry: counts only; never logs runtime values or field names. */
export function countScenarioDataOverrides(value: unknown): { scenarios: number; fields: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { scenarios: 0, fields: 0 };
  const entries = Object.entries(value as Record<string, unknown>).map(([scenario, fields]) => [
    scenario,
    fields && typeof fields === 'object' && !Array.isArray(fields)
      ? Object.values(fields as Record<string, unknown>).filter(field => typeof field === 'string' && field.trim().length > 0).length
      : 0,
  ] as const);
  return { scenarios: entries.filter(([, count]) => count > 0).length,
    fields: entries.reduce((total, [, count]) => total + count, 0) };
}

async function fetchProvider(url: string, body: unknown, timeoutMs: number): Promise<RunProviderResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...engineHeaders() },
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

    const jira = options.jiraSemantic;
    if (jira?.executionEngine === 'jira_semantic') {
      // Fail closed: each published Jira case must map to exactly one converted scenario, and vice versa.
      const converted = storiesToMcpScenarios(jira.stories, options.appSlug, true);
      const caseIdByScenario = new Map<McpScenarioInput, number>();
      let invalidCases = 0;
      for (const pc of options.publishedCases ?? []) {
        if (pc.sourceType !== 'jira_preview') continue;
        const ids = new Set([pc.launchScenarioId, pc.executionScenarioId, pc.scenarioId].filter(Boolean));
        const matches = converted.filter(sc => sc.scenarioId && ids.has(sc.scenarioId));
        if (matches.length !== 1 || caseIdByScenario.has(matches[0])) { invalidCases++; continue; }
        caseIdByScenario.set(matches[0], pc.caseId);
      }
      if (invalidCases > 0) {
        console.log(`[runs] error code=JIRA_SEMANTIC_SCENARIO_UNMATCHED unmatchedOrAmbiguousCases=${invalidCases}`);
        return {
          ok: false,
          errorCode: 'JIRA_SEMANTIC_SCENARIO_UNMATCHED',
          error: 'Published Jira case has no unique matching Jira semantic scenario',
          message: `unmatchedOrAmbiguousCases=${invalidCases}`,
        };
      }
      const jiraSemanticScenarios = [...caseIdByScenario].map(([sc, caseId]) => ({ ...sc, caseId }));
      body.executionEngine = 'jira_semantic';
      body.scenarioOrigin = jira.scenarioOrigin;
      body.dataOverrides = jira.dataOverrides;
      body.jiraSemanticScenarios = jiraSemanticScenarios;
      const counts = countScenarioDataOverrides(jira.dataOverrides);
      console.log(`[runs] jira semantic forwarded on discovery-batch scenarios=${jiraSemanticScenarios.length} overrideScenarios=${counts.scenarios} fields=${counts.fields}`);
    }
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
  execution?: { executionEngine?: unknown; scenarioOrigin?: unknown; dataOverrides?: unknown },
): Promise<RunProviderResponse> {
  const config = getRunProviderConfig();
  if (!config.baseUrl) {
    return { ok: false, errorCode: 'RUN_PROVIDER_NOT_CONFIGURED', error: 'Run provider base URL is not set' };
  }

  const scenarios = storiesToMcpScenarios(stories, appSlug, execution?.executionEngine === 'jira_semantic');
  if (scenarios.length === 0) {
    return { ok: false, errorCode: 'INVALID_RUN_REQUEST', error: 'No valid scenarios to run after conversion' };
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${config.endpointPreview}`;
  const body: Record<string, unknown> = {
    ...(execution ?? {}),
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
  const scenarioOrigin = execution?.scenarioOrigin && typeof execution.scenarioOrigin === 'object'
    ? execution.scenarioOrigin as { kind?: unknown; jiraKey?: unknown }
    : undefined;
  const overrideCounts = countScenarioDataOverrides(execution?.dataOverrides);
  console.log(`[runs] jira runtime data forwarded scenarios=${overrideCounts.scenarios} fields=${overrideCounts.fields}`);
  console.log(`[runs] provider request scenario-preview engine=${String(execution?.executionEngine ?? 'legacy')} origin=${String(scenarioOrigin?.kind ?? 'none')} originJiraKey=${String(scenarioOrigin?.jiraKey ?? '—')} routeProfile presente=${Boolean(routeProfile)} stories=${stories.length} scenarios=${scenarios.length} launchId=${launchId ?? 'ΓÇö'} testRunId=${testRunId ?? 'ΓÇö'} publishedCases=${publishedCases?.length ?? 0} scenarioIds=${scenarioIds} publishedScenarioIds=${publishedScenarioIds} caseIds=${caseIds} jiraKey=${jiraKey ?? 'ΓÇö'}`);
  const result = await fetchProvider(url, body, config.timeoutMs);
  rememberActiveScenarios(result.jobId, stories);
  console.log(`[runs] provider response ok=${result.ok} jobId=${result.jobId ?? 'ΓÇö'} status=${result.status ?? 'ΓÇö'}`);
  return result;
}
