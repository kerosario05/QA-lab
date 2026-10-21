import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { JiraInputRequirement, Story } from '../../services/scenarios/types';

export type JiraCommonValues = Record<string, Record<string, string>>;

function commonIdentity(field: JiraInputRequirement): string | undefined {
  if (field.dataCondition === 'invalid' || field.dataCondition === 'expired') return undefined;
  return JSON.stringify([field.label.trim().normalize('NFKC').toLocaleLowerCase(), field.operation, field.controlType, field.sensitive]);
}

/** Only unambiguous fields repeated across scenarios in the same story may inherit. */
export function commonJiraFields(story: Story): JiraInputRequirement[] {
  const groups = new Map<string, { field: JiraInputRequirement; count: number; ambiguous: boolean }>();
  for (const scenario of story.scenarios) {
    const seen = new Set<string>();
    for (const field of scenario.inputRequirements ?? []) {
      const identity = commonIdentity(field);
      if (!identity || !field.editable) continue;
      const group = groups.get(identity) ?? {field, count: 0, ambiguous: false};
      if (seen.has(identity)) group.ambiguous = true;
      else group.count++;
      seen.add(identity); groups.set(identity, group);
    }
  }
  return [...groups.entries()].filter(([, group]) => group.count > 1 && !group.ambiguous)
    .map(([key, group]) => ({...group.field, key}));
}

export function resolveJiraScenarioValues(story: Story, index: number, local: Record<string, string | boolean>, common: JiraCommonValues = {}) {
  const result = {...local};
  const eligible = new Set(commonJiraFields(story).map(field => field.key));
  for (const field of story.scenarios[index]?.inputRequirements ?? []) {
    const identity = commonIdentity(field);
    if (identity && eligible.has(identity) && !Object.prototype.hasOwnProperty.call(local, field.key) && common[story.jiraKey]?.[identity] !== undefined) {
      result[field.key] = common[story.jiraKey][identity];
    }
  }
  return result;
}

/** Remove only overrides that can immediately inherit a nonempty common value. */
export function useJiraCommonValues(story: Story, index: number, local: Record<string,string | boolean>, common: JiraCommonValues) {
  const inherited = resolveJiraScenarioValues(story,index,{},common);
  const result = {...local};
  for (const [key,value] of Object.entries(inherited)) if (String(value).trim()) delete result[key];
  return result;
}
export function JiraScenarioCommonAction({onApply, available}: {onApply:()=>void; available:boolean}) {
  return <button type="button" disabled={!available} onClick={onApply} className="ml-auto text-xs text-[#5EC470] disabled:opacity-40">Usar datos comunes</button>;
}

