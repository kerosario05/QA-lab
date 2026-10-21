import type {StoryScenario} from '../../services/scenarios/types';

/** Show required test data without values or technical execution details. */
export function jiraPrerequisiteSummary(scenario:StoryScenario):string {
 const sections:string[]=[];
 const fields=(scenario.inputRequirements ?? []).filter(field=>field.required);
 if(fields.length) sections.push('Datos de prueba requeridos:\n'+fields.map(field=>{
  const condition=field.dataCondition==='invalid' ? 'no válido' : field.dataCondition==='expired' ? 'vencido' : 'válido';
  return `• ${field.label} · ${condition} · paso ${field.stepIndex}`;
 }).join('\n'));
 return sections.join('\n\n');
}
