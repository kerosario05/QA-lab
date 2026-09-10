import { useEffect, useMemo, useState } from 'react';
import type { InputRequirement } from './input-requirements';
import { composeSelectedInputRequirements, groupRuntimeInputRequirements, type RuntimeInputPresentation } from './input-requirements';
import {
  buildRuntimeEntriesByCase,
  createInputRequirementValues,
  isLaunchBlocked,
  setByCaseValue,
  setSharedValue,
  type InputRequirementValues,
  type RuntimeInputValuesByCaseId,
  type RuntimeEntry,
} from './input-requirements-values';
import { cn } from '../../constants/theme';

type RequirementCase = {
  id: number;
  title?: string;
  inputRequirements?: InputRequirement[];
  requirementsLoadStatus?: 'loading' | 'loaded' | 'error';
  requirementsLoadError?: string;
};

type InputRequirementsPanelProps = {
  cases: RequirementCase[];
  selectedCaseIds: number[];
  onRuntimeEntries?: (entries: Record<string, RuntimeEntry[]> | undefined) => void;
  onRuntimeInput?: (caseId: number, key: string, value: string) => void;
  runtimeInputValuesByCaseId?: RuntimeInputValuesByCaseId;
  onBlocked?: (blocked: boolean) => void;
};

function resolveControlType(requirement: InputRequirement): string {
  if (requirement.fieldCapability) {
    if (requirement.fieldCapability.kind === 'datetime') return 'datetime-local';
    if (requirement.fieldCapability.kind === 'unknown') return 'text';
    return requirement.fieldCapability.kind;
  }
  if (requirement.controlType) return requirement.controlType;
  return requirement.sensitive === true ? 'password' : 'text';
}

function RequirementControl({
  requirement,
  presentation,
  value,
  onChange,
}: {
  requirement: InputRequirement;
  presentation?: RuntimeInputPresentation;
  value: string;
  onChange: (value: string) => void;
}) {
  const controlType = resolveControlType(requirement);
  const capability = requirement.fieldCapability;
  const inputKey = presentation?.inputKey ?? requirement.key;
  const label = presentation?.displayLabel
    || requirement.displayLabel
    || requirement.semanticField
    || requirement.label
    || requirement.key;
  const constraints = capability?.constraints ?? {};
  const constraintProps = {
    ...(constraints.min !== undefined ? { min: constraints.min } : {}),
    ...(constraints.max !== undefined ? { max: constraints.max } : {}),
    ...(constraints.minLength !== undefined ? { minLength: constraints.minLength } : {}),
    ...(constraints.maxLength !== undefined ? { maxLength: constraints.maxLength } : {}),
    ...(constraints.pattern !== undefined ? { pattern: constraints.pattern } : {}),
  };
  const commonProps = {
    className:
      'w-full rounded-md border border-white/10 bg-[#0d1119] px-3 py-1.5 text-[13px] text-white/85 font-mono outline-none focus:border-[#48A157]',
    value,
    'data-input-key': inputKey,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
  };
  const syntheticSupporting = requirement.valuePolicy === 'safe_synthetic' && requirement.inputRole === 'supporting';
  const emptyChoice = (capability?.kind === 'select' || capability?.kind === 'radio') && !(capability.allowedValues?.length);

  let control: React.ReactNode;
  if (syntheticSupporting) {
    control = <span data-input-policy="safe_synthetic" className="text-[11px] text-white/45">Se resolverá en ejecución</span>;
  } else if (emptyChoice && requirement.valuePolicy === 'scenario_controlled' && requirement.required === true) {
    control = <input {...commonProps} {...constraintProps} data-field-capability={capability?.kind} data-select-fallback="manual" type="text" />;
  } else if (emptyChoice) {
    control = <span data-field-capability={capability.kind} className="text-[11px] text-[#F4A261]/80">Opciones pendientes de resolución</span>;
  } else if (controlType === 'radio') {
    control = (
      <div data-field-capability="radio" className="flex flex-col gap-1">
        {(capability?.allowedValues ?? requirement.allowedValues ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-[11px] text-white/75">
            <input type="radio" name={requirement.key} value={option} onChange={() => onChange(option)} />
            {option}
          </label>
        ))}
      </div>
    );
  } else if (controlType === 'select') {
    control = (
      <select
        {...(commonProps as any)}
        data-field-capability={capability?.kind}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="" />
        {(capability?.allowedValues ?? requirement.allowedValues ?? []).map((option) => (
          <option key={option} value={option} className="bg-[#0d1119] text-white/85">
            {option}
          </option>
        ))}
      </select>
    );
  } else if (controlType === 'file') {
    control = (
      <input
        {...(commonProps as any)}
        type="file"
        data-field-capability={capability?.kind}
        onChange={(event) => onChange(event.target.files?.[0]?.name ?? '')}
      />
    );
  } else {
    control = <input {...commonProps} {...constraintProps} data-field-capability={capability?.kind} type={controlType} />;
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-white/75 flex items-center gap-1">
          {label}
           {requirement.required === true && !syntheticSupporting && <span className="text-[#F4A261]">*</span>}
        </span>
        {control}
      </label>
      <span data-technical-input-key={inputKey} className="text-[9px] font-mono text-white/35 truncate" title={inputKey}>{inputKey}</span>
    </div>
  );
}

