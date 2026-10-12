import { Fragment, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../constants/theme';
import type { TestDesignDataField, TestDesignScenario } from '../../services/test-design';
import {
  isSensitiveName,
  keyFromLabel,
  labelFromKey,
  PLACEHOLDER,
  unusedDataKeys,
  type StoryDataField,
} from './scenario-utils';

/**
 * Test data the generated cases need typed in (users, passwords, ids, amounts).
 *
 * Every input of this kind shares one look — amber while empty, green once filled,
 * with a key icon — so the user can tell at a glance what is theirs to complete.
 * Sensitive values are masked and the UI says they are not published.
 */

export type Tone = 'light' | 'dark';

const valueInputClass: Record<Tone, string> = {
  light: 'w-full px-3 py-2 rounded-lg border text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99] disabled:bg-[#FAFAF7]',
  dark: 'w-full px-3 py-2 rounded-lg border text-[12px] text-white placeholder:text-[#7D8798] outline-none focus:border-[#5B8FD6] disabled:opacity-70',
};

/** Amber while empty, green once filled — in both tones, so "complete me" reads the same everywhere. */
const valueState: Record<Tone, { filled: string; empty: string }> = {
  light: { filled: 'border-[#B9DEC0] bg-[#F4FBF5]', empty: 'border-[#F1DFA8] bg-[#FFFBF0]' },
  dark: { filled: 'border-[#2F6B3A] bg-[#1C2A21]', empty: 'border-[#7A5F22] bg-[#2A2416]' },
};

export function DataValueInput({
  value,
  sensitive,
  placeholder,
  disabled,
  onChange,
  tone = 'light',
}: {
  value: string;
  sensitive: boolean;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  tone?: Tone;
}) {
  const [visible, setVisible] = useState(false);
  const filled = value.trim().length > 0;
  return (
    <div className="relative">
      <input
        type={sensitive && !visible ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? 'Ingresa el valor'}
        autoComplete="off"
        className={cn(
          valueInputClass[tone],
          filled ? valueState[tone].filled : valueState[tone].empty,
          sensitive && 'pr-9',
        )}
      />
      {sensitive && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 text-[#8B999D]',
            tone === 'dark' ? 'hover:text-white' : 'hover:text-[#1a1f2e]',
          )}
          title={visible ? 'Ocultar' : 'Mostrar'}
          aria-label={visible ? 'Ocultar valor' : 'Mostrar valor'}
        >
          {visible ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
    </div>
  );
}

/** Renders text with {{key}} placeholders as chips: the value when filled, the label when not. */
export function HighlightedText({ text, data }: { text: string; data: TestDesignDataField[] }) {
  const byKey = new Map(data.map((f) => [f.key, f]));
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const field = byKey.get(match[1].toLowerCase());
    const filled = Boolean(field?.value.trim());
    parts.push(
      <span
        key={`${index}-${match[1]}`}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 mx-0.5 rounded-md text-[11px] font-semibold align-baseline',
          filled ? 'bg-[#E9F5EB] text-[#2F7A3B]' : 'bg-[#FFF3D6] text-[#8A6300]',
        )}
        title={field?.description || field?.label}
      >
        {field?.sensitive ? <Lock size={9} /> : <KeyRound size={9} />}
        {filled ? (field!.sensitive ? '••••••' : field!.value) : field?.label ?? match[1]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

/** The data section inside one scenario. */
export function ScenarioDataSection({
  scenario,
  readOnly,
  onChange,
  tone = 'light',
}: {
  scenario: TestDesignScenario;
  readOnly: boolean;
  onChange: (data: TestDesignDataField[]) => void;
  tone?: Tone;
}) {
  const dark = tone === 'dark';
  const [newLabel, setNewLabel] = useState('');
  const unused = unusedDataKeys(scenario);
  const update = (key: string, patch: Partial<TestDesignDataField>) =>
    onChange(scenario.data.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  function add() {
    const label = newLabel.trim();
    const key = keyFromLabel(label);
    if (!key || scenario.data.some((f) => f.key === key)) return;
    onChange([...scenario.data, { key, label, description: '', value: '', sensitive: isSensitiveName(label) }]);
    setNewLabel('');
  }

  return (
    <div className={cn('rounded-xl border p-3 space-y-2.5', dark ? 'border-[#4A4026] bg-[#211F1A]' : 'border-[#F1DFA8] bg-[#FFFDF7]')}>
      <div className="flex items-center gap-2">
        <KeyRound size={13} className={dark ? 'text-[#E3A93B]' : 'text-[#C98A1B]'} />
        <span className={cn('text-[11px] font-semibold', dark ? 'text-white' : 'text-[#1a1f2e]')}>Datos de prueba</span>
        <span className={cn('text-[10px]', dark ? 'text-[#A9B1BE]' : 'text-[#8B999D]')}>
          Completa los valores que el caso necesita. En los pasos se ven como{' '}
          <code className={cn('px-1 rounded', dark ? 'bg-[#3A3220] text-[#F1C76B]' : 'bg-[#FFF3D6] text-[#8A6300]')}>{'{{clave}}'}</code>.
        </span>
      </div>

      {scenario.data.length === 0 && (
        <div className={cn('text-[11px]', dark ? 'text-[#A9B1BE]' : 'text-[#8B999D]')}>
          Este caso no requiere datos. Escribe <code>{'{{nombre}}'}</code> en un paso o agrega uno abajo.
        </div>
      )}

      {scenario.data.map((f) => (
        <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2 items-start">
          <div className="min-w-0">
            <input
              value={f.label}
              onChange={(e) => update(f.key, { label: e.target.value })}
              disabled={readOnly}
              className={cn(
                'w-full px-2 py-1 rounded-md border border-transparent bg-transparent text-[12px] font-semibold outline-none disabled:hover:border-transparent',
                dark ? 'text-white hover:border-[#3A4357] focus:border-[#5B8FD6]' : 'text-[#1a1f2e] hover:border-[#E8EBEC] focus:border-[#104B99]',
              )}
              title={`Clave: {{${f.key}}}`}
            />
            <div className={cn('px-2 text-[10px] truncate', dark ? 'text-[#8B95A5]' : 'text-[#8B999D]')} title={f.description}>
              {f.description || `{{${f.key}}}`}
            </div>
          </div>
          <DataValueInput
            value={f.value}
            sensitive={f.sensitive}
            disabled={readOnly}
            onChange={(value) => update(f.key, { value })}
            tone={tone}
          />
          <div className="flex items-center gap-1 pt-1.5">
            <label
              className={cn('flex items-center gap-1 text-[10px] cursor-pointer', dark ? 'text-[#C9D0DB]' : 'text-[#58646D]')}
              title="Los datos sensibles no se publican en TestRail"
            >
              <input
                type="checkbox"
                checked={f.sensitive}
                disabled={readOnly}
                onChange={(e) => update(f.key, { sensitive: e.target.checked })}
              />
              Sensible
            </label>
            {!readOnly && unused.has(f.key) && (
              <button
                type="button"
                onClick={() => onChange(scenario.data.filter((x) => x.key !== f.key))}
                className="w-6 h-6 rounded flex items-center justify-center text-[#8B999D] hover:text-[#B4463C]"
                title="Quitar dato (ningún paso lo usa)"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Nuevo dato, p. ej. Número de cuenta"
            className={cn(
              'flex-1 px-3 py-1.5 rounded-lg border text-[11px] outline-none',
              dark
                ? 'border-[#3A4357] bg-[#232A3B] text-white placeholder:text-[#7D8798] focus:border-[#5B8FD6]'
                : 'border-[#E8EBEC] bg-white focus:border-[#104B99]',
            )}
          />
          <button
            type="button"
            onClick={add}
            disabled={!keyFromLabel(newLabel)}
            className={cn(
              'text-[11px] font-semibold flex items-center gap-1',
              dark ? 'text-[#8DB4EA] disabled:text-[#566075]' : 'text-[#104B99] disabled:text-[#BABEC3]',
            )}
          >
            <Plus size={12} /> Agregar dato
          </button>
        </div>
      )}

      {scenario.data.some((f) => f.sensitive) && (
        <div className={cn('flex items-center gap-1.5 text-[10px]', dark ? 'text-[#A9B1BE]' : 'text-[#8B999D]')}>
          <Lock size={10} /> Los datos sensibles se guardan en el borrador pero no se publican en TestRail.
        </div>
      )}
    </div>
  );
}

/** Fill each value once for every scenario of the story that uses it. */
export function StoryDataPanel({
  fields,
  readOnly,
  onChange,
}: {
  fields: StoryDataField[];
  readOnly: boolean;
  onChange: (key: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  const missing = fields.filter((f) => f.missing > 0).length;
  // Several keys often share the on-screen label ("Número de identificación" for a valid,
  // a blocked and an unknown id); the key's name tells them apart.
  const labelCounts = new Map<string, number>();
  for (const f of fields) labelCounts.set(f.label, (labelCounts.get(f.label) ?? 0) + 1);
  return (
    <div className="mt-4 rounded-xl border border-[#F1DFA8] bg-[#FFFDF7] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-[#C98A1B]" />
        <span className="text-[12px] font-semibold text-[#1a1f2e]">Datos de prueba de la historia</span>
        <span
          className={cn(
            'text-[10px] font-semibold px-2 py-0.5 rounded-full',
            missing > 0 ? 'bg-[#FFF3D6] text-[#8A6300]' : 'bg-[#E9F5EB] text-[#2F7A3B]',
          )}
        >
          {missing > 0 ? `${missing} por completar` : 'Completos'}
        </span>
      </div>
      <p className="text-[11px] text-[#58646D]">
        La IA detectó estos valores en los escenarios. Lo que escribas aquí se aplica a todos los casos que usan el dato; también puedes
        cambiarlo en cada escenario.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1a1f2e]">
              {f.sensitive ? <Lock size={10} className="text-[#8B999D]" /> : null}
              {f.label}
              {(labelCounts.get(f.label) ?? 0) > 1 && (
                <span className="font-normal text-[#58646D]">({labelFromKey(f.key)})</span>
              )}
              <span className="font-normal text-[#8B999D]">
                · {f.scenarioCount} {f.scenarioCount === 1 ? 'caso' : 'casos'}
              </span>
            </span>
            {f.description && <span className="block text-[10px] text-[#8B999D] mb-1">{f.description}</span>}
            <DataValueInput
              value={f.value ?? ''}
              sensitive={f.sensitive}
              placeholder={f.value === null ? 'Valores distintos por caso' : undefined}
              disabled={readOnly}
              onChange={(value) => onChange(f.key, value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
