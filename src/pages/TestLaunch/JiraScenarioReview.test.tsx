import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {JiraScenarioReview,jiraReviewBlockingErrors} from './JiraScenarioReview';
import {normalizeGeneratedScenarios} from './scenario-generation';
import {computeLaunchSelectionSummary,buildLaunchPayloadScenarios} from './launch-selection';
import type {StoryScenario,JiraReviewConfiguration} from '../../services/scenarios/types';

const scenario:StoryScenario={scenarioId:'HU-1:jira:1',title:'Result',refs:'HU-1',custom_preconds:null,custom_expected:'Done',custom_steps_separated:[{content:'Presionar "Unknown"',expected:''},{content:'Validar que se muestre "Fee"',expected:''},{content:'Validar que se muestre "Done"',expected:''}],validation:{valid:false,errors:['JIRA_UI_OBSERVATION_REQUIRED','JIRA_SOURCE_CONDITION_REQUIRES_CONFIGURATION'],warnings:[]},unresolvedUiRequirements:[{stepIndex:1,requirement:'Action label'}],conditionRequirements:[{key:'fee',subject:'Fee',sourceClause:'Fee if applicable',stepIndices:[2]}]};

it('configures each test variant without clearing unrelated blockers or certifying UI',()=>{
 expect(jiraReviewBlockingErrors(scenario)).toEqual([]);
 expect(jiraReviewBlockingErrors({...scenario,reviewConfiguration:{conditions:{fee:false}}})).toEqual([]);
 expect(jiraReviewBlockingErrors({...scenario,validation:{valid:false,errors:['JIRA_FAILURE_SETUP_UNSPECIFIED'],warnings:[]},reviewConfiguration:{conditions:{fee:false}}})).toEqual(['JIRA_FAILURE_SETUP_UNSPECIFIED']);
 expect(jiraReviewBlockingErrors({...scenario,unresolvedUiRequirements:[{stepIndex:3,requirement:'Outcome'}],reviewConfiguration:{conditions:{fee:false}}})).toEqual([]);
 expect(jiraReviewBlockingErrors({...scenario,custom_steps_separated:[{content:'Instrucción sin acción',expected:''}],unresolvedUiRequirements:[{stepIndex:1,requirement:'Outcome'}]})).toContain('JIRA_UI_OBSERVATION_REQUIRED');
 expect(jiraReviewBlockingErrors({...scenario,unresolvedUiRequirements:[{stepIndex:3,requirement:'Outcome'}],reviewConfiguration:{conditions:{fee:false},uiTargets:{'3':'Result'}}})).toEqual([]);
});

it('normalizes, selects and transports Jira review configuration independently for two profiles',()=>{
 for(const appSlug of ['profile-one','profile-two']) {
  const configuration={conditions:{fee:true},uiTargets:{'1':`${appSlug} action`}};
  const result=normalizeGeneratedScenarios({scenarios:[{sourceIssueKey:'HU-1',title:'Result',steps:scenario.custom_steps_separated.map(step=>step.content),conditionRequirements:scenario.conditionRequirements,unresolvedUiRequirements:scenario.unresolvedUiRequirements,reviewConfiguration:configuration}]} as any,{key:'HU-1',summary:'Story'} as any,{} as any,null);
  const selection=computeLaunchSelectionSummary({stories:result.stories,selectedCaseKeys:['HU-1::0'],selectedTestRailCaseIds:[]} as Parameters<typeof computeLaunchSelectionSummary>[0]);
  const payload=buildLaunchPayloadScenarios(selection.selectedGeneratedScenarios);
  expect((payload[0] as any).conditionRequirements).toEqual(scenario.conditionRequirements);
  expect((payload[0] as any).reviewConfiguration).toEqual(configuration);
 }
});

it('renders accessible condition controls and retains entered target references',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let configuration:JiraReviewConfiguration|undefined;
 try {
  await act(async()=>root.render(<JiraScenarioReview scenario={scenario} onChange={value=>{configuration=value;}}/>));
  const select=host.querySelector('select')!;
  expect(select.getAttribute('aria-label')).toBe('Aplicabilidad de Fee');
  await act(async()=>{select.value='false';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(configuration?.conditions).toEqual({fee:false});
  await act(async()=>root.render(<JiraScenarioReview scenario={{...scenario,reviewConfiguration:configuration}} onChange={value=>{configuration=value;}}/>));
  const input=host.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Observed action');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(configuration?.uiTargets).toEqual({'1':'Observed action'});
  expect(configuration?.conditions).toEqual({fee:false});
 } finally {await act(async()=>root.unmount());host.remove();}
});
