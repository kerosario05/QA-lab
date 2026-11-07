import {expect,it,vi} from 'vitest';
import {generateAutomaticRecordingData} from './automatic-cedula-data';
const scenario:any={scenarioId:'rec',requiredData:[],runtimeDataset:{resolvedValues:{cedula:'10000000001'}},runtimeInputRequirements:[{valueKey:'cedula',semanticField:'Cédula',valueRole:'action_input',technicalTargetRefs:[],sourceEventRefs:[]}]};
it('stop produces both editable field values before promotion',async()=>{
  const generate=vi.fn(async(_project:string,_count:number,_excluded:string[])=>['10000000002','10000000003']);
  expect(await generateAutomaticRecordingData('example',[scenario],{enabled:async()=>true,generate})).toEqual([{scenarioId:'rec',key:'cedula',value:'10000000002',specValue:'10000000003'}]);
  expect(generate).toHaveBeenCalledWith('example',2,expect.arrayContaining(['10000000001']));
});
it('promoted scenarios use one value and disabled projects retain their data',async()=>{
  const generate=vi.fn(async(_project:string,_count:number,_excluded:string[])=>['10000000002']);
  const result=await generateAutomaticRecordingData('example',[{...scenario,promotedSpec:{path:'existing'}}],{enabled:async()=>true,generate});
  expect(result[0].specValue).toBeUndefined();expect(generate.mock.calls[0][1]).toBe(1);
  generate.mockClear();expect(await generateAutomaticRecordingData('example',[scenario],{enabled:async()=>false,generate})).toEqual([]);expect(generate).not.toHaveBeenCalled();
});
it('refuses a previous identification or duplicate discovery/spec pair',async()=>{
  await expect(generateAutomaticRecordingData('example',[scenario],{enabled:async()=>true,generate:async()=>['10000000001','10000000001']})).rejects.toThrow('nuevas');
});
