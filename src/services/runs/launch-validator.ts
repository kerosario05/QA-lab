import type { McpScenario } from '../scenarios/types';
import type { DiscoveryBatchPayload, ScenarioPreviewPayload } from '../runs';

export interface LaunchValidationResult {
  ok: boolean;
  error?: string;
  mode?: 'discovery-batch' | 'scenario-preview';
  payload?: DiscoveryBatchPayload | ScenarioPreviewPayload;
}

export interface LaunchSelection {
  selectedMcpScenarios: McpScenario[];
  selectedTrCaseIds: number[];
  defaultAppSlug?: string;
  functionalAppSlug?: string;
  sourceMode?: 'jira' | 'testrail' | 'both';
  targetAppName?: string;
  sectionName?: string;
  forceRediscovery?: boolean;
  routeProfile?: {
    name: string;
    entry: Array<{ businessLabel: string; visibleLabel: string }>;
    aliases?: Record<string, string>;
    intermediates?: Record<string, string[]>;
    domainTerms?: Record<string, string>;
    visibleControls?: string[];
    representativeFixture?: Record<string, string>;
    notes?: string[];
  };
  source?: {
    projectKey: string;
    sprintId?: number;
    status?: string;
  };
}

export interface ScenarioPreviewLaunchMeta {
  testrailProjectId?: number;
  testrailSuiteId?: number;
  testrailSectionId?: number;
  publishToTestRail?: boolean;
  createTestRun?: boolean;
  reportResults?: boolean;
}

function hasRealCaseId(scenario: McpScenario): boolean {
  return !!(scenario.caseId && Number.isInteger(scenario.caseId) && scenario.caseId > 0);
}

const TECHNICAL_APP_SLUGS = new Set(['tests', 'test', 'api-tests', 'api tests', 'qa-tests', 'qa tests', 'unknown', 'default', 'undefined', 'null']);

function normalizeSlug(value?: string): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function isExecutableAppSlug(value?: string): boolean {
  const normalized = normalizeSlug(value);
  return !!normalized && !TECHNICAL_APP_SLUGS.has(normalized);
}

function resolveFunctionalAppSlug(selection: LaunchSelection, validMcpScenarios: McpScenario[]): string | undefined {
  const candidates = [
    selection.functionalAppSlug,
    ...validMcpScenarios.map((scenario) => scenario.targetAppSlug),
    selection.defaultAppSlug,
  ];
  for (const candidate of candidates) {
    if (isExecutableAppSlug(candidate)) return candidate!.trim();
  }
  return undefined;
}

/**
 * Validates and builds the appropriate payload based on selected scenarios.
 * 
 * Mode detection:
 * - If all selected have caseId -> discovery-batch
 * - If none have caseId -> scenario-preview
 * - If mixed -> block (for this phase)
 */
