import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Copy,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '../../constants/theme';
import { HighlightedText, ScenarioDataSection } from './TestDataFields';
import type {
  TestDesignDataField,
  TestDesignPriority,
  TestDesignScenario,
  TestDesignScenarioType,
  TestDesignStep,
} from '../../services/test-design';
import {
  hasPlaceholders,
  isSelectedForPublish,
  missingDataCount,
  syncDataFields,
  JIRA_PUBLISH_ENABLED,
  moveItem,
  PRIORITY_LABELS,
  scenarioProblems,
  TYPE_LABELS,
} from './scenario-utils';

/**
 * One scenario: the two destination toggles, its fields and the step table.
 * Collapsed it is one line, so a story with a dozen cases stays scannable.
 */

interface ScenarioEditorProps {
  scenario: TestDesignScenario;
  index: number;
  count: number;
  readOnly: boolean;
  defaultOpen?: boolean;
  onChange: (next: TestDesignScenario) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** The expanded detail is dark (panel ink); inputs are a step lighter so they read as fields. */
const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[#2E3648] bg-[#232A3B] text-[12px] text-white placeholder:text-[#7D8798] outline-none focus:border-[#5B8FD6] disabled:bg-[#1F2535] disabled:text-[#A9B1BE] [&>option]:bg-[#232A3B]';

const labelClass = 'text-[10px] uppercase tracking-wider text-[#A9B1BE] font-semibold';

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      title={checked ? `Se publicará en ${label}` : `No se publicará en ${label}`}
      className={cn(
        'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition',
        checked ? 'bg-[#48A157] border-[#48A157] text-white' : 'bg-white border-[#E8EBEC] text-[#8B999D]',
        disabled ? 'cursor-default' : 'hover:border-[#48A157]',
      )}
    >
      {label}
    </button>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  dark,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center text-[#8B999D] transition disabled:opacity-30 disabled:cursor-default',
        danger
          ? dark
            ? 'hover:bg-[#3A2328] hover:text-[#F08A80]'
            : 'hover:bg-[#FBEDEB] hover:text-[#B4463C]'
          : dark
            ? 'hover:bg-[#2E3648] hover:text-white'
            : 'hover:bg-[#F4F1EA] hover:text-[#1a1f2e]',
      )}
    >
      {children}
    </button>
  );
}

/** Under a field that uses {{key}}: how the text reads with the data filled in. */
function DataPreview({ text, data }: { text: string; data: TestDesignDataField[] }) {
  if (!hasPlaceholders(text)) return null;
  return (
    <div className="mt-1 px-2 py-1 rounded-md bg-[#232A3B] text-[11px] text-[#C9D0DB] leading-relaxed">
      <HighlightedText text={text} data={data} />
    </div>
  );
}

