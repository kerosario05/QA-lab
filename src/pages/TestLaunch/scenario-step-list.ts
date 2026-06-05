import type { ScenarioStep } from '../../services/scenarios';

export function normalizeScenarioStepList(steps: ScenarioStep[] | null | undefined): ScenarioStep[] {
  return Array.isArray(steps) ? steps : [];
}
