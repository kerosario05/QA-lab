import {useState,useRef,useEffect} from 'react';
import type {JiraInputRequirement,StoryScenario} from '../../services/scenarios/types';
import {JiraStepInputs} from './JiraStepInputs';

export type ReviewedLaunchScenario=Omit<StoryScenario,'custom_steps_separated'|'custom_expected'|'custom_preconds'> & {steps:string[];expectedResult:string;preconditions?:string[]};
export function applyReviewedLaunchScenario(original:StoryScenario,reviewed:ReviewedLaunchScenario):StoryScenario{
 const changed=original.scenarioId!==reviewed.scenarioId;
 return {...original,...reviewed,dataRequirements:changed?[]:original.dataRequirements,requiredData:changed?undefined:original.requiredData,
  custom_steps_separated:reviewed.steps.map(content=>({content,expected:''})),custom_expected:reviewed.expectedResult,custom_preconds:reviewed.preconditions?.join('\n')||null};
}

function draftInputRequirements(steps:string[]):JiraInputRequirement[]{
 const fields:JiraInputRequirement[]=[];
 steps.forEach((raw,index)=>{
  const step=raw.trim().replace(/^\d+[.)]\s*/, '');
  const fill=step.match(/^(?:ingresar|introducir|digitar|escribir|completar|llenar|type|enter|fill)\s+(.+)$/i);
  const select=step.match(/^(?:seleccionar|escoger|elegir)\s+(.+)$/i);
  const match=fill??select;if(!match||/^(?:validar|verificar|comprobar)\b/i.test(step))return;
  const remainder=match[1].trim().replace(/[.]$/, '');
  const quotedField=step.match(/\ben\s+(?:el\s+)?(?:campo\s+)?["“']([^"”']+)["”']/i)?.[1]?.trim();
  const trailingField=step.match(/\ben\s+(?:el\s+)?(?:campo\s+)?([^"“'][^.]*)$/i)?.[1]?.trim();
  // A bare selection is usually fixed navigation (for example, a profile tab).
  // Only show a data field for an explicitly named selection control.
  if(select&&!quotedField&&!/\ben\s+(?:el\s+)?campo\s+/i.test(remainder))return;
  const label=quotedField??trailingField??remainder.replace(/^\s*(?:el\s+)?campo\s+/i,'').replace(/^["“']|["”']$/g,'').trim();
  if(!label||label.length>120||/^(?:el|la|un|una|valor|dato)$/i.test(label))return;
  const operation=select?'select':'fill';
  const password=/\bcontrase(?:ñ|n)a\b|\bpassword\b/i.test(label);
  fields.push({key:`jira_edit_draft_${index+1}`,label,stepIndex:index+1,operation,required:true,editable:true,sensitive:password||/\b(?:clave|pin|otp|token)\b/i.test(label),controlType:operation==='select'?'select':password?'password':/\bmonto\b|\bamount\b|\bcantidad\b/i.test(label)?'number':'text',source:'jira_step'});
 });
 return fields;
}

async function requestEditReview(body:unknown){
 const response=await fetch(`${import.meta.env.VITE_API_URL??''}/api/scenarios/jira/review-edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const raw=await response.text();let payload:any;
 try{payload=raw?JSON.parse(raw):null;}catch{payload=null;}
 if(!response.ok){const detail=typeof payload?.error==='string'?payload.error:typeof payload?.message==='string'?payload.message:'';throw new Error(`HTTP ${response.status}${detail?`: ${detail}`:''}`);}
 if(!payload||typeof payload!=='object')throw new Error('Respuesta vacía del servicio de revisión.');
 return payload;
}

export function JiraScenarioStepEditor({scenario,scenarios,issueKey,appSlug,initialValues={},onApply,onEditingChange}:{scenario:StoryScenario;scenarios:StoryScenario[];issueKey:string;appSlug:string;initialValues?:Record<string,string|boolean>;onApply:(reviewed:ReviewedLaunchScenario[],valuesByKey:Record<string,string>)=>void;onEditingChange?:(editing:boolean)=>void}){
 const [open,setOpen]=useState(false);
 const [steps,setSteps]=useState<string[]>([]);
 const [title,setTitle]=useState('');
 const [expectedResult,setExpectedResult]=useState('');
 const [draftValues,setDraftValues]=useState<Record<string,string|boolean>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const mounted=useRef(true);
 const currentScenarios=useRef(scenarios);currentScenarios.current=scenarios;
 const editingCallback=useRef(onEditingChange);editingCallback.current=onEditingChange;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{editingCallback.current?.(open);return()=>editingCallback.current?.(false);},[open]);
 const start=()=>{
  const currentSteps=scenario.custom_steps_separated.map(step=>step.content);
  const values:Record<string,string|boolean>={};
  for(const field of draftInputRequirements(currentSteps)){
   const existing=scenario.inputRequirements?.find(candidate=>candidate.stepIndex===field.stepIndex&&candidate.operation===field.operation&&candidate.label.trim().toLocaleLowerCase()===field.label.trim().toLocaleLowerCase());
   const value=existing?initialValues[existing.key]:undefined;
   if(value!==undefined)values[field.key]=value;
  }
  setSteps(currentSteps);setTitle(scenario.title);setExpectedResult(scenario.custom_expected??'');setDraftValues(values);setError('');setOpen(true);
 };
 const move=(index:number,delta:number)=>setSteps(previous=>{const next=[...previous];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});
 const apply=async()=>{
  if(!title.trim()||!expectedResult.trim()||!steps.length||steps.some(step=>!step.trim())){setError('Completa el título, todos los pasos y el resultado esperado.');return;}
  setBusy(true);setError('');
  try{
   const result=await requestEditReview({
    issueKey,appSlug,scenarioId:scenario.scenarioId??scenario.id,
    scenarios:scenarios.map(item=>({...item,scenarioId:item.scenarioId??item.id,sourceIssueKey:issueKey,steps:item.custom_steps_separated.map(step=>step.content),expectedResult:item.custom_expected??'',preconditions:item.custom_preconds?[item.custom_preconds]:[]})),
    patch:{title,steps,expectedResult}});
   if(!result.ok||!Array.isArray(result.scenarios)||result.scenarios.length!==scenarios.length||result.scenarios.some((item:ReviewedLaunchScenario)=>item.sourceIssueKey!==issueKey))throw new Error('Respuesta de revisión inválida.');
   if(!mounted.current)return;
   if(currentScenarios.current!==scenarios)throw new Error('Los escenarios cambiaron durante la revisión.');
   const valuesByKey:Record<string,string>={};
   const editedIndex=scenarios.findIndex(item=>(item.scenarioId??item.id)=== (scenario.scenarioId??scenario.id));
   const reviewedEdited=result.scenarios[editedIndex];
   for(const field of reviewedEdited.inputRequirements??[]){
    const draftField=draftInputRequirements(steps).find(candidate=>candidate.stepIndex===field.stepIndex&&candidate.label.trim().toLocaleLowerCase()===field.label.trim().toLocaleLowerCase()&&candidate.operation===field.operation);
    const value=draftField?draftValues[draftField.key]:undefined;
    if(value!==undefined&&String(value).trim())valuesByKey[field.key]=String(value);
   }
   onApply(result.scenarios,valuesByKey);setOpen(false);
  }catch(cause){const message=cause instanceof Error?cause.message:'';setError(message.includes('404')?'El servicio de revisión del motor no está disponible (404). Reinicia el backend de QA Lab para cargar la ruta de edición.':message?`No se pudo validar la edición (${message}). Tus cambios siguen aquí.`:'No se pudo validar la edición. Tus cambios siguen aquí; vuelve a intentarlo.');}
  finally{setBusy(false);}
 };
 if(!open)return <div className="px-4 py-2 border-b border-white/10"><button type="button" className="text-xs text-[#5EC470]" onClick={start}>Editar pasos</button></div>;
 return <section aria-label="Editar escenario de lanzamiento" className="p-4 border-b border-white/10 text-xs text-white/80">
  <p className="mb-3 text-white/60">Los cambios se validan con la HU. Usa pasos de acción individuales y pasos «Validar…» para comprobar resultados. Se aplican a esta preparación de ejecución.</p>
  <fieldset disabled={busy} className="space-y-3">
   <label className="block">Título<input aria-label="Título del escenario" className="block mt-1 w-full rounded border border-white/20 bg-[#151922] p-2" value={title} onChange={event=>setTitle(event.target.value)}/></label>
   {steps.map((step,index)=><div key={index} className="flex items-start gap-2">
    <span className="pt-2 w-5">{index+1}</span>
    <div className="flex-1 min-w-0"><textarea aria-label={`Paso ${index+1}`} rows={2} className="w-full rounded border border-white/20 bg-[#151922] p-2" value={step} onChange={event=>setSteps(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/>
     <JiraStepInputs fields={draftInputRequirements(steps).filter(field=>field.stepIndex===index+1)} values={draftValues} onChange={(fieldKey,value)=>setDraftValues(previous=>({...previous,[fieldKey]:value}))}/>
    </div>
    <button type="button" aria-label={`Subir paso ${index+1}`} disabled={index===0} onClick={()=>move(index,-1)} className="p-2 disabled:opacity-30">↑</button>
    <button type="button" aria-label={`Bajar paso ${index+1}`} disabled={index===steps.length-1} onClick={()=>move(index,1)} className="p-2 disabled:opacity-30">↓</button>
    <button type="button" aria-label={`Eliminar paso ${index+1}`} onClick={()=>setSteps(previous=>previous.filter((_,i)=>i!==index))} className="p-2 text-red-300">×</button>
   </div>)}
   <button type="button" onClick={()=>setSteps(previous=>[...previous,''])} className="text-[#5EC470]">+ Añadir paso</button>
   <label className="block">Resultado esperado<textarea aria-label="Resultado esperado del escenario" rows={2} className="block mt-1 w-full rounded border border-white/20 bg-[#151922] p-2" value={expectedResult} onChange={event=>setExpectedResult(event.target.value)}/></label>
   <div className="flex gap-4"><button type="button" className="rounded bg-[#104B99] px-3 py-2 text-white" onClick={apply}>Aplicar y validar</button><button type="button" onClick={()=>setOpen(false)}>Cancelar</button></div>
  </fieldset>
  {busy&&<p role="status" className="mt-2">Validando pasos y datos requeridos…</p>}
  {error&&<p role="alert" className="mt-2 text-red-300">{error}</p>}
 </section>;
}