export function InlineInputRequirements({
  caseId,
  requirements,
  runtimeInputValues,
  onRuntimeInput,
}: {
  caseId: number;
  requirements: InputRequirement[];
  runtimeInputValues?: Record<string, string>;
  onRuntimeInput?: (caseId: number, key: string, value: string) => void;
}) {
  if (requirements.length === 0) return null;

  const grouped = groupRuntimeInputRequirements(requirements);
  const renderRequirement = (presentation: RuntimeInputPresentation) => (
    <RequirementControl
      key={`${caseId}-${presentation.inputKey}`}
      requirement={presentation.requirement}
      presentation={presentation}
      value={runtimeInputValues?.[presentation.inputKey] ?? ''}
      onChange={(value) => onRuntimeInput?.(caseId, presentation.inputKey, value)}
    />
  );

  return (
    <div className="px-4 py-3 border-b border-white/10 bg-[#48A157]/5">
      <div className="text-[9px] uppercase tracking-wider text-[#48A157]/80 mb-2">DATOS DE EJECUCIÓN REQUERIDOS</div>
      <div className="flex flex-col gap-3">
        {grouped.general.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{grouped.general.map(renderRequirement)}</div>}
        {grouped.groups.map((group) => (
          <details key={group.key} open className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-[#48A157] font-semibold">
              {group.label}
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">{group.requirements.map(renderRequirement)}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function CommonInputRequirements({
  requirements,
  values,
  onChange,
}: {
  requirements: InputRequirement[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (requirements.length === 0) return null;
  const grouped = groupRuntimeInputRequirements(requirements);
  const renderRequirement = (presentation: RuntimeInputPresentation) => (
    <RequirementControl
      key={presentation.inputKey}
      requirement={presentation.requirement}
      presentation={presentation}
      value={values[presentation.inputKey] ?? ''}
      onChange={(value) => onChange(presentation.inputKey, value)}
    />
  );
  return (
    <div className="px-4 py-3 border-b border-white/10 bg-[#48A157]/5">
      <div className="text-[9px] uppercase tracking-wider text-[#48A157]/80 mb-2">DATOS COMUNES</div>
      <div className="flex flex-col gap-4">
        {grouped.general.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{grouped.general.map(renderRequirement)}</div>}
        {grouped.groups.map((group) => (
          <details key={group.key} open className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-[#48A157] font-semibold">{group.label}</summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">{group.requirements.map(renderRequirement)}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function InputRequirementsPanel({
  cases,
  selectedCaseIds,
  onRuntimeEntries,
  onRuntimeInput,
  runtimeInputValuesByCaseId,
  onBlocked,
}: InputRequirementsPanelProps) {
  const composition = useMemo(
    () => composeSelectedInputRequirements(cases, selectedCaseIds),
    [cases, selectedCaseIds],
  );
  const [values, setValues] = useState<InputRequirementValues>(() => createInputRequirementValues());

  useEffect(() => {
    const next = createInputRequirementValues();
    for (const requirement of composition.shared) {
      const sourceCaseId = selectedCaseIds.find((caseId) => runtimeInputValuesByCaseId?.[String(caseId)]?.[requirement.key] !== undefined);
      const value = sourceCaseId === undefined ? undefined : runtimeInputValuesByCaseId?.[String(sourceCaseId)]?.[requirement.key];
      if (value !== undefined) next.shared[requirement.key] = value;
    }
    for (const [caseId, requirements] of Object.entries(composition.byCase)) {
      const caseValues = runtimeInputValuesByCaseId?.[caseId] ?? {};
      for (const requirement of requirements) {
        if (caseValues[requirement.key] !== undefined) {
          next.byCase[caseId] = { ...(next.byCase[caseId] ?? {}), [requirement.key]: caseValues[requirement.key] };
        }
      }
    }
    setValues(next);
  }, [composition, runtimeInputValuesByCaseId, selectedCaseIds]);

  useEffect(() => {
    const entries = buildRuntimeEntriesByCase(composition, values, selectedCaseIds);
    onRuntimeEntries?.(entries);
  }, [composition, values, selectedCaseIds]);

  useEffect(() => {
    onBlocked?.(isLaunchBlocked(composition, values));
  }, [composition, values]);

  if (selectedCaseIds.length === 0) return null;

  const caseLabels: Record<string, string> = {};
  for (const c of cases) caseLabels[String(c.id)] = c.title || `C${c.id}`;
  const requirementErrors = cases.filter((c) => c.requirementsLoadStatus === 'error');

  return (
    <div className="flex flex-col gap-4">
      {requirementErrors.map((c) => (
        <div key={`requirements-error-${c.id}`} className="rounded-md border border-[#E63946]/30 bg-[#E63946]/10 px-3 py-2 text-[12px] text-[#E63946]">
          {c.title || `Caso ${c.id}`}: {c.requirementsLoadError || 'No se pudieron sincronizar los requirements.'}
        </div>
      ))}
      {composition.shared.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold">
            Datos comunes
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {composition.shared.map((requirement) => (
              <RequirementControl
                key={requirement.key}
                requirement={requirement}
                value={values.shared[requirement.key] ?? ''}
                onChange={(value) => {
                  setValues((prev) => setSharedValue(prev, requirement.key, value));
                  for (const caseId of selectedCaseIds) onRuntimeInput?.(caseId, requirement.key, value);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {Object.keys(composition.byCase).length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-semibold">
            Datos por caso
          </div>
          {Object.entries(composition.byCase).map(([caseId, requirements]) => (
            <div
              key={caseId}
              className={cn('rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2')}
            >
              <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                C{caseId} · {caseLabels[caseId] ?? ''}
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {requirements.map((requirement) => (
                  <RequirementControl
                    key={requirement.key}
                    requirement={requirement}
                    value={values.byCase[caseId]?.[requirement.key] ?? ''}
                    onChange={(value) => {
                      setValues((prev) => setByCaseValue(prev, caseId, requirement.key, value));
                      onRuntimeInput?.(Number(caseId), requirement.key, value);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
