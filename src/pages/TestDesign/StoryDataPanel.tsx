import { Key, Lock } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { cn } from '../../constants/theme';
import type { TestDesignScenario } from '../../services/test-design';
import { applyStoryDatum, groupStoryData } from './scenario-utils';

/** Test data the cases of one story need; typing here fills every case that uses the datum. */
export function StoryDataPanel({
  scenarios,
  readOnly,
  onChange,
}: {
  scenarios: TestDesignScenario[];
  readOnly: boolean;
  onChange: (next: TestDesignScenario[]) => void;
}) {
  const groups = groupStoryData(scenarios);
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
        {groups.map((group) => (
          <label key={group.id} className="block">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1a1f2e]">
              {group.sensitive && <Lock size={11} className="text-[#8B999D]" />}
              {group.key}
              <span className="font-normal text-[#8B999D]">
                {group.condition === 'invalid' ? '(inválido)' : group.condition === 'expired' ? '(vencido)' : ''} · {group.cases}{' '}
                {group.cases === 1 ? 'caso' : 'casos'}
              </span>
            </span>
            {group.description && <span className="block text-[10px] text-[#8B999D]">{group.description}</span>}
            <input
              type={group.sensitive ? 'password' : 'text'}
              autoComplete="off"
              value={group.value}
              disabled={readOnly}
              onChange={(e) => onChange(applyStoryDatum(scenarios, group.id, e.target.value))}
              placeholder={group.mixed ? 'Valores distintos por caso' : 'Ingresa el valor'}
              className={cn(
                'mt-1 w-full px-3 py-2 rounded-lg border text-[12px] outline-none focus:border-[#104B99] disabled:opacity-60',
                group.value ? 'bg-[#F1F8F2] border-[#48A157]' : 'bg-[#FFFAF0] border-[#E9CF9A]',
              )}
            />
          </label>
        ))}
      </div>
    </BentoCard>
  );
}
