import {expect,it} from 'vitest';
import {scenarioFromJobSnapshot} from './snapshot-scenario';
import {applyLiveScenarioProgress,parseLiveScenarioProgress} from './state';
it('restores persisted labels after reload and accepts replayed progress',()=>{
  const scenario=scenarioFromJobSnapshot({currentCaseId:'PREVIEW-001',currentCaseTitle:'Recorded test',params:{scenarios:[{scenarioId:'REC-1',title:'Recorded test',steps:['Open','Fill','Submit']}]}});
  expect(scenario?.steps).toEqual(['Open','Fill','Submit']);
  const progress=parseLiveScenarioProgress('[promoted-step] stepIndex=2 phase=start');
  expect(applyLiveScenarioProgress(scenario,progress!)?.currentStepIndex).toBe(1);
});
it('does not substitute unrelated scenarios for an ambiguous job',()=>{
  expect(scenarioFromJobSnapshot({params:{scenarios:[{title:'a',steps:['a']},{title:'b',steps:['b']}]}})).toBeNull();
});
