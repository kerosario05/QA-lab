import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { JiraStepInputs, JiraCommonInputs, JiraScenarioCommonAction, useJiraCommonValues, commonJiraFields, resolveJiraScenarioValues, buildJiraDataOverrides, missingJiraInputs, missingJiraTransportInputs } from './JiraStepInputs';
import { normalizeScenarioPreviewResponse } from '../../services/scenarios/normalize';
import type { JiraInputRequirement } from '../../services/scenarios/types';

const field: JiraInputRequirement = {key:'access.code',label:'SMS',stepIndex:2,operation:'fill',required:true,editable:true,sensitive:true,controlType:'password',source:'jira_step'};
describe('Jira inputs', () => {
  it('keeps the input schema through HTTP normalization and maps selected original IDs', () => {
    const normalized = normalizeScenarioPreviewResponse({scenarios:[{sourceIssueKey:'HU-1',scenarioId:'HU-1:01',title:'First',steps:['Ingresar código en "SMS"'],inputRequirements:[field]}, {sourceIssueKey:'HU-1',scenarioId:'HU-1:02',title:'Second',steps:['Ingresar código en "SMS"'],inputRequirements:[field]}]});
    expect(normalized.stories[0].scenarios[0].inputRequirements).toEqual([field]);
    const output = buildJiraDataOverrides(normalized.stories,['HU-1::1'],{'HU-1::0':{'access.code':'first'},'HU-1::1':{'access.code':'second',unrelated:'ignored'}});
    expect(output).toEqual({'HU-1:02':{'access.code':'second'}});
    expect(missingJiraInputs(normalized.stories,['HU-1::1'],{'HU-1::0':{'access.code':'first'}})).toHaveLength(1);
    expect(missingJiraInputs(normalized.stories,['HU-1::1'],{'HU-1::1':{'access.code':'second'}})).toEqual([]);
  });
  it('requires every validated field under the canonical scenario ID before launch', () => {
    const normalized = normalizeScenarioPreviewResponse({scenarios:[{sourceIssueKey:'HU-1',scenarioId:'HU-1:01',title:'First',steps:['Ingresar código'],inputRequirements:[field]}]});
    expect(missingJiraInputs(normalized.stories,['HU-1::0'],{'HU-1::0':{'access.code':'synthetic'}})).toEqual([]);
    expect(missingJiraTransportInputs(normalized.stories,['HU-1::0'],{'HU-1::0':{'access.code':'synthetic'}})).toEqual([{scenarioTitle:'First',label:'SMS',stepIndex:2}]);
    const overrides=buildJiraDataOverrides(normalized.stories,['HU-1::0'],{'HU-1::0':{'access.code':'synthetic'}});
    expect(missingJiraTransportInputs(normalized.stories,['HU-1::0'],overrides)).toEqual([]);
  });
  it('renders an editable password controller whose change keeps the authoritative key', async () => {
    const passwordField={...field,label:'Contraseña'};
    const container=document.createElement('div'); document.body.append(container);
    const root=createRoot(container); const changes: string[][]=[];
    await act(async () => root.render(<JiraStepInputs fields={[passwordField]} values={{'access.code':'synthetic'}} onChange={(key,value)=>changes.push([key,value])}/>));
    const input=container.querySelector('input')!;
    expect(input.type).toBe('password'); expect(input.value).toBe('synthetic'); expect(input.disabled).toBe(false);
    await act(async()=> { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'edited'); input.dispatchEvent(new Event('input',{bubbles:true})); });
    expect(changes).toEqual([['access.code','edited']]);
    await act(async()=>root.unmount()); container.remove();
  });
});

it('shows an invalid-data instruction without disclosing its value', async () => {
 const container=document.createElement('div'); const root=createRoot(container);
 await act(async()=>root.render(<JiraStepInputs fields={[{...field,dataCondition:'invalid'}]} values={{'access.code':'synthetic-secret'}} onChange={()=>{}}/>));
 expect(container.textContent).toContain('Usar un dato no válido');
 expect(container.textContent).not.toContain('synthetic-secret');
 await act(async()=>root.unmount());
});