function StepsTable({
  steps,
  data,
  readOnly,
  onChange,
}: {
  steps: TestDesignStep[];
  data: TestDesignDataField[];
  readOnly: boolean;
  onChange: (steps: TestDesignStep[]) => void;
}) {
  const update = (index: number, patch: Partial<TestDesignStep>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  return (
    <div className="rounded-xl border border-[#2E3648] overflow-hidden">
      <div className="grid grid-cols-[32px_1fr_1fr_88px] bg-[#202738] text-[10px] uppercase tracking-wider text-[#A9B1BE] font-semibold">
        <div className="px-2 py-2 text-center">#</div>
        <div className="px-2 py-2">Acción</div>
        <div className="px-2 py-2">Resultado esperado</div>
        <div />
      </div>
      {steps.map((step, index) => (
        <div key={index} className="grid grid-cols-[32px_1fr_1fr_88px] border-t border-[#2E3648] items-start">
          <div className="px-2 py-2.5 text-center text-[11px] font-semibold text-[#A9B1BE]">{index + 1}</div>
          <div className="p-1.5">
            <textarea
              value={step.action}
              onChange={(e) => update(index, { action: e.target.value })}
              disabled={readOnly}
              rows={2}
              placeholder="Qué hace quien prueba"
              className={cn(inputClass, 'resize-y')}
            />
            <DataPreview text={step.action} data={data} />
          </div>
          <div className="p-1.5">
            <textarea
              value={step.expected}
              onChange={(e) => update(index, { expected: e.target.value })}
              disabled={readOnly}
              rows={2}
              placeholder="Qué debe pasar"
              className={cn(inputClass, 'resize-y')}
            />
            <DataPreview text={step.expected} data={data} />
          </div>
          <div className="py-2 pr-1.5 flex items-center justify-end gap-0.5">
            {!readOnly && (
              <>
                <IconButton dark title="Subir paso" disabled={index === 0} onClick={() => onChange(moveItem(steps, index, -1))}>
                  <ArrowUp size={12} />
                </IconButton>
                <IconButton
                  dark
                  title="Bajar paso"
                  disabled={index === steps.length - 1}
                  onClick={() => onChange(moveItem(steps, index, 1))}
                >
                  <ArrowDown size={12} />
                </IconButton>
                <IconButton dark title="Eliminar paso" danger onClick={() => onChange(steps.filter((_, i) => i !== index))}>
                  <Trash2 size={12} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...steps, { action: '', expected: '' }])}
          className="w-full border-t border-[#2E3648] px-3 py-2 text-[11px] font-semibold text-[#8DB4EA] hover:bg-[#232A3B] flex items-center gap-1.5"
        >
          <Plus size={12} /> Agregar paso
        </button>
      )}
    </div>
  );
}

export function ScenarioEditor({
  scenario,
  index,
  count,
  readOnly,
  defaultOpen = false,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: ScenarioEditorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const problems = scenarioProblems(scenario);
  const selected = isSelectedForPublish(scenario);
  const patch = (fields: Partial<TestDesignScenario>) => onChange(syncDataFields({ ...scenario, ...fields }));
  const missingData = missingDataCount(scenario);

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white transition overflow-hidden',
        selected ? 'border-[#E8EBEC]' : 'border-dashed border-[#E8EBEC] opacity-75',
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
      >
        {open ? <ChevronDown size={14} className="text-[#8B999D]" /> : <ChevronRight size={14} className="text-[#8B999D]" />}
        <span className="text-[11px] font-semibold text-[#8B999D] w-5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-[#1a1f2e] truncate">
            {scenario.title || <span className="text-[#B4463C]">Sin título</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#8B999D]">
            <span>{TYPE_LABELS[scenario.type]}</span>
            <span>·</span>
            <span>{PRIORITY_LABELS[scenario.priority]}</span>
            <span>·</span>
            <span>{scenario.steps.length} {scenario.steps.length === 1 ? 'paso' : 'pasos'}</span>
            <span>·</span>
            <span>{scenario.origin === 'ai' ? (scenario.edited ? 'IA, editado' : 'IA') : 'Manual'}</span>
            {scenario.testRailCaseId !== null && (
              <span className="px-1.5 rounded bg-[#EEF3FA] text-[#104B99] font-semibold">C{scenario.testRailCaseId}</span>
            )}
            {scenario.data.length > 0 && (
              <span
                className={cn(
                  'flex items-center gap-1 px-1.5 rounded font-semibold',
                  missingData > 0 ? 'bg-[#FFF3D6] text-[#8A6300]' : 'bg-[#E9F5EB] text-[#2F7A3B]',
                )}
                title={scenario.data.map((f) => `${f.label}: ${f.value ? (f.sensitive ? '••••••' : f.value) : 'por completar'}`).join('\n')}
              >
                <KeyRound size={10} />
                {missingData > 0
                  ? `${missingData} ${missingData === 1 ? 'dato' : 'datos'} por completar`
                  : `${scenario.data.length} ${scenario.data.length === 1 ? 'dato' : 'datos'} completos`}
              </span>
            )}
            {selected && problems.length > 0 && (
              <span className="flex items-center gap-1 text-[#B4463C]" title={problems.join('\n')}>
                <AlertTriangle size={11} /> {problems.length === 1 ? problems[0] : `${problems.length} pendientes`}
              </span>
            )}
          </div>
        </div>
        <Toggle label="TestRail" checked={scenario.selectedForTestRail} disabled={readOnly} onChange={(v) => patch({ selectedForTestRail: v })} />
        {JIRA_PUBLISH_ENABLED && (
          <Toggle label="Jira" checked={scenario.selectedForJira} disabled={readOnly} onChange={(v) => patch({ selectedForJira: v })} />
        )}
        {!readOnly && (
          <div className="flex items-center gap-0.5 ml-1">
            <IconButton title="Subir escenario" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp size={13} />
            </IconButton>
            <IconButton title="Bajar escenario" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown size={13} />
            </IconButton>
            <IconButton title="Duplicar escenario" onClick={onDuplicate}>
              <Copy size={13} />
            </IconButton>
            <IconButton
              title={scenario.testRailCaseId !== null ? 'Eliminar del borrador (el caso seguirá en TestRail)' : 'Eliminar escenario'}
              danger
              onClick={onDelete}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-[#1a1f2e]">
          <label className="block pt-3">
            <span className={labelClass}>Título</span>
            <input
              value={scenario.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={readOnly}
              maxLength={250}
              className={cn(inputClass, 'mt-1')}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Tipo</span>
              <select
                value={scenario.type}
                onChange={(e) => patch({ type: e.target.value as TestDesignScenarioType })}
                disabled={readOnly}
                className={cn(inputClass, 'mt-1')}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Prioridad</span>
              <select
                value={scenario.priority}
                onChange={(e) => patch({ priority: e.target.value as TestDesignPriority })}
                disabled={readOnly}
                className={cn(inputClass, 'mt-1')}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Precondiciones</span>
            <textarea
              value={scenario.preconditions}
              onChange={(e) => patch({ preconditions: e.target.value })}
              disabled={readOnly}
              rows={2}
              className={cn(inputClass, 'mt-1 resize-y')}
            />
            <DataPreview text={scenario.preconditions} data={scenario.data} />
          </label>

          <ScenarioDataSection tone="dark" scenario={scenario} readOnly={readOnly} onChange={(data) => patch({ data })} />

          <div>
            <span className={labelClass}>Pasos</span>
            <div className="mt-1">
              <StepsTable steps={scenario.steps} data={scenario.data} readOnly={readOnly} onChange={(steps) => patch({ steps })} />
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>Resultado esperado</span>
            <textarea
              value={scenario.expectedResult}
              onChange={(e) => patch({ expectedResult: e.target.value })}
              disabled={readOnly}
              rows={2}
              className={cn(inputClass, 'mt-1 resize-y')}
            />
            <DataPreview text={scenario.expectedResult} data={scenario.data} />
          </label>
        </div>
      )}
    </div>
  );
}
