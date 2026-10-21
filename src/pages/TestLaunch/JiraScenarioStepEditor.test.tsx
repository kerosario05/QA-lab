import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {JiraScenarioStepEditor,applyReviewedLaunchScenario,type ReviewedLaunchScenario} from './JiraScenarioStepEditor';
import {computeLaunchSelectionSummary,buildLaunchPayloadScenarios} from './launch-selection';
import type {StoryScenario} from '../../services/scenarios/types';

const scenario:StoryScenario={scenarioId:'HU-1:jira:1',sourceIssueKey:'HU-1',title:'Consultar',refs:'HU-1',custom_preconds:null,custom_expected:'Resultado',custom_steps_separated:[{content:'Presionar "Consultar"',expected:''},{content:'Validar que se muestre "Resultado"',expected:''}]};
const reviewed:ReviewedLaunchScenario={...scenario,scenarioId:'HU-1:jira:1:edited-1234',steps:['Presionar "Buscar"','Validar que se muestre "Resultado"'],expectedResult:'Resultado',validation:{valid:true,errors:[],warnings:[]},inputRequirements:[],executionReadiness:'requires_discovery'};
it('edits actions, validates the whole story and transports the reviewed revision to Launch Tests',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onApply=vi.fn();
 const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,text:async()=>JSON.stringify({ok:true,scenarios:[reviewed]})});vi.stubGlobal('fetch',fetchMock);
 const button=(text:string)=>[...host.querySelectorAll('button')].find(item=>item.textContent===text)!;
 try{
  await act(async()=>root.render(<JiraScenarioStepEditor scenario={scenario} scenarios={[scenario]} issueKey="HU-1" appSlug="profile-one" onApply={onApply}/>));
  await act(async()=>button('Editar pasos').click());
  const input=host.querySelector('textarea[aria-label="Paso 1"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Presionar "Buscar"');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Aplicar y validar').click());
  const request=JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(request.patch.steps[0]).toBe('Presionar "Buscar"');expect(request.scenarios[0].steps[0]).toBe(scenario.custom_steps_separated[0].content);
  expect(request.appSlug).toBe('profile-one');expect(onApply).toHaveBeenCalledWith([reviewed],{});
  const edited=applyReviewedLaunchScenario(scenario,reviewed);
  const selection=computeLaunchSelectionSummary({stories:[{jiraKey:'HU-1',title:'HU',generatedByAi:true,scenarioCount:1,scenarios:[edited]}],selectedCaseKeys:['HU-1::0'],selectedTestRailCaseIds:[]});
  const [payload]=buildLaunchPayloadScenarios(selection.selectedGeneratedScenarios);
  expect(payload.scenarioId).toBe(reviewed.scenarioId);expect(payload.steps).toEqual(reviewed.steps);expect(payload.expectedResult).toBe(reviewed.expectedResult);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it('adding a blank step blocks saving; deleting or cancelling never calls execution',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onApply=vi.fn();const editingChanged=vi.fn();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
 const button=(text:string)=>[...host.querySelectorAll('button')].find(item=>item.textContent===text)!;
 try{
  await act(async()=>root.render(<JiraScenarioStepEditor scenario={scenario} scenarios={[scenario]} issueKey="HU-1" appSlug="profile-two" onApply={onApply} onEditingChange={editingChanged}/>));
  await act(async()=>button('Editar pasos').click());await act(async()=>button('+ Añadir paso').click());
  expect(editingChanged).toHaveBeenLastCalledWith(true);
  await act(async()=>button('Aplicar y validar').click());expect(host.querySelector('[role="alert"]')?.textContent).toContain('Completa');expect(fetchMock).not.toHaveBeenCalled();
  await act(async()=>(host.querySelector('[aria-label="Eliminar paso 3"]') as HTMLButtonElement).click());
  await act(async()=>(host.querySelector('[aria-label="Bajar paso 1"]') as HTMLButtonElement).click());
  expect((host.querySelector('[aria-label="Paso 1"]') as HTMLTextAreaElement).value).toBe(scenario.custom_steps_separated[1].content);
  await act(async()=>button('Cancelar').click());expect(onApply).not.toHaveBeenCalled();expect(host.querySelector('textarea')).toBeNull();
  expect(editingChanged).toHaveBeenLastCalledWith(false);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