export function validateAndBuildLaunchPayload(selection: LaunchSelection): LaunchValidationResult {
  const { selectedMcpScenarios, selectedTrCaseIds, defaultAppSlug, functionalAppSlug, targetAppName, sectionName, routeProfile, source } = selection;

  // Selection is not execution authority. Preserve selected adaptive scenarios
  // so the backend can classify them with their structured readiness fields.
  const validMcpScenarios = selectedMcpScenarios.filter(
    (s) => s.validation?.valid !== false
  );

  const scenariosWithCaseId = validMcpScenarios.filter(hasRealCaseId);
  const scenariosWithoutCaseId = validMcpScenarios.filter((s) => !hasRealCaseId(s));

  const hasTrCases = selectedTrCaseIds.length > 0;
  const hasMcpWithCaseId = scenariosWithCaseId.length > 0;
  const hasMcpWithoutCaseId = scenariosWithoutCaseId.length > 0;

  if (hasTrCases && hasMcpWithoutCaseId) {
    return {
      ok: false,
      error: 'No mezcles casos TestRail con escenarios preview. Ejecuta uno de los dos grupos.',
    };
  }

  if (hasMcpWithCaseId && hasMcpWithoutCaseId) {
    return {
      ok: false,
      error: 'No mezcles casos TestRail con escenarios preview. Ejecuta uno de los dos grupos.',
    };
  }

  if (hasTrCases || hasMcpWithCaseId) {
    const mcpCaseIds = scenariosWithCaseId.map((s) => s.caseId!);
    const allCaseIds = [...new Set([...mcpCaseIds, ...selectedTrCaseIds])];

    if (allCaseIds.length === 0) {
      return {
        ok: false,
        error: 'No hay casos de TestRail seleccionados para ejecutar.',
      };
    }

    const resolvedAppSlug =
      resolveFunctionalAppSlug({ ...selection, defaultAppSlug, functionalAppSlug }, validMcpScenarios) ??
      defaultAppSlug ??
      'arquitectura-automatizacion';

    const payload: DiscoveryBatchPayload = {
      caseIds: allCaseIds,
      appSlug: resolvedAppSlug,
      sectionName,
      overwrite: true,
      autoPromote: true,
      autoPom: true,
      rerunActive: true,
      forceRediscovery: selection.forceRediscovery === true,
      contextOnly: false,
    };

    return { ok: true, mode: 'discovery-batch', payload };
  }

  if (hasMcpWithoutCaseId) {
    const targetAppSlug = resolveFunctionalAppSlug({ ...selection, defaultAppSlug, functionalAppSlug }, validMcpScenarios);
    if (!targetAppSlug) {
      return { ok: false, error: 'No se encontró un appSlug funcional válido para ejecutar scenario-preview.' };
    }

    const payload: ScenarioPreviewPayload = {
      appSlug: targetAppSlug,
      targetAppSlug,
      targetAppName,
      sectionName,
      routeProfile,
      source,
      scenarios: validMcpScenarios.map((s) => ({
        sourceIssueKey: s.sourceIssueKey,
        title: s.title,
        steps: s.steps,
        preconditions: s.preconditions,
        expectedResult: s.expectedResult,
        type: s.type,
        database: s.database,
        isConverted: s.isConverted,
        automationType: s.automationType,
        launchClassification: s.launchClassification,
        setupStrategy: s.setupStrategy,
        appSlug: s.targetAppSlug ?? s.appSlug,
        targetAppSlug: s.targetAppSlug,
        targetAppName: s.targetAppName,
        routeProfile: s.routeProfile,
        dataRequirements: s.dataRequirements,
        nonExecutableCriteria: s.nonExecutableCriteria,
        mcpExecutable: s.mcpExecutable,
        executionReadiness: s.executionReadiness,
         semanticValidity: s.semanticValidity,
         validation: s.validation,
         publicationClassification: s.publicationClassification,
         nonAutomatable: s.nonAutomatable,
         metadata: s.metadata,
         targetScreen: s.targetScreen,
         actualChain: s.actualChain,
         requiredChain: s.requiredChain,
         caseId: s.caseId,
      })),
      options: {
        overwrite: true,
        autoPromote: true,
        autoPom: true,
        rerunActive: true,
        forceRediscovery: selection.forceRediscovery === true,
        contextOnly: false,
      },
    };

    return { ok: true, mode: 'scenario-preview', payload };
  }

  return {
    ok: false,
    error: 'No hay escenarios ni casos seleccionados para ejecutar.',
  };
}

export function buildScenarioPreviewLaunchMeta(input: {
  sourceMode?: LaunchSelection['sourceMode'];
  selectedProjectId?: number;
  selectedSectionId?: number;
  selectedSuiteId?: number;
}): ScenarioPreviewLaunchMeta {
  const hasTestRailSource = input.sourceMode === 'testrail' || input.sourceMode === 'both';
  if (!hasTestRailSource || !input.selectedProjectId || !input.selectedSectionId || !input.selectedSuiteId || !input.sourceMode) {
    return {};
  }
  return {
    testrailProjectId: input.selectedProjectId,
    testrailSuiteId: input.selectedSuiteId,
    testrailSectionId: input.selectedSectionId,
    publishToTestRail: true,
    createTestRun: true,
    reportResults: true,
  };
}

export function findScenariosWithoutCaseId(scenarios: McpScenario[]): string[] {
  const missing: string[] = [];
  for (const sc of scenarios) {
    if (!sc.caseId || !Number.isInteger(sc.caseId) || sc.caseId <= 0) {
      missing.push(sc.sourceIssueKey);
    }
  }
  return missing;
}

export function formatMissingCaseIdError(missingKeys: string[]): string {
  if (missingKeys.length === 0) return '';
  return (
    `Estos escenarios aún no existen en TestRail. ` +
    `Primero crea los casos en TestRail antes de lanzar la automatización. ` +
    `(${missingKeys.length} escenario(s): ${missingKeys.slice(0, 3).join(', ')}${missingKeys.length > 3 ? '...' : ''})`
  );
}

export function detectLaunchMode(selection: LaunchSelection): 'discovery-batch' | 'scenario-preview' | 'none' | 'mixed' {
  const { selectedMcpScenarios, selectedTrCaseIds } = selection;

  const validMcpScenarios = selectedMcpScenarios.filter(
    (s) => s.validation?.valid !== false
  );

  const hasTrCases = selectedTrCaseIds.length > 0;
  const hasMcpWithCaseId = validMcpScenarios.some(hasRealCaseId);
  const hasMcpWithoutCaseId = validMcpScenarios.some((s) => !hasRealCaseId(s));

  if (hasTrCases && hasMcpWithoutCaseId) return 'mixed';
  if (hasMcpWithCaseId && hasMcpWithoutCaseId) return 'mixed';
  if (hasTrCases || hasMcpWithCaseId) return 'discovery-batch';
  if (hasMcpWithoutCaseId) return 'scenario-preview';
  return 'none';
}
