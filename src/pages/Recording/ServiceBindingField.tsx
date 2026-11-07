import { useState } from 'react';
import { KeyRound, Sparkles } from 'lucide-react';
import type { BindingParamValue, ServiceBindingsView } from '../../services/service-catalog';
import { describeBindingParams, type FieldServiceEntry } from './service-binding-ui';

type EnabledService = ServiceBindingsView['enabledServices'][number];

const SELECT_CLS = 'w-full px-2 py-1 rounded border border-[#D9E2EC] bg-white text-[11px] outline-none focus:border-[#104B99]';
const LINK_CLS = 'text-[10px] font-semibold text-[#104B99] hover:underline disabled:opacity-50';

/** Editor state: each param as a literal or (for field_ref params) another field of the scenario. */
type ParamDraft = Record<string, { fromKey?: string; value: string }>;

function draftFrom(params: Record<string, BindingParamValue> | undefined): ParamDraft {
  const draft: ParamDraft = {};
  for (const [key, param] of Object.entries(params ?? {})) {
    if (typeof param === 'string') draft[key] = { value: param };
    else if ('fromKey' in param) draft[key] = { fromKey: param.fromKey, value: '' };
    else draft[key] = { value: param.value };
  }
  return draft;
}

function paramsFrom(draft: ParamDraft, service: EnabledService): Record<string, BindingParamValue> {
  const params: Record<string, BindingParamValue> = {};
  for (const definition of service.params) {
    const entry = draft[definition.key];
    if (entry?.fromKey) params[definition.key] = { fromKey: entry.fromKey };
    else if (entry?.value.trim()) params[definition.key] = definition.kind === 'field_ref' ? { value: entry.value.trim() } : entry.value.trim();
  }
  return params;
}

/**
 * Next to one field of "Datos de este escenario": which catalog service fills it, from
 * where (the recording's general form or this scenario), and the editor to change it.
 */
