import { AlertTriangle, KeyRound, Sparkles } from 'lucide-react';
import type { BindingParamValue, ServiceBinding, ServiceBindingsView } from '../../services/service-catalog';
import { describeBindingParams } from './service-binding-ui';

export type PendingSuggestion = {
  keys: string[];
  label: string;
  serviceKey: string;
  params: Record<string, BindingParamValue>;
};

/** General bindings shown once per code: the digits of a group collapse into their first key. */
function groupGeneral(bindings: ServiceBinding[]): Array<{ keys: string[]; binding: ServiceBinding }> {
  const groups = new Map<string, { keys: string[]; binding: ServiceBinding }>();
  for (const binding of bindings) {
    if (!binding.serviceKey) continue;
    const id = binding.segment?.group ?? binding.targetValueKey;
    const group = groups.get(id) ?? { keys: [], binding };
    group.keys.push(binding.targetValueKey);
    if (!binding.segment || binding.segment.position === 1) group.binding = binding;
    groups.set(id, group);
  }
  return [...groups.values()];
}

/**
 * "Servicios del flujo": the catalog services the recording's general form binds (they
 * apply to every scenario unless one overrides them), plus a one-click way to accept the
 * engine's suggestions for fields that look like a one-time code.
 */
export function RecordingServicesPanel({
  view,
  pendingSuggestions,
  labelFor,
  busy,
  error,
  onAcceptSuggestions,
  onRemove,
}: {
  view: ServiceBindingsView;
  pendingSuggestions: PendingSuggestion[];
  labelFor: (valueKey: string) => string;
  busy: boolean;
  error: string | null;
  onAcceptSuggestions: () => void;
  onRemove: (keys: string[]) => void;
}) {
  const general = groupGeneral(view.general);
  if (view.enabledServices.length === 0 && general.length === 0) return null;
  const serviceName = (key: string | null) => view.enabledServices.find((service) => service.key === key)?.name ?? key ?? '';

  return (
    <div className="mb-3 rounded-lg border border-[#E3EAF2] bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[#104B99] font-semibold">
        <KeyRound size={12} /> Servicios del flujo
      </div>
      <p className="mt-0.5 text-[10.5px] text-[#58646D]">
        Llenan un campo al ejecutar, en todos los escenarios de esta grabación. Cada escenario puede cambiarlo en sus datos.
      </p>

      {general.length === 0 ? (
        <div className="mt-1.5 text-[10.5px] text-[#8B999D]">Ningún campo usa un servicio todavía.</div>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {general.map(({ keys, binding }) => (
            <li key={keys.join('|')} className="flex flex-wrap items-center gap-2 rounded bg-[#F6F9FC] px-2 py-1 text-[11px]">
              <span className="font-medium text-[#1a1f2e]">{labelFor(keys[0])}</span>
              <span className="text-[#58646D]">← {serviceName(binding.serviceKey)}</span>
              {describeBindingParams(binding.params, labelFor) && (
                <span className="text-[10px] text-[#8B999D]">{describeBindingParams(binding.params, labelFor)}</span>
              )}
              <button type="button" disabled={busy} onClick={() => onRemove(keys)}
                className="ml-auto text-[10px] font-semibold text-[#B4463C] hover:underline disabled:opacity-50">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#E9A23B]/30 bg-[#E9A23B]/8 px-2 py-1.5 text-[10.5px] text-[#8A5A12]">
          <Sparkles size={11} />
          <span>
            {pendingSuggestions.length === 1
              ? `"${pendingSuggestions[0].label}" parece un código OTP sin servicio.`
              : `${pendingSuggestions.length} campos parecen códigos OTP sin servicio.`}
          </span>
          <button type="button" disabled={busy} onClick={onAcceptSuggestions}
            className="rounded-full bg-[#1a1f2e] px-3 py-1 text-[10px] font-semibold text-white disabled:opacity-50">
            Usar {serviceName(pendingSuggestions[0].serviceKey)} en todos los escenarios
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#B4463C]"><AlertTriangle size={11} /> {error}</div>
      )}
    </div>
  );
}
