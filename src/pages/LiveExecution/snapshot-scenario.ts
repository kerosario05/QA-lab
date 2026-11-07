import type {ActiveScenarioLike} from './state';

/** Recover labels from the persisted job, never from browser storage or generated guesses. */
export function scenarioFromJobSnapshot(value: any): ActiveScenarioLike | null {
  const scenarios = value?.params?.scenarios;
  if (!Array.isArray(scenarios)) return null;
  const source = scenarios.find((row:any)=>value.currentCaseId && row.scenarioId === value.currentCaseId)
    ?? scenarios.find((row:any)=>value.currentCaseTitle && row.title === value.currentCaseTitle)
    ?? (scenarios.length === 1 ? scenarios[0] : undefined);
  if (!source || !Array.isArray(source.steps) || !(value.currentCaseId ?? source.scenarioId)) return null;
  return {id:value.currentCaseId ?? source.scenarioId,title:value.currentCaseTitle ?? source.title,
    steps:source.steps.filter((step:unknown)=>typeof step==='string'),index:scenarios.indexOf(source)+1,total:scenarios.length,currentStepIndex:0};
}