export function JiraCommonInputs({story, values, onChange}: {story: Story; values: Record<string,string>; onChange: (key:string,value:string)=>void}) {
  const [expanded, setExpanded] = useState(true);
  const fields = commonJiraFields(story);
  if (!fields.length) return null;
  return <section className="mx-6 my-3 overflow-hidden rounded-xl border border-[#F4F1EA]">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between bg-[#FAFAF9] px-4 py-3 text-left text-sm font-medium text-[#1a1f2e]">
      <span>Datos comunes de la historia</span>
      {expanded ? <ChevronUp size={14} aria-label="Contraer datos comunes"/> : <ChevronDown size={14} aria-label="Expandir datos comunes"/>}
    </button>
    <div hidden={!expanded} className="bg-[#0d1119] p-4 text-white">
    <p className="mt-1 text-xs text-white/60">Se aplican a campos compatibles. Puedes cambiar el valor dentro de cada escenario. Los datos inválidos o vencidos se completan por separado.</p>
    <JiraStepInputs fields={fields} values={values} onChange={onChange}/>
    </div>
  </section>;
}

export function missingJiraInputs(stories: Story[], selected: string[], values: Record<string, Record<string, string | boolean>>, common: JiraCommonValues = {}) {
  return stories.flatMap(story => story.scenarios.flatMap((scenario, index) => {
    const selectionKey = `${story.jiraKey}::${index}`;
    if (!selected.includes(selectionKey)) return [];
    const resolved = resolveJiraScenarioValues(story, index, values[selectionKey] ?? {}, common);
    return (scenario.inputRequirements ?? []).filter(field => field.required && !String(resolved[field.key] ?? '').trim())
      .map(field => ({ scenarioTitle: scenario.title, label: field.label, stepIndex: field.stepIndex }));
  }));
}

/** Fail closed if validated form data cannot be projected onto each canonical scenario ID. */
export function missingJiraTransportInputs(stories: Story[], selected: string[], overrides: Record<string, Record<string, string>>) {
  return stories.flatMap(story => story.scenarios.flatMap((scenario, index) => {
    if (!selected.includes(`${story.jiraKey}::${index}`) || !scenario.scenarioId) return [];
    const scenarioValues = overrides[scenario.scenarioId] ?? {};
    return (scenario.inputRequirements ?? []).filter(field => field.required && !String(scenarioValues[field.key] ?? '').trim())
      .map(field => ({ scenarioTitle: scenario.title, label: field.label, stepIndex: field.stepIndex }));
  }));
}

/** Stale or over-broad API privacy metadata must never mask non-password inputs. */
export function jiraInputHtmlType(field: JiraInputRequirement): string {
  if (field.operation === 'select' || field.controlType === 'select') return 'text';
  if (/\bcontrase(?:ñ|n)a\b|\bpassword\b/i.test(field.label.normalize('NFKC'))) return 'password';
  return field.controlType === 'password' ? 'text' : field.controlType;
}

export function JiraStepInputs({ fields, values, onChange }: {
  fields: JiraInputRequirement[];
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string) => void;
}) {
  return <div className="mt-2 space-y-2">{fields.map(field => <label key={field.key} className="block text-[11px] text-white/70">
    {field.label}{field.required ? ' *' : ''}
    <input aria-label={`Dato para ${field.label}`} type={jiraInputHtmlType(field)}
      value={String(values[field.key] ?? '')} onChange={event => onChange(field.key, event.target.value)}
      disabled={!field.editable} autoComplete="off" required={field.required}
      placeholder={field.operation === 'select' ? 'Valor de la opción a seleccionar' : 'Dato de prueba'}
      className="mt-1 block w-full rounded-lg border border-white/20 bg-black/30 px-2.5 py-1.5 text-white focus:outline-none focus:border-[#5EC470]" />
    {field.dataCondition && <span className="mt-1 block text-white/70">{field.dataCondition === 'invalid' ? 'Usar un dato no válido para provocar el rechazo.' : field.dataCondition === 'expired' ? 'Usar un dato vencido para este paso.' : 'Usar un dato válido para completar este paso.'}</span>}
  </label>)}</div>;
}

/** Selection indices refer to the original story collection, never the filtered execution order. */
export function buildJiraDataOverrides(stories: Story[], selected: string[], values: Record<string, Record<string, string | boolean>>, common: JiraCommonValues = {}) {
  const result: Record<string, Record<string, string>> = {};
  for (const story of stories) for (const [index, scenario] of story.scenarios.entries()) {
    const selectionKey = `${story.jiraKey}::${index}`;
    if (!selected.includes(selectionKey) || !scenario.scenarioId) continue;
    const allowed = new Set((scenario.inputRequirements ?? []).map(field => field.key));
    // Preserve legacy requirement controls while using the canonical scenario ID for transport.
    for (const field of scenario.dataRequirements ?? []) allowed.add(field.key);
    const scoped = Object.fromEntries(Object.entries(resolveJiraScenarioValues(story, index, values[selectionKey] ?? {}, common))
      .filter(([key, value]) => allowed.has(key) && String(value).trim() !== '')
      .map(([key, value]) => [key, String(value)]));
    if (Object.keys(scoped).length) result[scenario.scenarioId] = scoped;
  }
  return result;
}