it('inherits only unambiguous compatible fields and preserves negative data and local overrides', () => {
 const stories = normalizeScenarioPreviewResponse({scenarios:[
 {sourceIssueKey:'HU-1',scenarioId:'HU-1:01',title:'First',steps:[],inputRequirements:[{...field,key:'a'}]},
 {sourceIssueKey:'HU-1',scenarioId:'HU-1:02',title:'Second',steps:[],inputRequirements:[{...field,key:'b'}]},
 {sourceIssueKey:'HU-1',scenarioId:'HU-1:03',title:'Negative',steps:[],inputRequirements:[{...field,key:'c',dataCondition:'invalid'}]},
 ]}).stories;
 const story=stories[0]; const identity=commonJiraFields(story)[0].key;
 const common={'HU-1':{[identity]:'synthetic-common'}};
 expect(resolveJiraScenarioValues(story,0,{},common)).toEqual({a:'synthetic-common'});
 expect(resolveJiraScenarioValues(story,1,{b:'override'},common)).toEqual({b:'override'});
 expect(resolveJiraScenarioValues(story,1,{b:''},common)).toEqual({b:''});
 expect(resolveJiraScenarioValues(story,2,{},common)).toEqual({});
 expect(buildJiraDataOverrides(stories,['HU-1::0','HU-1::1'],{'HU-1::1':{b:'override'}},common)).toEqual({'HU-1:01':{a:'synthetic-common'},'HU-1:02':{b:'override'}});
 expect(missingJiraInputs(stories,['HU-1::0'],{},common)).toEqual([]);
 expect(missingJiraInputs(stories,['HU-1::2'],{},common)).toHaveLength(1);
 expect(resolveJiraScenarioValues({...story,jiraKey:'HU-2'},0,{},common)).toEqual({});
 const ambiguous={...story,scenarios:story.scenarios.map(sc=>({...sc,inputRequirements:[{...field,key:'one'},{...field,key:'two'}]}))};
 expect(commonJiraFields(ambiguous)).toEqual([]);
});
it('renders masked common inputs and edits their shared identity', async () => {
 const passwordField={...field,label:'Contraseña'};
 const story=normalizeScenarioPreviewResponse({scenarios:[1,2].map(n=>({sourceIssueKey:'HU-3',scenarioId:'HU-3:'+n,title:'Case '+n,steps:[],inputRequirements:[passwordField]}))}).stories[0];
 const container=document.createElement('div');const root=createRoot(container);const changes:string[][]=[];
 await act(async()=>root.render(<JiraCommonInputs story={story} values={{}} onChange={(key,value)=>changes.push([key,value])}/>));
 expect(container.textContent).toContain('Datos comunes de la historia');
 expect(container.querySelector('input')?.type).toBe('password');
 const toggle=container.querySelector('button')!;
 expect(toggle.getAttribute('aria-expanded')).toBe('true');
 await act(async()=>toggle.click());
 expect(toggle.getAttribute('aria-expanded')).toBe('false');
 expect(container.querySelector('input')).not.toBeNull();
 await act(async()=>toggle.click());
 expect(toggle.getAttribute('aria-expanded')).toBe('true');
 expect(container.querySelector('input')?.type).toBe('password');
 await act(async()=>root.unmount());
});

it('masks only password-labelled controls even when other test data is marked sensitive', async () => {
 const fields: JiraInputRequirement[] = [
  {...field,key:'auth.rnc',label:'RNC',sensitive:true,controlType:'password'},
  {...field,key:'auth.username',label:'Usuario',sensitive:true,controlType:'password'},
  {...field,key:'auth.password',label:'Contraseña',controlType:'password'},
  {...field,key:'auth.otp',label:'Código de acceso',sensitive:true,controlType:'password'},
  {...field,key:'transfer.token',label:'Token de transferencia',sensitive:true,controlType:'password'},
 ];
 const container=document.createElement('div'); const root=createRoot(container);
 await act(async()=>root.render(<JiraStepInputs fields={fields} values={{}} onChange={()=>{}}/>));
 expect([...container.querySelectorAll('input')].map(input=>input.type)).toEqual(['text','text','password','text','text']);
 await act(async()=>root.unmount()); container.remove();
});

it('keeps only password-labelled fields masked even when common fields carry stale password metadata', async () => {
 const fields: JiraInputRequirement[] = [
  {...field,key:'common.rnc',label:'RNC',sensitive:true,controlType:'password'},
  {...field,key:'common.user',label:'Usuario',sensitive:true,controlType:'password'},
  {...field,key:'common.password',label:'Contraseña',sensitive:true,controlType:'text'},
  {...field,key:'common.access',label:'Código de acceso',sensitive:true,controlType:'password'},
  {...field,key:'common.token',label:'Token de transferencia',sensitive:true,controlType:'password'},
 ];
 const story=normalizeScenarioPreviewResponse({scenarios:[1,2].map(n=>({sourceIssueKey:'HU-5',scenarioId:'HU-5:'+n,title:'Case '+n,steps:[],inputRequirements:fields}))}).stories[0];
 const container=document.createElement('div'); const root=createRoot(container);
 await act(async()=>root.render(<JiraCommonInputs story={story} values={{}} onChange={()=>{}}/>));
 expect([...container.querySelectorAll('input')].map(input=>input.type)).toEqual(['text','text','password','text','text']);
 await act(async()=>root.unmount()); container.remove();
});

it('does not mask a sensitive common text field', async () => {
 const textField: JiraInputRequirement = {...field,key:'auth.username',label:'Usuario',controlType:'text'};
 const story=normalizeScenarioPreviewResponse({scenarios:[1,2].map(n=>({sourceIssueKey:'HU-4',scenarioId:'HU-4:'+n,title:'Case '+n,steps:[],inputRequirements:[textField]}))}).stories[0];
 const container=document.createElement('div'); const root=createRoot(container);
 await act(async()=>root.render(<JiraCommonInputs story={story} values={{}} onChange={()=>{}}/>));
 expect(container.querySelector('input')?.type).toBe('text');
 await act(async()=>root.unmount()); container.remove();
});

it('scenario action resets compatible overrides only and renders once', async () => {
 const story=normalizeScenarioPreviewResponse({scenarios:[1,2].map(n=>({sourceIssueKey:'HU-9',scenarioId:'HU-9:'+n,title:'Case '+n,steps:[],inputRequirements:[{...field,key:'user'}, {...field,key:'negative',label:'Other',dataCondition:'invalid'}]}))}).stories[0];
 const identity=commonJiraFields(story)[0].key;
 expect(useJiraCommonValues(story,0,{user:'override',negative:'bad',unrelated:'keep'},{'HU-9':{[identity]:'shared'}})).toEqual({negative:'bad',unrelated:'keep'});
 expect(useJiraCommonValues(story,0,{user:'override'},{'HU-9':{[identity]:''}})).toEqual({user:'override'});
 const container=document.createElement('div');const root=createRoot(container);let clicks=0;
 await act(async()=>root.render(<JiraScenarioCommonAction available onApply={()=>clicks++}/>));
 expect(container.querySelectorAll('button')).toHaveLength(1);
 await act(async()=>container.querySelector('button')!.click());expect(clicks).toBe(1);
 await act(async()=>root.unmount());
});
