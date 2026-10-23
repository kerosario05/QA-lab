import { useEffect, useState } from 'react';
import { Key, Plus, Trash2 } from 'lucide-react';
import type { TestDesignDatum } from '../../services/test-design';
import { hasPlaceholders, isSensitiveKey, textParts } from './scenario-utils';
import { matchProjectDataCatalogs, projectDataCatalogApi, type ProjectDataCatalog } from '../../services/project-data-catalog';

/**
 * Dark editor pieces for test data: a rendered line showing {{key}} as a value chip, and the
 * case's "Datos de prueba" block (one field per datum, auto-created from the {{keys}} in the texts).
 */

const darkInput =
  'w-full px-3 py-2 rounded-lg border border-[#2A3140] bg-[#171C26] text-[12px] text-[#E6E9EF] outline-none focus:border-[#4C8DF6] disabled:opacity-60 placeholder:text-[#5B6678]';

/** The text as it will read once filled: values appear as chips, missing ones as amber {{keys}}. */
export function DataPreview({ text, data }: { text: string; data: TestDesignDatum[] }) {
  if (!hasPlaceholders(text)) return null;
  return (
    <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-[#171C26] border border-[#232A38] text-[11px] text-[#AEB7C4] leading-6">
      {textParts(text, data).map((part, i) => {
        if (part.key === undefined) return <span key={i}>{part.text}</span>;
        const datum = part.datum;
        const shown = !datum?.value ? part.text : datum.sensitive ? '••••••' : datum.value;
        const ready = !!datum?.value;
        return (
          <span
            key={i}
            className={
              'inline-flex items-center gap-1 px-1.5 rounded-md font-semibold align-baseline ' +
              (ready ? 'bg-[#12301E] text-[#7DD3A0] border border-[#2F7D46]' : 'bg-[#2B2410] text-[#E0B84C] border border-[#5B4B1A]')
            }
          >
            <Key size={9} /> {shown}
          </span>
        );
      })}
    </div>
  );
}

export function CaseDataPanel({
  data,
  readOnly,
  onChange,
  projectSlug,
}: {
  data: TestDesignDatum[];
  readOnly: boolean;
  onChange: (next: TestDesignDatum[]) => void;
  projectSlug?: string;
}) {
  const [newKey, setNewKey] = useState('');
  const [catalogs, setCatalogs] = useState<ProjectDataCatalog[]>([]);
  useEffect(() => {
    let active = true;
    if (!projectSlug) { setCatalogs([]); return; }
    projectDataCatalogApi.list(projectSlug).then(value => { if (active) setCatalogs(value); }).catch(() => { if (active) setCatalogs([]); });
    return () => { active = false; };
  }, [projectSlug]);
  useEffect(() => {
    if (readOnly || catalogs.length === 0) return;
    let changed = false;
    const next = data.map(datum => {
      if (datum.sensitive || isSensitiveKey(datum.key) || isSensitiveKey(datum.label ?? '')) {
        if (!datum.catalogBinding) return datum;
        changed = true;
        const { catalogBinding: _sensitiveBinding, ...safeDatum } = datum;
        return safeDatum;
      }
      if (datum.catalogBinding) return datum;
      const matches = matchProjectDataCatalogs(datum.label ?? datum.key, catalogs);
      if (matches.length !== 1) return datum;
      const options = matches[0].options.filter(option => option.active);
      if (!options.length) return datum;
      const selectedOption = datum.value ? options.find(option => option.value === datum.value) : options[0];
      if (!selectedOption) return datum;
      changed = true;
      return { ...datum, value: selectedOption.value, catalogBinding: { catalogId: matches[0].id, optionId: selectedOption.id, revision: matches[0].revision, mode: 'automatic' as const } };
    });
    if (changed) onChange(next);
  }, [catalogs, data, onChange, readOnly]);
  const update = (index: number, patch: Partial<TestDesignDatum>) =>
    onChange(data.map((datum, i) => (i === index ? { ...datum, ...patch } : datum)));
  const add = () => {
    const key = newKey.trim();
    if (!key || data.some((d) => d.key.toLowerCase() === key.toLowerCase())) return;
    onChange([...data, { key, value: '', sensitive: false, description: '' }]);
    setNewKey('');
  };

  return (
    <div className="rounded-xl border border-[#5B4B1A] bg-[#1A1810] p-3">
      <div className="flex items-center gap-2 text-[11px]">
        <Key size={12} className="text-[#E0B84C]" />
        <span className="font-semibold text-[#E6E9EF]">Datos de prueba</span>
        <span className="text-[#8B99A6]">
          Completa los valores que el caso necesita. En los pasos se ven como{' '}
          <code className="px-1 rounded bg-[#2B2410] text-[#E0B84C]">{'{{clave}}'}</code>.
        </span>
      </div>

      <div className="mt-2 space-y-2">
        {data.map((datum, index) => {
          const catalogEligible = !datum.sensitive && !isSensitiveKey(datum.key) && !isSensitiveKey(datum.label ?? '');
          const matches = catalogEligible ? matchProjectDataCatalogs(datum.label ?? datum.key, catalogs) : [];
          const available = catalogEligible ? catalogs.filter(catalog => catalog.active) : [];
          const binding = catalogEligible && datum.catalogBinding ? catalogs.find(catalog => catalog.id === datum.catalogBinding?.catalogId) : undefined;
          const sensitive = datum.sensitive || isSensitiveKey(datum.key) || isSensitiveKey(datum.label ?? '');
          return (
          <div key={datum.key} className="grid grid-cols-[minmax(110px,0.85fr)_minmax(125px,1fr)_minmax(145px,1.4fr)_auto_auto] gap-3 items-start">
            <div>
              <div className="text-[12px] font-semibold text-[#E6E9EF]">
                {datum.label ?? datum.key}
                {datum.condition === 'invalid' && <span className="ml-1 font-normal text-[#E58B82]">(inválido)</span>}
                {datum.condition === 'expired' && <span className="ml-1 font-normal text-[#E58B82]">(vencido)</span>}
              </div>
              {datum.description && <div className="text-[10px] text-[#8B99A6]">{datum.description}</div>}
            </div>
            <div className="min-w-0">
              <select className={darkInput} disabled={readOnly || !catalogEligible || available.length === 0} value={binding?.id ?? ''} aria-label={`Catálogo de ${datum.label ?? datum.key}`} onChange={event => {
                const catalog = available.find(item => item.id === event.target.value);
                const firstOption = catalog?.options.find(option => option.active);
                update(index, { value: firstOption?.value ?? '', catalogBinding: catalog ? { catalogId: catalog.id, optionId: firstOption?.id, revision: catalog.revision, mode: matches.length === 1 && matches[0].id === catalog.id ? 'automatic' : 'manual' } : undefined });
              }}>
                <option value="">{matches.length > 1 ? 'Asociar catálogo…' : 'Valor manual'}</option>
                {available.map(catalog => <option key={catalog.id} value={catalog.id}>{catalog.name} · {catalog.fieldName}</option>)}
              </select>
              {sensitive && <span className="mt-1 block text-[9px] leading-tight text-[#A99662]">Por seguridad, los datos sensibles no usan catálogos.</span>}
            </div>
            <div className="min-w-0">
              {binding ? <select className={darkInput} disabled={readOnly} value={datum.catalogBinding?.optionId ?? ''} aria-label={`Opción para ${datum.label ?? datum.key}`} onChange={event => {
                const option = binding.options.find(item => item.id === event.target.value && item.active);
                update(index, { value: option?.value ?? '', catalogBinding: { catalogId: binding.id, optionId: option?.id, revision: binding.revision, mode: datum.catalogBinding?.mode ?? 'manual' } });
              }}><option value="">Selecciona valor…</option>{binding.options.filter(option => option.active).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <input
              type={datum.sensitive ? 'password' : 'text'}
              autoComplete="off"
              value={datum.value}
              disabled={readOnly}
              onChange={(e) => update(index, { value: e.target.value, catalogBinding: undefined })}
              placeholder="Ingresa el valor"
              className={
                darkInput + (datum.value ? ' !bg-[#12261A] !border-[#2F7D46]' : ' !bg-[#221D0E] !border-[#5B4B1A]')
              }
            />}
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-[#8B99A6]">
              <input
                type="checkbox"
                checked={datum.sensitive}
                disabled={readOnly}
                onChange={(e) => update(index, { sensitive: e.target.checked, ...(e.target.checked ? { catalogBinding: undefined } : {}) })}
              />
              Sensible
            </label>
            {!readOnly && (
              <button
                type="button"
                title="Quitar dato"
                aria-label={`Quitar ${datum.label ?? datum.key}`}
                onClick={() => onChange(data.filter((_, i) => i !== index))}
                className="text-[#8B99A6] hover:text-[#E58B82]"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Nuevo dato, p. ej. Número de cuenta"
            className={darkInput}
          />
          <button
            type="button"
            onClick={add}
            disabled={!newKey.trim()}
            className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[#8B99A6] enabled:text-[#4C8DF6] enabled:hover:underline"
          >
            <Plus size={12} /> Agregar dato
          </button>
        </div>
      )}
    </div>
  );
}
