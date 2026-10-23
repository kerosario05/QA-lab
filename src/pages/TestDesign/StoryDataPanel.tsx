import { useEffect, useState } from 'react';
import { Key, Lock } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { cn } from '../../constants/theme';
import type { TestDesignScenario } from '../../services/test-design';
import { applyStoryDatum, groupStoryData, isSensitiveKey } from './scenario-utils';
import { matchProjectDataCatalogs, projectDataCatalogApi, type ProjectDataCatalog } from '../../services/project-data-catalog';

/** Test data the cases of one story need; typing here fills every case that uses the datum. */
export function StoryDataPanel({
  scenarios,
  readOnly,
  onChange,
  projectSlug,
}: {
  scenarios: TestDesignScenario[];
  readOnly: boolean;
  onChange: (update: TestDesignScenario[] | ((current: TestDesignScenario[]) => TestDesignScenario[])) => void;
  projectSlug?: string;
}) {
  const groups = groupStoryData(scenarios);
  const [catalogs, setCatalogs] = useState<ProjectDataCatalog[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Record<string, string>>({});
  const [manualGroups, setManualGroups] = useState<Record<string, boolean>>({});
  const needsAutomaticValue = groups.some(group => {
    if (group.sensitive || isSensitiveKey(group.key) || group.mixed || group.value) return false;
    const matches = matchProjectDataCatalogs(group.key, catalogs);
    return matches.length === 1 && matches[0].options.some(option => option.active);
  });
  useEffect(() => {
    let active = true;
    if (!projectSlug) { setCatalogs([]); return; }
    projectDataCatalogApi.list(projectSlug).then(value => { if (active) setCatalogs(value); }).catch(() => { if (active) setCatalogs([]); });
    return () => { active = false; };
  }, [projectSlug]);
  useEffect(() => {
    if (readOnly || catalogs.length === 0 || !needsAutomaticValue) return;
    onChange(current => {
      let next = current;
      for (const group of groupStoryData(current)) {
        if (group.sensitive || group.mixed || group.value) continue;
        const matches = matchProjectDataCatalogs(group.key, catalogs);
        if (matches.length !== 1) continue;
        const firstOption = matches[0].options.find(option => option.active);
        if (firstOption) next = applyStoryDatum(next, group.id, firstOption.value);
      }
      return next;
    });
  }, [catalogs, needsAutomaticValue, onChange, readOnly, scenarios]);
  if (groups.length === 0) return null;
  const pending = groups.filter((g) => !g.value && !g.mixed).length;

  return (
    <BentoCard>
      <div className="flex items-center gap-2">
        <Key size={14} className="text-[#B7791F]" />
        <h3 className="text-[13px] font-semibold text-[#1a1f2e]">Datos de prueba de la historia</h3>
        {pending > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#FFF4D6] text-[#B7791F] text-[10px] font-semibold">
            {pending} por completar
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#58646D]">
        La IA detectó estos valores en los escenarios. Lo que escribas aquí se aplica a todos los casos que usan el dato;
        también puedes cambiarlo en cada escenario. Los valores se conservan en QA Lab; TestRail recibe los pasos sin los datos de prueba.
      </p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map((group) => {
          const sensitive = group.sensitive || isSensitiveKey(group.key);
          const matches = sensitive ? [] : matchProjectDataCatalogs(group.key, catalogs);
          const selectedCatalogId = selectedCatalogIds[group.id] || (matches.length === 1 ? matches[0].id : '');
          const boundCatalog = matches.find(catalog => catalog.id === selectedCatalogId);
          const options = boundCatalog?.options.filter(option => option.active) ?? [];
          const hasCurrentOption = options.some(option => option.value === group.value);
          return (
          <label key={group.id} className="block min-w-0">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1a1f2e]">
              {sensitive && <Lock size={11} className="text-[#8B999D]" />}
              {group.key}
              <span className="font-normal text-[#8B999D]">
                {group.condition === 'invalid' ? '(inválido)' : group.condition === 'expired' ? '(vencido)' : ''} · {group.cases}{' '}
                {group.cases === 1 ? 'caso' : 'casos'}
              </span>
            </span>
            {group.description && <span className="block text-[10px] text-[#8B999D]">{group.description}</span>}
            {!sensitive && matches.length > 1 && (
              <select className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E9CF9A] bg-white text-[12px]" value={selectedCatalogId} disabled={readOnly} aria-label={`Catálogo de ${group.key}`} onChange={event => {
                setSelectedCatalogIds(current => ({ ...current, [group.id]: event.target.value }));
                setManualGroups(current => ({ ...current, [group.id]: false }));
                const catalog = matches.find(item => item.id === event.target.value);
                const first = catalog?.options.find(option => option.active);
                if (first) onChange(current => applyStoryDatum(current, group.id, first.value));
              }}><option value="">Valor manual</option>{matches.map(catalog => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}</select>
            )}
            {boundCatalog && !manualGroups[group.id] ? (
              <select className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E9CF9A] bg-white text-[12px] disabled:opacity-60" data-field-capability="project_catalog" value={hasCurrentOption ? group.value : ''} disabled={readOnly} aria-label={`Opción de ${group.key}`} onChange={event => onChange(current => applyStoryDatum(current, group.id, event.target.value))}>
                {!hasCurrentOption && <option value="">{group.mixed ? 'Valores distintos por caso' : group.value || 'Selecciona un valor…'}</option>}
                {options.map(option => <option key={option.id} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
              type={sensitive ? 'password' : 'text'}
                autoComplete="off"
                value={group.value}
                disabled={readOnly}
                onChange={(e) => onChange(current => applyStoryDatum(current, group.id, e.target.value))}
                placeholder={group.mixed ? 'Valores distintos por caso' : 'Ingresa el valor'}
                className={cn(
                  'mt-1 w-full px-3 py-2 rounded-lg border text-[12px] outline-none focus:border-[#104B99] disabled:opacity-60',
                  group.value ? 'bg-[#F1F8F2] border-[#48A157]' : 'bg-[#FFFAF0] border-[#E9CF9A]',
                )}
              />
            )}
            {boundCatalog && !sensitive && <button type="button" className="mt-1 text-[10px] text-[#58646D] hover:underline" disabled={readOnly} onClick={() => setManualGroups(current => ({ ...current, [group.id]: !current[group.id] }))}>{manualGroups[group.id] ? 'Usar catálogo' : 'Usar valor manual'}</button>}
            {sensitive && <span className="mt-1 block text-[9px] text-[#8B999D]">Por seguridad, los datos sensibles no usan catálogos.</span>}
          </label>
          );
        })}
      </div>
    </BentoCard>
  );
}
