import { describe, it, expect } from 'vitest';
import {
  validateAndBuildLaunchPayload,
  findScenariosWithoutCaseId,
  formatMissingCaseIdError,
  detectLaunchMode,
  buildScenarioPreviewLaunchMeta,
  type LaunchSelection,
} from './launch-validator';
import type { McpScenario } from '../scenarios/types';

function makeMcpScenario(overrides: Partial<McpScenario> = {}): McpScenario {
  return {
    sourceIssueKey: overrides.sourceIssueKey ?? 'PROJ-1',
    title: overrides.title ?? 'Test scenario',
    steps: overrides.steps ?? ['Step 1'],
    preconditions: overrides.preconditions ?? [],
    expectedResult: overrides.expectedResult ?? 'Result',
    type: overrides.type ?? 'functional',
    database: overrides.database ?? '',
    isConverted: overrides.isConverted ?? 0,
    automationType: overrides.automationType ?? 'e2e',
    setupStrategy: overrides.setupStrategy ?? 'default',
    appSlug: overrides.appSlug ?? 'test-app',
    targetAppSlug: overrides.targetAppSlug,
    targetAppName: overrides.targetAppName,
    routeProfile: overrides.routeProfile ?? '',
    dataRequirements: overrides.dataRequirements ?? '',
    nonExecutableCriteria: overrides.nonExecutableCriteria ?? '',
    mcpExecutable: overrides.mcpExecutable ?? true,
    validation: overrides.validation ?? { valid: true, errors: [], warnings: [] },
    caseId: overrides.caseId,
  };
}

describe('validateAndBuildLaunchPayload', () => {
  it('blocks if mixed preview + TestRail caseIds', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 38133 }),
      ],
      selectedTrCaseIds: [],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No mezcles');
  });

  it('blocks if mixed preview + selected Tr cases', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [38200],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No mezcles');
  });

  it('scenario-preview mode when no caseId', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
      targetAppName: 'KIOSKO',
      sectionName: 'Detalle_KIOSKO',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    expect(result.payload).toBeDefined();
    if (result.payload && 'scenarios' in result.payload) {
      expect(result.payload.scenarios).toHaveLength(2);
      expect(result.payload.appSlug).toBe('kiosko');
      expect(result.payload.targetAppName).toBe('KIOSKO');
      expect(result.payload.sectionName).toBe('Detalle_KIOSKO');
    }
  });

  it('discovery-batch mode when all have caseId', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: 38133 }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 38134 }),
      ],
      selectedTrCaseIds: [],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('discovery-batch');
    if (result.payload && 'caseIds' in result.payload) {
      expect(result.payload.caseIds).toContain(38133);
      expect(result.payload.caseIds).toContain(38134);
    }
  });

  it('discovery-batch mode when Tr cases selected', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [],
      selectedTrCaseIds: [38200, 38201],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('discovery-batch');
    if (result.payload && 'caseIds' in result.payload) {
      expect(result.payload.caseIds).toContain(38200);
      expect(result.payload.caseIds).toContain(38201);
    }
  });

  it('combines MCP caseIds with Tr caseIds in discovery-batch', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: 38133 }),
      ],
      selectedTrCaseIds: [38200, 38201],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('discovery-batch');
    if (result.payload && 'caseIds' in result.payload) {
      expect(result.payload.caseIds).toContain(38133);
      expect(result.payload.caseIds).toContain(38200);
      expect(result.payload.caseIds).toContain(38201);
    }
  });

  it('deduplicates IDs in discovery-batch', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: 38133 }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 38133 }),
      ],
      selectedTrCaseIds: [38133, 38200],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    if (result.payload && 'caseIds' in result.payload) {
      const caseIds = result.payload.caseIds;
      expect(caseIds.filter((id) => id === 38133)).toHaveLength(1);
      expect(caseIds).toContain(38200);
    }
  });

  it('does not include rejected/invalid', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({
          sourceIssueKey: 'PROJ-1',
          caseId: undefined,
          validation: { valid: false, errors: ['Invalid'], warnings: [] },
        }),
        makeMcpScenario({
          sourceIssueKey: 'PROJ-2',
          caseId: undefined,
          validation: { valid: true, errors: [], warnings: [] },
        }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'scenarios' in result.payload) {
      expect(result.payload.scenarios).toHaveLength(1);
      expect(result.payload.scenarios[0].sourceIssueKey).toBe('PROJ-2');
    }
  });

  it('does not include mcpExecutable=false', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined, mcpExecutable: false }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: undefined, mcpExecutable: true }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'scenarios' in result.payload) {
      expect(result.payload.scenarios).toHaveLength(1);
      expect(result.payload.scenarios[0].sourceIssueKey).toBe('PROJ-2');
    }
  });

  it('uses targetAppSlug functional for appSlug in preview payload', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({
          sourceIssueKey: 'PROJ-1',
          caseId: undefined,
          targetAppSlug: 'kiosko',
        }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'appSlug' in result.payload) {
      expect(result.payload.appSlug).toBe('kiosko');
    }
    if (result.payload && 'targetAppSlug' in result.payload) {
      expect(result.payload.targetAppSlug).toBe('kiosko');
    }
  });

  it('prefers functionalAppSlug over technical defaults', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
      defaultAppSlug: 'tests',
      functionalAppSlug: 'kiosko',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    if (result.payload && 'appSlug' in result.payload) {
      expect(result.payload.appSlug).toBe('kiosko');
    }
  });

  it('fails when only technical appSlug is available', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined, targetAppSlug: 'tests' }),
      ],
      selectedTrCaseIds: [],
      defaultAppSlug: 'tests',
      functionalAppSlug: 'tests',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('appSlug funcional válido');
  });

  it('fails when only technical defaultAppSlug is present', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
      defaultAppSlug: 'tests',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('appSlug funcional válido');
  });

  it('preview payload includes routeProfile', () => {
    const routeProfile = {
      name: 'informacion_productos',
      entry: [
        { businessLabel: 'iniciar', visibleLabel: 'Iniciar' },
        { businessLabel: 'informacion_productos', visibleLabel: 'Información de productos' },
      ],
    };
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
      routeProfile,
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'routeProfile' in result.payload) {
      expect(result.payload.routeProfile).toEqual(routeProfile);
    }
  });

  it('preview payload includes source metadata', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'AA-81', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
      source: {
        projectKey: 'AA',
        sprintId: 6003,
        status: 'Desestimado',
      },
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'source' in result.payload) {
      expect(result.payload.source?.projectKey).toBe('AA');
      expect(result.payload.source?.sprintId).toBe(6003);
    }
  });

  it('buildScenarioPreviewLaunchMeta only enables TestRail sync when source is TestRail or combined and ids exist', () => {
    expect(buildScenarioPreviewLaunchMeta({
      sourceMode: 'jira',
      selectedProjectId: 56,
      selectedSuiteId: 1731,
      selectedSectionId: 4903,
    })).toEqual({});

    expect(buildScenarioPreviewLaunchMeta({
      sourceMode: 'both',
      selectedProjectId: 56,
      selectedSuiteId: 1731,
      selectedSectionId: 4903,
    })).toEqual({
      testrailProjectId: 56,
      testrailSuiteId: 1731,
      testrailSectionId: 4903,
      publishToTestRail: true,
      createTestRun: true,
      reportResults: true,
    });
  });

  it('preview payload includes selected scenarios completos', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({
          sourceIssueKey: 'AA-81',
          caseId: undefined,
          title: 'Visualizar categorías',
          steps: ['1. Clic en "Iniciar".', '2. Clic en "Información de productos".'],
          preconditions: ['1. BASE_URL configurado.'],
          expectedResult: 'El cliente visualiza las categorías.',
          automationType: 'ui_discovery',
          setupStrategy: 'no_login',
          appSlug: 'kiosko',
          routeProfile: 'informacion_productos',
        }),
      ],
      selectedTrCaseIds: [],
      functionalAppSlug: 'kiosko',
      sourceMode: 'jira',
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('scenario-preview');
    if (result.payload && 'scenarios' in result.payload) {
      const sc = result.payload.scenarios[0];
      expect(sc.sourceIssueKey).toBe('AA-81');
      expect(sc.title).toBe('Visualizar categorías');
      expect(sc.steps).toHaveLength(2);
      expect(sc.preconditions).toHaveLength(1);
      expect(sc.expectedResult).toBe('El cliente visualiza las categorías.');
      expect(sc.mcpExecutable).toBe(true);
    }
  });

  it('error when no scenarios or cases selected', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [],
      selectedTrCaseIds: [],
    };

    const result = validateAndBuildLaunchPayload(selection);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No hay escenarios');
  });
});

