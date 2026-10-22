import type {StoryScenario, JiraReviewConfiguration} from '../../services/scenarios/types';

function isAutoResolvableStep(step: string): boolean {
  return /^\s*(?:Abrir la aplicación configurada(?: del proyecto)?|(?:Solicitar|Request)\s+(?:el\s+|un\s+)?(?:c[oó]digo|code)\s+(?:por|v[ií]a|by|via)\s+(?:SMS|correo electr[oó]nico|email)|(?:Presionar|Pulsar|Click|Press)\s+["“][^"”]+["”]|(?:Ingresar|Escribir|Completar)\b.+\ben\s+["“][^"”]+["”]|Seleccionar\b.+\ben\s+["“][^"”]+["”]|(?:Validar|Verificar)\b.+["“][^"”]+["”])\.?$/i.test(step);
}

/** Only explicitly configured requirements leave review; live Discovery still certifies targets. */
export function jiraReviewBlockingErrors(scenario: StoryScenario): string[] {
  const errors = [...(scenario.validation?.errors ?? [])];
  const steps = scenario.custom_steps_separated.map(step=>step.content);
  const pending = scenario.unresolvedUiRequirements;
  if (pending?.length && pending.every(item=> {
    const target=scenario.reviewConfiguration?.uiTargets?.[String(item.stepIndex)]?.trim();
    const step=steps[item.stepIndex-1];
    if (step && /^\s*(?:Validar|Verificar) que se (?:muestre|muestren)\s+["“][^"”]+["”][.]?$/i.test(step)
      && scenario.conditionRequirements?.some(requirement=>scenario.reviewConfiguration?.conditions?.[requirement.key]===false && requirement.stepIndices.includes(item.stepIndex))) return true;
    return step && (target ? target.length<=250 && !/[\r\n"“”]/.test(target) && [...step.matchAll(/["“]([^"”]+)["”]/g)].length===1
      : isAutoResolvableStep(step));
  })) {
    const index=errors.indexOf('JIRA_UI_OBSERVATION_REQUIRED');
    if(index>=0) errors.splice(index,1);
  }
  if (scenario.conditionRequirements?.length) {
    const ready=scenario.conditionRequirements.every(requirement=> {
      const decision=scenario.reviewConfiguration?.conditions?.[requirement.key];
      return (decision===false || requirement.stepIndices.length>0)
        && requirement.stepIndices.every(index=>/^\s*(?:Validar|Verificar)(?: que se (?:muestre|muestren))?\s+["“][^"”]+["”][.]?$/i.test(steps[index-1] ?? ''));
    });
    if(ready) {
      const index=errors.indexOf('JIRA_SOURCE_CONDITION_REQUIRES_CONFIGURATION');
      if(index>=0) errors.splice(index,1);
    }
  }
  return errors;
}

/** Keep machine error codes for launch gating; explain the affected authored step to the user. */
export function jiraReviewBlockingMessages(scenario: StoryScenario): string[] {
  return jiraReviewBlockingErrors(scenario).flatMap(code=>{
    let issues=(scenario.validation?.issues??[]).filter(issue=>issue.code===code && Number.isInteger(issue.stepIndex) && issue.stepIndex>0);
    // Cached previews from earlier servers carry condition indices but no structured issues.
    if(!issues.length && code==='JIRA_CONDITION_STEP_UNSUPPORTED') {
      const indices=[...new Set((scenario.conditionRequirements??[]).flatMap(requirement=>requirement.stepIndices))];
      issues=indices.filter(index=>Number.isInteger(index)&&index>0&&!/^\s*(?:Validar|Verificar)(?: que se (?:muestre|muestren))?\s+["“][^"”]+["”][.]?$/i.test(scenario.custom_steps_separated[index-1]?.content??''))
        .map(stepIndex=>({code,stepIndex,step:scenario.custom_steps_separated[stepIndex-1]?.content??''}));
    }
    const hint=code==='JIRA_CONDITION_STEP_UNSUPPORTED'
      ? 'La validación condicional no pudo interpretarse. Usa una validación por paso con el texto esperado entre comillas y pulsa «Aplicar y validar».'
      : 'Edita este paso y pulsa «Aplicar y validar».';
    if(issues.length) return [...new Set(issues.map(issue=>{
      const text=scenario.custom_steps_separated[issue.stepIndex-1]?.content??issue.step;
      return `Paso ${issue.stepIndex}${text?`: ${text}`:' (ya no existe en el escenario)'}. ${hint}`;
    }))];
    return [code==='JIRA_CONDITION_STEP_UNSUPPORTED'
      ? 'No se pudo interpretar una validación condicional. Abre «Editar pasos» y pulsa «Aplicar y validar» para identificar el paso afectado.'
      : code];
  });
}

export function JiraReviewErrorNotice({scenario}:{scenario:StoryScenario}) {
  const messages=jiraReviewBlockingMessages(scenario);
  if(!messages.length) return null;
  return <div role="alert" className="px-4 py-2.5 text-[11px] text-red-300 bg-red-500/10">
    <p className="font-medium">Revisa los siguientes pasos antes de lanzar:</p>
    <ul className="mt-1 list-disc pl-4 space-y-1">{messages.map((message,index)=><li key={index} className="whitespace-pre-wrap break-words">{message}</li>)}</ul>
  </div>;
}

export function JiraScenarioReview({scenario,onChange}: {scenario:StoryScenario;onChange:(configuration:JiraReviewConfiguration)=>void}) {
  if (!scenario.unresolvedUiRequirements?.length && !scenario.conditionRequirements?.length) return null;
  const configuration=scenario.reviewConfiguration ?? {};
  const automaticCount=(scenario.unresolvedUiRequirements ?? []).filter(item=> {
    const step=scenario.custom_steps_separated[item.stepIndex-1]?.content ?? '';
    return isAutoResolvableStep(step);
  }).length;
  return <details className="px-4 py-3 border-b border-white/10 text-xs text-white/80">
    <summary className="cursor-pointer font-medium">Preparación automática · Discovery resolverá {automaticCount} referencias</summary>
    <p className="my-2 text-white/60">Discovery buscará estos controles y resultados durante la ejecución. Abre ajustes solo si necesitas precisar una referencia o revisar una condición.</p>
    <details className="mt-3 rounded border border-white/10 px-3 py-2">
      <summary className="cursor-pointer text-white/70">Ajustes opcionales · {scenario.conditionRequirements?.length ?? 0} condiciones y {scenario.unresolvedUiRequirements?.length ?? 0} referencias</summary>
    {scenario.conditionRequirements?.map(requirement=> <label key={requirement.key} className="block my-3">
      <span className="block">{requirement.subject}</span>
      <span className="block my-1 text-white/50">{requirement.sourceClause}</span>
      <select aria-label={`Aplicabilidad de ${requirement.subject}`} className="w-full rounded bg-[#151922] p-2" value={typeof configuration.conditions?.[requirement.key]==='boolean' ? String(configuration.conditions[requirement.key]) : ''}
        onChange={event=>{
          const conditions={...configuration.conditions};
          if(event.target.value==='') delete conditions[requirement.key]; else conditions[requirement.key]=event.target.value==='true';
          onChange({...configuration,conditions});
        }}>
        <option value="">Discovery verificará automáticamente</option>
        <option value="true">Aplica a este caso</option>
        <option value="false">No aplica a este caso</option>
      </select>
      {configuration.conditions?.[requirement.key]===true && !requirement.stepIndices.length && <span className="text-amber-200">Falta generar la validación de este requisito.</span>}
    </label>)}
    {scenario.unresolvedUiRequirements?.map((item,index)=> <label key={`${item.stepIndex}-${index}`} className="block my-3">
      <span className="block mb-1">Paso {item.stepIndex}: {item.requirement}</span>
      <input aria-label={`Referencia de UI del paso ${item.stepIndex}`} className="w-full rounded border border-white/20 bg-[#0c1018] p-2" maxLength={250}
        placeholder="Etiqueta del control o mensaje esperado" value={configuration.uiTargets?.[String(item.stepIndex)] ?? ''}
        onChange={event=>onChange({...configuration,uiTargets:{...configuration.uiTargets,[String(item.stepIndex)]:event.target.value}})}/>
      {/^(?:Presionar|Pulsar|Click|Press)\b/i.test(scenario.custom_steps_separated[item.stepIndex-1]?.content ?? '') && <span className="text-white/50">Opcional: Discovery intentará resolver este control en vivo.</span>}
    </label>)}
    </details>
  </details>;
}
