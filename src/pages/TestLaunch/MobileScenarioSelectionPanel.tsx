import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../constants/theme';
import type { MobileScenario } from '../../services/mobile';

type SelectionState = 'all' | 'partial' | 'none';

interface MobileIssueGroup {
  issueKey: string;
  issueTitle: string | null;
  scenarios: MobileScenario[];
}

interface MobileScenarioSelectionPanelProps {
  mobileScenarios: MobileScenario[];
  selectedMobileScenarioIds: string[];
  expandedMobileIssueKeys: string[];
  setExpandedMobileIssueKeys: React.Dispatch<React.SetStateAction<string[]>>;
  mobileDataValues: Record<string, Record<number, string>>;
  setMobileFieldValue: (scenarioId: string, stepIndex: number, value: string) => void;
  toggleMobileScenario: (scenarioId: string) => void;
  setSelectedMobileScenarioIds: React.Dispatch<React.SetStateAction<string[]>>;
}

function readIssueTitle(scenario: MobileScenario): string | null {
  const maybeSummary =
    scenario.sourceIssueSummary ??
    scenario.sourceIssueTitle ??
    scenario.sourceTrace?.jiraSummary;
  if (typeof maybeSummary !== 'string') return null;
  const trimmed = maybeSummary.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getIssueGroupSelectionState(group: MobileIssueGroup, selectedIds: Set<string>): SelectionState {
  const total = group.scenarios.length;
  if (total === 0) return 'none';
  const selected = group.scenarios.filter((scenario) => selectedIds.has(scenario.scenarioId)).length;
  if (selected === 0) return 'none';
  if (selected === total) return 'all';
  return 'partial';
}

export function MobileScenarioSelectionPanel({
  mobileScenarios,
  selectedMobileScenarioIds,
  expandedMobileIssueKeys,
  setExpandedMobileIssueKeys,
  mobileDataValues,
  setMobileFieldValue,
  toggleMobileScenario,
  setSelectedMobileScenarioIds,
}: MobileScenarioSelectionPanelProps) {
  const [expandedScenarioIds, setExpandedScenarioIds] = useState<string[]>([]);

  const selectedIdSet = useMemo(() => new Set(selectedMobileScenarioIds), [selectedMobileScenarioIds]);

  const issueGroups = useMemo<MobileIssueGroup[]>(() => {
    const grouped = new Map<string, MobileIssueGroup>();
    for (const scenario of mobileScenarios) {
      const issueKey = String(scenario.sourceIssueKey ?? '').trim() || 'SIN-ISSUE-KEY';
      const existing = grouped.get(issueKey);
      if (!existing) {
        grouped.set(issueKey, {
          issueKey,
          issueTitle: readIssueTitle(scenario),
          scenarios: [scenario],
        });
        continue;
      }
      if (!existing.issueTitle) {
        existing.issueTitle = readIssueTitle(scenario);
      }
      existing.scenarios.push(scenario);
    }
    return Array.from(grouped.values());
  }, [mobileScenarios]);

  const allMobileScenarioIds = useMemo(
    () => issueGroups.flatMap((group) => group.scenarios.map((scenario) => scenario.scenarioId)),
    [issueGroups],
  );

  const allSelected = allMobileScenarioIds.length > 0 && selectedMobileScenarioIds.length === allMobileScenarioIds.length;

  const toggleAllScenarios = () => {
    setSelectedMobileScenarioIds(allSelected ? [] : allMobileScenarioIds);
  };

  const toggleIssueSelection = (group: MobileIssueGroup) => {
    const state = getIssueGroupSelectionState(group, selectedIdSet);
    const issueIds = group.scenarios.map((scenario) => scenario.scenarioId);
    setSelectedMobileScenarioIds((prev) => {
      if (state === 'all') {
        return prev.filter((scenarioId) => !issueIds.includes(scenarioId));
      }
      const next = new Set(prev);
      for (const scenarioId of issueIds) {
        next.add(scenarioId);
      }
      return Array.from(next);
    });
  };

  const toggleIssueExpanded = (issueKey: string) => {
    setExpandedMobileIssueKeys((prev) =>
      prev.includes(issueKey) ? prev.filter((key) => key !== issueKey) : [...prev, issueKey],
    );
  };

  const toggleScenarioExpanded = (scenarioId: string) => {
    setExpandedScenarioIds((prev) =>
      prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId],
    );
  };

  return (
    <div className="p-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-1">Paso cuatro · Selecciona los escenarios</div>
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h2 className="text-[22px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
            {mobileScenarios.length > 0
              ? <><span className="text-[#104B99]">{mobileScenarios.length}</span> escenarios · <span className="text-[#58646D] text-[18px]">{issueGroups.length} historias</span></>
              : 'Sin escenarios para este filtro'}
          </h2>
        </div>
        {mobileScenarios.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#8B999D]">
              <span className="font-semibold text-[#104B99]">{selectedMobileScenarioIds.length}</span> de {mobileScenarios.length} seleccionados
            </span>
            <button
              type="button"
              onClick={toggleAllScenarios}
              className="text-[11px] font-semibold text-[#104B99] hover:underline"
            >
              {allSelected ? 'Limpiar' : 'Seleccionar todos'}
            </button>
          </div>
        )}
      </div>

      {mobileScenarios.length > 0 && (
        <div className="max-h-[520px] overflow-y-auto divide-y divide-[#F4F1EA] border border-[#E8EBEC] rounded-2xl">
          {issueGroups.map((group) => {
            const issueSelectionState = getIssueGroupSelectionState(group, selectedIdSet);
            const issueExpanded = expandedMobileIssueKeys.includes(group.issueKey);
            return (
              <div key={group.issueKey}>
                <div className={cn(
                  'flex items-center gap-3 px-6 py-3 bg-[#FAFAF9] border-b border-[#F4F1EA]',
                  issueSelectionState !== 'none' && 'bg-[#104B99]/3',
                )}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={issueSelectionState === 'partial' ? 'mixed' : issueSelectionState === 'all'}
                    aria-label={`Seleccionar historia ${group.issueKey}`}
                    onClick={() => toggleIssueSelection(group)}
                    className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104B99] focus-visible:ring-offset-2',
                      issueSelectionState === 'all' ? 'border-[#104B99] bg-[#104B99]' :
                      issueSelectionState === 'partial' ? 'border-[#104B99]' :
                      'border-[#BABEC3] hover:border-[#104B99]',
                    )}
                  >
                    {issueSelectionState === 'all' && <Check size={10} className="text-white" strokeWidth={3} />}
                    {issueSelectionState === 'partial' && <div className="w-1.5 h-0.5 bg-[#104B99] rounded-full" />}
                  </button>

                  <span className={cn(
                    'inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0',
                    issueSelectionState !== 'none' ? 'bg-[#104B99] text-white' : 'bg-[#E8EBEC] text-[#58646D]',
                  )}>
                    {group.issueKey}
                  </span>

                  <span className="flex-1 text-[13px] font-semibold text-[#1a1f2e]">
                    {group.issueTitle ?? 'Historia sin título disponible'}
                  </span>

                  <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-2 py-0.5 rounded flex-shrink-0">
                    {group.scenarios.length} esc.
                  </span>

                  <button
                    type="button"
                    aria-expanded={issueExpanded}
                    aria-label={`Expandir historia ${group.issueKey}`}
                    onClick={() => toggleIssueExpanded(group.issueKey)}
                    className="p-1 rounded-full hover:bg-[#E8EBEC] transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104B99] focus-visible:ring-offset-2"
                  >
                    <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', issueExpanded && 'rotate-180')} />
                  </button>
                </div>

                {issueExpanded && group.scenarios.map((scenario) => {
                  const scenarioChecked = selectedIdSet.has(scenario.scenarioId);
                  const scenarioExpanded = expandedScenarioIds.includes(scenario.scenarioId);
                  return (
                    <div key={scenario.scenarioId} className={cn(scenarioChecked ? 'bg-[#104B99]/4' : 'bg-white')}>
                      <div className="flex items-center gap-3 pl-14 pr-6 py-3 border-b border-[#F4F1EA]">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={scenarioChecked}
                          aria-label={`Seleccionar escenario ${scenario.scenarioId}`}
                          onClick={() => toggleMobileScenario(scenario.scenarioId)}
                          className={cn(
                            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104B99] focus-visible:ring-offset-2',
                            scenarioChecked ? 'border-[#104B99] bg-[#104B99]' : 'border-[#BABEC3] hover:border-[#104B99]',
                          )}
                        >
                          {scenarioChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleScenarioExpanded(scenario.scenarioId)}
                          aria-expanded={scenarioExpanded}
                          className="flex-1 text-left min-w-0"
                        >
                          <span className={cn('text-[12px] block break-words', scenarioChecked ? 'font-semibold text-[#1a1f2e]' : 'font-medium text-[#1a1f2e]')}>
                            {scenario.title}
                          </span>
                          <span className="text-[10px] font-mono text-[#8B999D] mt-0.5 block">{scenario.scenarioId}</span>
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-2 py-0.5 rounded">
                            {scenario.steps.length} pasos
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleScenarioExpanded(scenario.scenarioId)}
                            aria-expanded={scenarioExpanded}
                            aria-label={`Expandir escenario ${scenario.scenarioId}`}
                            className="p-1 rounded-full hover:bg-[#E8EBEC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104B99] focus-visible:ring-offset-2"
                          >
                            <ChevronDown size={13} className={cn('text-[#8B999D] transition-transform duration-200', scenarioExpanded && 'rotate-180')} />
                          </button>
                        </div>
                      </div>

                      {scenarioExpanded && (
                        <div className="pl-14 pr-6 pb-4 pt-3">
                          <div className="bg-[#0d1119] rounded-xl overflow-hidden border border-[#1a1f2e]/20">
                            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#5EC470]" />
                              <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider truncate">
                                {scenario.scenarioId} · {scenario.steps.length} pasos
                              </span>
                            </div>

                            {scenario.preconditions.length > 0 && (
                              <div className="px-4 py-2.5 border-b border-white/10 bg-[#F4A261]/5">
                                <div className="text-[9px] uppercase tracking-wider text-[#F4A261]/70 mb-1.5">Precondiciones</div>
                                <div className="space-y-1.5">
                                  {scenario.preconditions.map((precondition, index) => (
                                    <p key={`${scenario.scenarioId}-pre-${index}`} className="text-[11px] text-white/70 leading-relaxed font-mono whitespace-pre-wrap">
                                      {precondition}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}

                            {scenario.requiredDataProfile && (
                              <div className="px-4 py-2 border-b border-white/10 bg-[#48A157]/8">
                                <div className="text-[9px] uppercase tracking-wider text-[#48A157]/70 mb-1">Perfil de datos</div>
                                <div className="text-[11px] text-white/80 font-mono">{scenario.requiredDataProfile}</div>
                                <div className="text-[9px] text-white/50 mt-1">
                                  {scenario.requiresManualData
                                    ? 'Requiere datos manuales — el usuario debe proveer valores antes de ejecutar.'
                                    : 'Los valores reales se resuelven en ejecución desde la configuración.'}
                                </div>
                              </div>
                            )}

                            {(scenario.requiredData?.length ?? 0) > 0 && (
                              <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                                <div className="text-[9px] uppercase tracking-wider text-white/60 mb-2">Datos de la prueba</div>
                                <div className="space-y-2">
                                  {scenario.requiredData?.map((field) => (
                                    <div key={`${scenario.scenarioId}-field-${field.stepIndex}`} className="flex flex-col gap-1">
                                      <label className="text-[11px] font-medium text-white/75">
                                        {field.label}
                                        {field.sensitive && <span className="ml-1 text-[9px] text-[#F4A261]/70">(sensible)</span>}
                                      </label>
                                      {field.kind === 'select' ? (
                                        <select
                                          value={mobileDataValues[scenario.scenarioId]?.[field.stepIndex] ?? field.defaultValue ?? ''}
                                          onChange={(event) => setMobileFieldValue(scenario.scenarioId, field.stepIndex, event.target.value)}
                                          className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/20 bg-black/30 text-white focus:outline-none focus:border-[#5EC470]"
                                        >
                                          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                      ) : (
                                        <input
                                          type={field.sensitive ? 'password' : 'text'}
                                          value={mobileDataValues[scenario.scenarioId]?.[field.stepIndex] ?? field.exampleValue ?? ''}
                                          onChange={(event) => setMobileFieldValue(scenario.scenarioId, field.stepIndex, event.target.value)}
                                          placeholder={field.sensitive ? '••••••••' : field.exampleValue}
                                          className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/20 bg-black/30 text-white placeholder:text-white/35 focus:outline-none focus:border-[#5EC470]"
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="p-4 border-b border-white/10">
                              <div className="text-[9px] uppercase tracking-wider text-white/60 mb-2">Pasos</div>
                              <div className="max-h-[280px] overflow-y-auto space-y-2.5 pr-1">
                                {scenario.steps.map((step, index) => (
                                  <div key={`${scenario.scenarioId}-step-${index}`} className="flex gap-3">
                                    <span className="text-[10px] font-mono text-white/30 flex-shrink-0 w-5 text-right mt-0.5">{index + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[11px] text-white/80 leading-relaxed break-words">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono uppercase mr-1.5">{step.action}</span>
                                        {step.description && <span>{step.description}</span>}
                                      </div>
                                      {step.target && (
                                        <div className="text-[10px] text-white/55 font-mono mt-1 break-all">
                                          {step.target.strategy}: {step.target.value}
                                        </div>
                                      )}
                                      {typeof step.value === 'string' && step.value.trim().length > 0 && (
                                        <div className="text-[10px] text-white/45 font-mono mt-0.5 break-words">
                                          value: {step.value}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {scenario.expectedResult && (
                              <div className="px-4 py-2.5 bg-[#5EC470]/8">
                                <div className="text-[9px] uppercase tracking-wider text-[#5EC470]/80 mb-1.5">Resultado esperado</div>
                                <p className="text-[11px] text-white/80 leading-relaxed font-mono whitespace-pre-wrap break-words">{scenario.expectedResult}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