describe('detectLaunchMode', () => {
  it('returns scenario-preview when no caseId', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [],
    };
    expect(detectLaunchMode(selection)).toBe('scenario-preview');
  });

  it('returns discovery-batch when all have caseId', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: 38133 }),
      ],
      selectedTrCaseIds: [],
    };
    expect(detectLaunchMode(selection)).toBe('discovery-batch');
  });

  it('returns discovery-batch when Tr cases selected', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [],
      selectedTrCaseIds: [38200],
    };
    expect(detectLaunchMode(selection)).toBe('discovery-batch');
  });

  it('returns mixed when preview + caseId mixed', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
        makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 38133 }),
      ],
      selectedTrCaseIds: [],
    };
    expect(detectLaunchMode(selection)).toBe('mixed');
  });

  it('returns mixed when preview + Tr cases', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [
        makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      ],
      selectedTrCaseIds: [38200],
    };
    expect(detectLaunchMode(selection)).toBe('mixed');
  });

  it('returns none when nothing selected', () => {
    const selection: LaunchSelection = {
      selectedMcpScenarios: [],
      selectedTrCaseIds: [],
    };
    expect(detectLaunchMode(selection)).toBe('none');
  });
});

describe('findScenariosWithoutCaseId', () => {
  it('returns empty array when all scenarios have caseId', () => {
    const scenarios = [
      makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: 100 }),
      makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 200 }),
    ];
    expect(findScenariosWithoutCaseId(scenarios)).toEqual([]);
  });

  it('returns keys for scenarios without caseId', () => {
    const scenarios = [
      makeMcpScenario({ sourceIssueKey: 'PROJ-1', caseId: undefined }),
      makeMcpScenario({ sourceIssueKey: 'PROJ-2', caseId: 200 }),
      makeMcpScenario({ sourceIssueKey: 'PROJ-3', caseId: undefined }),
    ];
    const missing = findScenariosWithoutCaseId(scenarios);
    expect(missing).toContain('PROJ-1');
    expect(missing).toContain('PROJ-3');
    expect(missing).toHaveLength(2);
  });
});

describe('formatMissingCaseIdError', () => {
  it('returns empty string for no missing keys', () => {
    expect(formatMissingCaseIdError([])).toBe('');
  });

  it('includes clear message about creating TestRail cases', () => {
    const msg = formatMissingCaseIdError(['PROJ-1']);
    expect(msg).toContain('Estos escenarios aún no existen en TestRail');
    expect(msg).toContain('Primero crea los casos en TestRail');
  });
});
