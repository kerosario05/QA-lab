import { describe, expect, it } from 'vitest';
import { normalizeScenarioPreviewResponse } from '../scenarios/normalize';
import { buildLaunchPayloadScenarios, computeLaunchSelectionSummary } from '../../pages/TestLaunch/launch-selection';
import { validateAndBuildLaunchPayload, detectLaunchMode } from './launch-validator';

const scenarios = [
  { title: 'standard-a', mcpExecutable: true, executionReadiness: 'standard', semanticValidity: 'valid', automationType: 'ui', launchClassification: 'standard' },
  { title: 'standard-b', mcpExecutable: true, executionReadiness: 'standard', semanticValidity: 'valid', automationType: 'ui', launchClassification: 'standard' },
  { title: 'adaptive-a', mcpExecutable: false, executionReadiness: 'requires_route_discovery', semanticValidity: 'valid', automationType: 'ui', launchClassification: 'adaptive' },
  { title: 'adaptive-b', mcpExecutable: false, executionReadiness: 'requires_route_discovery', semanticValidity: 'valid', automationType: 'ui', launchClassification: 'adaptive' },
].map((scenario, index) => ({
  ...scenario,
  sourceIssueKey: `PROJ-${index + 1}`,
  custom_steps_separated: [{ content: 'click', expected: '' }],
  custom_expected: 'ok',
  custom_preconds: '',
  validation: { valid: true, errors: [], warnings: [] },
  targetScreen: scenario.mcpExecutable ? undefined : 'product-list',
  actualChain: scenario.mcpExecutable ? undefined : ['home', 'product-list'],
  requiredChain: scenario.mcpExecutable ? undefined : ['home', 'product-list'],
}));

describe('execution readiness propagation', () => {
  it('preserves authority fields through normalize, selection, and launch payload', () => {
    const normalized = normalizeScenarioPreviewResponse({
      stories: [{ jiraKey: 'PROJ', title: 'fixture', scenarioCount: 4, scenarios }],
    });
    const selection = computeLaunchSelectionSummary({
      stories: normalized.stories,
      selectedCaseKeys: ['PROJ::0', 'PROJ::1', 'PROJ::2', 'PROJ::3'],
      selectedTestRailCaseIds: [],
    });
    const result = validateAndBuildLaunchPayload({
      selectedMcpScenarios: scenarios as any,
      selectedTrCaseIds: [],
      defaultAppSlug: 'fixture-app',
    });

    expect(selection.selectedGeneratedScenarios.map((s) => s.mcpExecutable)).toEqual([true, true, false, false]);
    expect(selection.selectedGeneratedScenarios.map((s) => s.executionReadiness)).toEqual(['standard', 'standard', 'requires_route_discovery', 'requires_route_discovery']);
    expect(result.ok).toBe(true);
    const launchPayloadScenarios = buildLaunchPayloadScenarios(selection.selectedGeneratedScenarios);
    expect(launchPayloadScenarios.map((s) => s.mcpExecutable)).toEqual([true, true, false, false]);
    expect(launchPayloadScenarios.map((s) => s.executionReadiness)).toEqual(['standard', 'standard', 'requires_route_discovery', 'requires_route_discovery']);
    expect(launchPayloadScenarios.slice(2).map((s) => s.targetScreen)).toEqual(['product-list', 'product-list']);
    expect((result.payload as any).scenarios.map((s: any) => s.mcpExecutable)).toEqual([true, true, false, false]);
    expect(detectLaunchMode({ selectedMcpScenarios: scenarios as any, selectedTrCaseIds: [] })).toBe('scenario-preview');
  });

  it('keeps legacy missing authority fail-closed', () => {
    const result = validateAndBuildLaunchPayload({
      selectedMcpScenarios: [{ ...scenarios[0], mcpExecutable: undefined, executionReadiness: undefined }] as any,
      selectedTrCaseIds: [],
      defaultAppSlug: 'fixture-app',
    });
    expect(result.ok).toBe(true);
    expect((result.payload as any).scenarios[0].mcpExecutable).toBeUndefined();
  });

  it('reads explicit authority from populated-story metadata without defaulting', () => {
    const normalized = normalizeScenarioPreviewResponse({
      stories: [{ jiraKey: 'PROJ', title: 'fixture', scenarioCount: 1, scenarios: [{
        title: 'standard-from-metadata',
        refs: 'PROJ',
        custom_preconds: '',
        custom_steps_separated: [],
        metadata: { mcpExecutable: true, executionReadiness: 'standard', semanticValidity: 'valid', automationType: 'ui' },
      }] }],
    });
    const selection = computeLaunchSelectionSummary({
      stories: normalized.stories,
      selectedCaseKeys: ['PROJ::0'],
      selectedTestRailCaseIds: [],
    });
    expect(selection.selectedGeneratedScenarios[0]).toMatchObject({
      mcpExecutable: true,
      executionReadiness: 'standard',
      semanticValidity: 'valid',
      automationType: 'ui',
    });
  });
});