export function ServiceBindingField({
  entry,
  services,
  identityOptions,
  labelFor,
  offerService,
  busy,
  onApply,
  onTypeByHand,
  onInherit,
  onRemoveGeneral,
}: {
  entry?: FieldServiceEntry;
  services: EnabledService[];
  identityOptions: Array<{ key: string; label: string }>;
  labelFor: (valueKey: string) => string;
  /** Show "Llenar con un servicio" even without a suggestion (sensitive fields). */
  offerService: boolean;
  busy: boolean;
  onApply: (scope: 'general' | 'scenario', serviceKey: string, params: Record<string, BindingParamValue>) => void;
  onTypeByHand: () => void;
  onInherit: () => void;
  onRemoveGeneral: () => void;
}) {
  const effective = entry?.effective ?? null;
  const suggestion = entry?.suggestion ?? null;
  const [editing, setEditing] = useState(false);
  const [serviceKey, setServiceKey] = useState('');
  const [draft, setDraft] = useState<ParamDraft>({});
  const [scope, setScope] = useState<'general' | 'scenario'>('general');

  if (services.length === 0 && !effective) return null;
  const serviceName = (key: string | null) => services.find((service) => service.key === key)?.name ?? key ?? '';
  const selected = services.find((service) => service.key === serviceKey);

  const openEditor = (initial: { serviceKey: string; params?: Record<string, BindingParamValue>; scope: 'general' | 'scenario' }) => {
    setServiceKey(initial.serviceKey);
    setDraft(draftFrom(initial.params));
    setScope(initial.scope);
    setEditing(true);
  };

  if (editing) {
    const missingRequired = selected?.params.some((param) => param.required && !draft[param.key]?.fromKey && !draft[param.key]?.value.trim());
    return (
      <div className="mt-1.5 rounded-lg border border-[#104B99]/30 bg-white p-2 space-y-1.5">
        <label className="block text-[10px] text-[#58646D]">
          Servicio
          <select className={SELECT_CLS} value={serviceKey} onChange={(event) => { setServiceKey(event.target.value); setDraft({}); }}>
            {services.map((service) => <option key={service.key} value={service.key}>{service.name}</option>)}
          </select>
        </label>
        {selected?.params.map((param) => {
          const current = draft[param.key] ?? { value: '' };
          const setParam = (next: { fromKey?: string; value: string }) => setDraft((previous) => ({ ...previous, [param.key]: next }));
          return (
            <label key={param.key} className="block text-[10px] text-[#58646D]" title={param.description}>
              {param.label}{param.required ? ' · Requerido' : ''}
              {param.kind === 'field_ref' ? (
                <>
                  <select
                    className={SELECT_CLS}
                    value={current.fromKey ?? '__fixed__'}
                    onChange={(event) => setParam(event.target.value === '__fixed__' ? { value: '' } : { fromKey: event.target.value, value: '' })}
                  >
                    {identityOptions.map((option) => <option key={option.key} value={option.key}>Campo: {option.label}</option>)}
                    <option value="__fixed__">Valor fijo…</option>
                  </select>
                  {!current.fromKey && (
                    <input className={SELECT_CLS + ' mt-1'} value={current.value} placeholder="Valor fijo" onChange={(event) => setParam({ value: event.target.value })} />
                  )}
                </>
              ) : param.kind === 'select' ? (
                <select className={SELECT_CLS} value={current.value} onChange={(event) => setParam({ value: event.target.value })}>
                  <option value="">Por defecto</option>
                  {(param.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input className={SELECT_CLS} value={current.value} placeholder={param.description ?? ''} onChange={(event) => setParam({ value: event.target.value })} />
              )}
            </label>
          );
        })}
        <div className="flex flex-wrap gap-3 text-[10px] text-[#1a1f2e]">
          <label className="flex items-center gap-1"><input type="radio" checked={scope === 'general'} onChange={() => setScope('general')} /> Todos los escenarios de la grabación</label>
          <label className="flex items-center gap-1"><input type="radio" checked={scope === 'scenario'} onChange={() => setScope('scenario')} /> Solo este escenario</label>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={LINK_CLS} onClick={() => setEditing(false)}>Cancelar</button>
          <button
            type="button"
            disabled={busy || !selected || missingRequired}
            onClick={() => { if (selected) { onApply(scope, selected.key, paramsFrom(draft, selected)); setEditing(false); } }}
            className="rounded-full bg-[#1a1f2e] px-3 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  if (effective?.serviceKey) {
    const fromGeneral = effective.origin === 'general';
    return (
      <div className="mt-1.5 rounded-lg border border-[#48A157]/30 bg-[#48A157]/8 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[#2F7A3D]">
          <KeyRound size={11} />
          <span className="font-semibold">{serviceName(effective.serviceKey)}</span>
          <span>llena este campo al ejecutar</span>
          <span className={'rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] ' + (fromGeneral ? 'bg-[#EEF2F8] text-[#104B99]' : 'bg-[#F3EEFF] text-[#7656A6]')}>
            {fromGeneral ? 'Formulario general' : 'Solo este escenario'}
          </span>
        </div>
        {describeBindingParams(effective.params, labelFor) && (
          <div className="mt-0.5 text-[10px] text-[#58646D]">{describeBindingParams(effective.params, labelFor)}</div>
        )}
        <div className="mt-1 flex flex-wrap gap-3">
          <button type="button" className={LINK_CLS} disabled={busy}
            onClick={() => openEditor({ serviceKey: effective.serviceKey!, params: effective.params, scope: fromGeneral ? 'general' : 'scenario' })}>
            Cambiar
          </button>
          {fromGeneral ? (
            <>
              <button type="button" className={LINK_CLS} disabled={busy} onClick={onTypeByHand}>Escribir a mano en este escenario</button>
              <button type="button" className={LINK_CLS} disabled={busy} onClick={onRemoveGeneral}>Quitar de todos los escenarios</button>
            </>
          ) : (
            <button type="button" className={LINK_CLS} disabled={busy} onClick={onInherit}>Volver al formulario general</button>
          )}
        </div>
      </div>
    );
  }

  if (effective?.origin === 'manual') {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[#58646D]">
        <span>Este escenario escribe el valor a mano; el formulario general usa un servicio.</span>
        <button type="button" className={LINK_CLS} disabled={busy} onClick={onInherit}>Usar el servicio otra vez</button>
      </div>
    );
  }

  if (suggestion) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-[#E9A23B]/30 bg-[#E9A23B]/8 px-2 py-1.5 text-[10.5px] text-[#8A5A12]">
        <Sparkles size={11} />
        <span>{suggestion.reason} ¿Lo llena {serviceName(suggestion.serviceKey)}?</span>
        <button type="button" className={LINK_CLS} disabled={busy}
          onClick={() => openEditor({ serviceKey: suggestion.serviceKey, params: suggestion.params, scope: 'general' })}>
          Usar servicio
        </button>
      </div>
    );
  }

  if (!offerService) return null;
  return (
    <button type="button" className={LINK_CLS + ' mt-1'} disabled={busy} onClick={() => openEditor({ serviceKey: services[0].key, scope: 'general' })}>
      Llenar con un servicio
    </button>
  );
}
