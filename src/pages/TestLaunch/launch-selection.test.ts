import { describe, expect, it } from 'vitest';
import type { Story } from '../../services/scenarios';
import {
  computeLaunchSelectionSummary,
  deriveSelectedSourceLabel,
  normalizePublishedCasesForDiscovery,
} from './launch-selection';

function makeStories(): Story[] {
  return [
    {
      jiraKey: 'AA-1',
      title: 'Story 1',
      generatedByAi: true,
      scenarioCount: 2,
      scenarios: [
        {
          title: 'Scenario 1',
          refs: '',
          custom_preconds: null,
          custom_expected: 'Expected 1',
          custom_steps_separated: [{ content: 'Clic en "Iniciar".', expected: 'OK' }],
        },
        {
          title: 'Scenario 2',
          refs: '',
          custom_preconds: 'Pre',
          custom_expected: 'Expected 2',
          custom_steps_separated: [{ content: 'Clic en "Productos".', expected: 'OK' }],
        },
      ],
    },
    {
      jiraKey: 'AA-2',
      title: 'Story 2',
      generatedByAi: true,
      scenarioCount: 1,
      scenarios: [
        {
          title: 'Scenario 3',
          refs: '',
          custom_preconds: null,
          custom_expected: 'Expected 3',
          custom_steps_separated: [{ content: 'Clic en "Servicios".', expected: 'OK' }],
        },
      ],
    },
  ];
}

describe('launch selection summary', () => {
  it('solo 3 casos TestRail: total 3, fuente TestRail, selectedScenarios vacío', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: [],
      selectedTestRailCaseIds: [38101, 38102, 38103],
    });

    expect(summary.totalSelected).toBe(3);
    expect(summary.sourceLabel).toBe('TestRail');
    expect(summary.hasLaunchableSelection).toBe(true);
    expect(summary.selectedGeneratedScenarios).toHaveLength(0);
    expect(summary.existingTestRailCaseIds).toEqual([38101, 38102, 38103]);
  });

  it('solo Jira: fuente Jira y envía únicamente escenarios Jira seleccionados', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: ['AA-1::0', 'AA-2::0'],
      selectedTestRailCaseIds: [],
    });

    expect(summary.sourceLabel).toBe('Jira');
    expect(summary.totalSelected).toBe(2);
    expect(summary.selectedGeneratedScenarios).toHaveLength(2);
    expect(summary.existingTestRailCaseIds).toHaveLength(0);
  });

  it('selección mixta: fuente Jira + TestRail y suma correcta', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: ['AA-1::1'],
      selectedTestRailCaseIds: [39001, 39002],
    });

    expect(summary.sourceLabel).toBe('Jira + TestRail');
    expect(summary.jiraSelectedCount).toBe(1);
    expect(summary.testRailSelectedCount).toBe(2);
    expect(summary.totalSelected).toBe(3);
  });

  it('escenarios Jira cargados sin selección + 3 TestRail: fuente TestRail', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: [],
      selectedTestRailCaseIds: [40001, 40002, 40003],
    });

    expect(summary.sourceLabel).toBe('TestRail');
    expect(summary.selectedGeneratedScenarios).toHaveLength(0);
    expect(summary.existingTestRailCaseIds).toEqual([40001, 40002, 40003]);
  });

  it('ninguna selección: bloquea lanzamiento', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: [],
      selectedTestRailCaseIds: [],
    });

    expect(summary.totalSelected).toBe(0);
    expect(summary.sourceLabel).toBe('Ninguna');
    expect(summary.hasLaunchableSelection).toBe(false);
  });

  it('cambiar de pestaña mantiene ambas selecciones (derivación estable)', () => {
    const input = {
      stories: makeStories(),
      selectedCaseKeys: ['AA-1::0'],
      selectedTestRailCaseIds: [50001],
    };

    const fromScenariosTab = computeLaunchSelectionSummary(input);
    const fromCasesTab = computeLaunchSelectionSummary(input);

    expect(fromScenariosTab.totalSelected).toBe(2);
    expect(fromCasesTab.totalSelected).toBe(2);
    expect(fromScenariosTab.sourceLabel).toBe('Jira + TestRail');
    expect(fromCasesTab.sourceLabel).toBe('Jira + TestRail');
  });

  it('solo TestRail no deja candidatos de publicación (sin add_case)', () => {
    const summary = computeLaunchSelectionSummary({
      stories: makeStories(),
      selectedCaseKeys: [],
      selectedTestRailCaseIds: [60001, 60002, 60002],
    });

    expect(summary.selectedGeneratedScenarios).toHaveLength(0);
    expect(summary.existingTestRailCaseIds).toEqual([60001, 60002]);
    expect(summary.hasLaunchableSelection).toBe(true);
  });
});

describe('deriveSelectedSourceLabel', () => {
  it('deriva fuente desde selecciones reales', () => {
    expect(deriveSelectedSourceLabel(0, 0)).toBe('Ninguna');
    expect(deriveSelectedSourceLabel(2, 0)).toBe('Jira');
    expect(deriveSelectedSourceLabel(0, 2)).toBe('TestRail');
    expect(deriveSelectedSourceLabel(1, 1)).toBe('Jira + TestRail');
  });
});

describe('normalizePublishedCasesForDiscovery', () => {
  it('preserva sourceType y metadatos de mixed sin degradar jira_preview a testrail_only', () => {
    const normalized = normalizePublishedCasesForDiscovery([
      {
        scenarioId: 'L-aa11-001',
        caseId: 42901,
        sourceType: 'jira_preview',
        sourceIssueKey: 'QA-100',
        launchScenarioId: 'LAUNCH-001',
        executionScenarioId: 'PREVIEW-001',
      },
      {
        scenarioId: 'TR-CASE-42983',
        caseId: 42983,
        sourceType: 'testrail_case',
        executionScenarioId: 'PREVIEW-001',
      },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized?.[0].sourceType).toBe('jira_preview');
    expect(normalized?.[0].executionScenarioId).toBe('PREVIEW-001');
    expect(normalized?.[1].sourceType).toBe('testrail_case');
    expect(normalized?.[1].executionScenarioId).toBe('PREVIEW-001');
  });

  it('no descarta scenarioId PREVIEW-* válidos durante normalización', () => {
    const normalized = normalizePublishedCasesForDiscovery([
      { scenarioId: 'PREVIEW-009', caseId: 50009, sourceType: 'jira_preview' },
    ]);
    expect(normalized).toEqual([
      { scenarioId: 'PREVIEW-009', caseId: 50009, sourceType: 'jira_preview', title: undefined, sourceIssueKey: undefined, launchScenarioId: undefined, executionScenarioId: undefined },
    ]);
  });
});
