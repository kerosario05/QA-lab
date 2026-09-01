import { describe, expect, it } from 'vitest';
import { normalizeScenarioPreviewResponse } from './normalize';
import { buildLaunchPayloadScenarios, computeLaunchSelectionSummary } from '../../pages/TestLaunch/launch-selection';

const standard = {
  jiraKey: 'AA-88',
  scenarioId: 'AA-88:fixture-standard:01',
  title: 'Standard',
  mcpExecutable: true,
  executionReadiness: 'standard',
  semanticValidity: 'valid',
  steps: ['start'],
};

const route = {
  jiraKey: 'AA-88',
  scenarioId: 'AA-88:fixture-route:01',
  title: 'Route',
  mcpExecutable: false,
  executionReadiness: 'requires_route_discovery',
  semanticValidity: 'valid',
  branchId: 'branch-fixture',
  stepRequirementRefs: [{ stepIndex: 0, requirementId: 'route:1' }],
  steps: ['start'],
};

describe('scenario preview authority preservation', () => {
  it('preserves the populated stories shape used by the runtime', () => {
    const normalized = normalizeScenarioPreviewResponse({
      stories: [{ jiraKey: 'AA-88', title: 'AA-88', scenarioCount: 2, scenarios: [
        { ...standard, metadata: { branchId: 'ignored-standard' } },
        { ...route, metadata: { branchId: 'branch-from-metadata', stepRequirementRefs: route.stepRequirementRefs } },
      ] }],
      totalScenarios: 2,
    });
    const selected = computeLaunchSelectionSummary({
      stories: normalized.stories,
      selectedCaseKeys: ['AA-88::0', 'AA-88::1'],
      selectedTestRailCaseIds: [],
    }).selectedGeneratedScenarios;
    const payload = buildLaunchPayloadScenarios(selected);

    expect(payload[0]).toMatchObject({ mcpExecutable: true, executionReadiness: 'standard' });
    expect(payload[1]).toMatchObject({
      mcpExecutable: false,
      executionReadiness: 'requires_route_discovery',
      branchId: 'branch-fixture',
      stepRequirementRefs: route.stepRequirementRefs,
    });
  });

  it('preserves authority and lineage through normalization, selection, and payload mapping', () => {
    const normalized = normalizeScenarioPreviewResponse({ scenarios: [standard, route] });
    const stories = normalized.stories;
    const selected = computeLaunchSelectionSummary({
      stories,
      selectedCaseKeys: ['AA-88::0', 'AA-88::1'],
      selectedTestRailCaseIds: [],
    }).selectedGeneratedScenarios;
    const payload = buildLaunchPayloadScenarios(selected);

    expect(payload.map(s => s.scenarioId)).toEqual(['AA-88:fixture-standard:01', 'AA-88:fixture-route:01']);
    expect(payload).toMatchObject([
      { mcpExecutable: true, executionReadiness: 'standard', semanticValidity: 'valid' },
      {
        mcpExecutable: false,
        executionReadiness: 'requires_route_discovery',
        semanticValidity: 'valid',
        branchId: 'branch-fixture',
        stepRequirementRefs: [{ stepIndex: 0, requirementId: 'route:1' }],
      },
    ]);
  });
});
