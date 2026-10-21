// @vitest-environment node
import {expect,it} from 'vitest';
import {jiraPrerequisiteSummary} from './jira-prerequisites';
import type {StoryScenario} from '../../services/scenarios/types';

it('shows only required test data without control listings or values',()=>{
 for(const [label,link] of [['Usuario','Acceder'],['Identificador','Abrir solicitud']]) {
  const scenario:StoryScenario={title:'Fixture',custom_preconds:null,custom_expected:'Done',custom_steps_separated:[{content:`Ingresar un dato no válido en "${label}"`,expected:''},{content:`Presionar "${link}"`,expected:''}],inputRequirements:[{key:'fixture.field',label,stepIndex:1,operation:'fill',required:true,editable:true,sensitive:true,controlType:'password',source:'jira_step',dataCondition:'invalid'}]};
  const summary=jiraPrerequisiteSummary(scenario);
  expect(summary).toContain(`${label} · no válido · paso 1`);
  expect(summary).not.toContain(link);
  expect(summary).not.toContain('Discovery');
  expect(summary).not.toContain('Está visible');
  expect(summary).not.toContain('fixture.field');
 }
});
