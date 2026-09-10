import { useEffect, useState } from 'react';
import type { InputRequirement } from './input-requirements';
import { saveCaseInputRequirements } from './input-requirements-loader';

export const EDITABLE_CONTROL_TYPES = ['text', 'password', 'number', 'email', 'tel', 'select', 'file'] as const;
type EditableControlType = typeof EDITABLE_CONTROL_TYPES[number];

export function cloneEditableRequirements(requirements: InputRequirement[]): InputRequirement[] {
  return requirements.map((requirement) => ({
    ...requirement,
    allowedValues: requirement.allowedValues ? [...requirement.allowedValues] : undefined,
  }));
}

export function addEditableRequirement(requirements: InputRequirement[]): InputRequirement[] {
  return [...cloneEditableRequirements(requirements), { key: '', controlType: 'text' }];
}

export function validateEditableRequirements(requirements: InputRequirement[]): { valid: boolean; error?: string } {
  const keys = new Set<string>();
  for (const requirement of requirements) {
    const key = requirement.key.trim();
    if (!key) return { valid: false, error: 'La key es obligatoria.' };
    const normalizedKey = key.toLowerCase();
    if (keys.has(normalizedKey)) return { valid: false, error: 'No se permiten keys duplicadas.' };
    keys.add(normalizedKey);
    if (!EDITABLE_CONTROL_TYPES.includes(requirement.controlType as EditableControlType)) {
      return { valid: false, error: 'El controlType no está permitido.' };
    }
  }
  return { valid: true };
}

function normalizeDraft(requirements: InputRequirement[]): InputRequirement[] {
  return requirements.map((requirement) => ({
    ...requirement,
    key: requirement.key.trim(),
    allowedValues: requirement.controlType === 'select' ? requirement.allowedValues : undefined,
  }));
}

export async function persistDraftRequirements(
  projectSlug: string,
  caseId: number,
  requirements: InputRequirement[],
  saver: typeof saveCaseInputRequirements = saveCaseInputRequirements,
) {
  return saver(projectSlug, caseId, requirements);
}

type Props = {
  projectSlug: string;
  caseId: number;
  initialRequirements: InputRequirement[];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

export function InputRequirementsEditor({ projectSlug, caseId, initialRequirements, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState(() => cloneEditableRequirements(initialRequirements));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(cloneEditableRequirements(initialRequirements)), [caseId, initialRequirements]);

  const updateRow = (index: number, patch: Partial<InputRequirement>) => {
    setDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const handleSave = async () => {
    const normalized = normalizeDraft(draft);
    const validation = validateEditableRequirements(normalized);
    if (!validation.valid) { setError(validation.error ?? 'Requirements inválidos.'); return; }
    setSaving(true);
    setError(null);
    try {
      await persistDraftRequirements(projectSlug, caseId, normalized);
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[#48A157]/30 bg-[#48A157]/5 p-4">
      <div className="mb-3 text-[12px] font-semibold text-[#1a1f2e]">Configurar datos requeridos</div>
      <div className="flex flex-col gap-3">
        {draft.map((requirement, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-[#E8EBEC] bg-white p-3 md:grid-cols-6">
            <input aria-label="key" value={requirement.key} onChange={(event) => updateRow(index, { key: event.target.value })} placeholder="key" />
            <input aria-label="label" value={requirement.label ?? ''} onChange={(event) => updateRow(index, { label: event.target.value })} placeholder="label" />
            <select aria-label="controlType" value={requirement.controlType ?? 'text'} onChange={(event) => updateRow(index, { controlType: event.target.value, allowedValues: event.target.value === 'select' ? requirement.allowedValues ?? [] : undefined })}>
              {EDITABLE_CONTROL_TYPES.map((controlType) => <option key={controlType} value={controlType}>{controlType}</option>)}
            </select>
            <label><input type="checkbox" checked={requirement.required === true} onChange={(event) => updateRow(index, { required: event.target.checked })} /> required</label>
            <label><input type="checkbox" checked={requirement.sensitive === true} onChange={(event) => updateRow(index, { sensitive: event.target.checked })} /> sensitive</label>
            {requirement.controlType === 'select' && <input aria-label="allowedValues" value={(requirement.allowedValues ?? []).join(', ')} onChange={(event) => updateRow(index, { allowedValues: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder="allowedValues" />}
            <button type="button" onClick={() => setDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Eliminar fila</button>
          </div>
        ))}
      </div>
      {error && <div role="alert" className="mt-3 text-[12px] text-[#E63946]">{error}</div>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setDraft((current) => addEditableRequirement(current))}>Agregar campo</button>
        <button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </div>
  );
}
