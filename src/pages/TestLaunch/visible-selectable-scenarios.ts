import { buildStep3Rows, type Step3ScenarioRow } from './step3-rows';
import type { Story } from '../../services/scenarios';

export type VisibleSelectableScenario = Step3ScenarioRow;

export function buildVisibleSelectableScenarios(stories: Story[] | null | undefined): VisibleSelectableScenario[] {
  return buildStep3Rows(stories).filter(item => Boolean(item.key && (item.title || item.steps.length || item.customExpected || item.customPreconds)));
}
