import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioEditor } from './ScenarioEditor';
import { newScenario } from './scenario-utils';
import { useDraftEditor } from './useDraftEditor';
import { testDesignApi, type TestDesignDraftWithStories, type TestDesignDraftStory } from '../../services/test-design';

describe('scenario step editing',()=>{
 it('keeps natural step text after blur and places added rows in the same table',async()=>{
  const host=document.createElement('div'); document.body.append(host);
  const root=createRoot(host);
  function Harness(){
   const [scenario,setScenario]=useState({...newScenario(),title:'Alta',steps:[{action:'Ingresar nombre en "Nombre"',expected:''}]});
   return <ScenarioEditor scenario={scenario} index={0} count={1} readOnly={false} defaultOpen onChange={setScenario} onMove={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}}/>;
  }
  try{
   await act(async()=>root.render(<Harness/>));
   const action=host.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Ejemplo:"]')!;
   await act(async()=>{action.focus();action.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
   expect(action.value).toBe('Ingresar nombre en "Nombre"');
   expect(host.textContent).not.toContain('{{nombre}}');
   const add=[...host.querySelectorAll('button')].find(button=>button.textContent?.includes('Agregar paso'))!;
   await act(async()=>add.click());
   const actions=host.querySelectorAll('textarea[placeholder^="Ejemplo:"]');
   expect(actions).toHaveLength(2);
   expect(actions[0].closest('.grid')?.parentElement).toBe(actions[1].closest('.grid')?.parentElement);
   expect(actions[0].closest('.grid')?.children).toHaveLength(4);
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('adopts server-derived fields after save without removing a blank row being authored',async()=>{
  const scenario={...newScenario(),title:'Alta',steps:[{action:'Ingresar nombre en "Nombre"',expected:''}]};
  const story={id:'story',scenarios:[scenario],generationStatus:'ready'} as TestDesignDraftStory;
  const get=vi.spyOn(testDesignApi,'getDraft').mockResolvedValue({stories:[story]} as TestDesignDraftWithStories);
  const save=vi.spyOn(testDesignApi,'saveScenarios').mockResolvedValue({...story,scenarios:[{...scenario,data:[{key:'name',label:'Nombre',value:'',sensitive:false,description:''}]}]});
  let editor:ReturnType<typeof useDraftEditor>;
  function Harness(){editor=useDraftEditor('draft');return null;}
  const host=document.createElement('div'); const root=createRoot(host);
  try{
   await act(async()=>root.render(<Harness/>));
   await act(async()=>editor.updateScenarios('story',[{...scenario,steps:[...scenario.steps,{action:'',expected:''}]}]));
   await act(async()=>editor.flush());
   expect(editor!.scenarios.story[0].data?.[0].label).toBe('Nombre');
   expect(editor!.scenarios.story[0].steps).toHaveLength(2);
   expect(editor!.scenarios.story[0].steps[0].action).toBe('Ingresar nombre en "Nombre"');
  }finally{await act(async()=>root.unmount());get.mockRestore();save.mockRestore();}
 });
});
