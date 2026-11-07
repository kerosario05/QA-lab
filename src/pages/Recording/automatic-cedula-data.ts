import type {RecordedScenario} from '../../services/recordings/types';
import {generateCedulas,isCedulaServiceEnabled,isRecordingSpecGenerationEnabled,supportsDataCedulaGeneration} from '../../services/data-services';
import {runtimeRequirementsForScenario} from './recording-readiness';

export async function generateAutomaticRecordingData(projectSlug:string,scenarios:RecordedScenario[],
  deps:{enabled:(slug:string)=>Promise<boolean>;generate:(slug:string,count?:number,exclude?:string[])=>Promise<string[]>;specEnabled?:(slug:string)=>Promise<boolean>}={enabled:isCedulaServiceEnabled,generate:generateCedulas,specEnabled:isRecordingSpecGenerationEnabled}) {
  const updates:Array<{scenarioId:string;key:string;value:string;specValue?:string}>=[];
  if(!await deps.enabled(projectSlug)) return updates;
  const specGenerationEnabled=await (deps.specEnabled?.(projectSlug) ?? Promise.resolve(true));
  for(const scenario of scenarios) {
    const excluded=[...Object.values(scenario.runtimeDataset?.resolvedValues ?? {}),...(scenario.runtimeInputRequirements ?? []).map(requirement=>requirement.value).filter((value):value is string=>typeof value==='string')];
    for(const requirement of runtimeRequirementsForScenario(scenario)) {
      if(requirement.valueRole!=='action_input' || requirement.sensitive || !supportsDataCedulaGeneration(requirement.semanticField,requirement.valueKey)) continue;
      const generateSpec=!scenario.promotedSpec && specGenerationEnabled;
      const count=generateSpec?2:1;
      const values=await deps.generate(projectSlug,count,excluded);
      const normalizedExcluded=excluded.map(value=>value.replace(/\D/g,''));
      if(values.length<count || new Set(values).size!==values.length || values.some(value=>normalizedExcluded.includes(value.replace(/\D/g,'')))) throw new Error('El servicio no devolvió identificaciones nuevas y distintas');
      updates.push({scenarioId:scenario.scenarioId,key:requirement.valueKey,value:values[0],...(generateSpec?{specValue:values[1]}:{})});
      excluded.push(...values);
    }
  }
  return updates;
}
