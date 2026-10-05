import { useEffect, useRef, useState } from 'react';
import { encodeSelectionRule, parseSelectionRule, matchingSelectionOptions } from '../../services/recordings/dynamic-selection-rule';

type Props = {
  projectSlug: string; fieldKey: string; label: string; value: string;
  options: string[]; disabled: boolean; onApply: (value: string) => void; onValueChange?: (value: string) => void;
};

/** Dynamic criteria update the scenario immediately; blur persists through the dataset API. */
export function DynamicListSelection({ projectSlug, fieldKey, label, value, options, disabled, onApply, onValueChange }: Props) {
  const rule = parseSelectionRule(value);
  const [mode, setMode] = useState(rule ? 'criteria' : 'index');
  const [terms, setTerms] = useState(rule?.terms.join('; ') ?? '');
  const [position, setPosition] = useState(rule ? String(rule.matchIndex + 1) : '1');
  const [notice, setNotice] = useState('');
  const lastEmission = useRef<{ context: string; value: string } | null>(null);
  const context = JSON.stringify([projectSlug, fieldKey]);
  const storageKey = `qalab:dynamic-selection:v1:${encodeURIComponent(projectSlug)}:${encodeURIComponent(fieldKey)}`;
  useEffect(() => {
    if (lastEmission.current?.context === context && lastEmission.current.value === value) return;
    const current = parseSelectionRule(value);
    setMode(current ? 'criteria' : 'index');
    setTerms(current?.terms.join('; ') ?? '');
    setPosition(current ? String(current.matchIndex + 1) : '1');
    setNotice('');
  }, [value, projectSlug, fieldKey, context]);
  function publishDraft(nextTerms: string, nextPosition: string) {
    if (!onValueChange) return;
    let nextValue = '';
    try { nextValue = encodeSelectionRule({ terms: nextTerms.split(';').map(term => term.trim()).filter(Boolean), matchIndex: Number(nextPosition) - 1 }); }
    catch { /* Incomplete criteria clear runtime data rather than retaining an old selection. */ }
    lastEmission.current = { context, value: nextValue };
    onValueChange(nextValue);
  }
  const draft = { terms: terms.split(';').map(term => term.trim()).filter(Boolean), matchIndex: Number(position) - 1 };
  let encoded: string | undefined;
  try { encoded = encodeSelectionRule(draft); } catch { /* Empty drafts cannot be applied. */ }
  const matches = encoded ? matchingSelectionOptions(options.map(label => ({ label, value: label })), draft) : [];
  // Suggestions are presentation only. Choosing one updates the explicit QA rule;
  // no project names, account semantics or currency dictionary participate.
  const suggestions = [...new Set(options.flatMap(option => option.split(/\s*[/|·]\s*/))
    .map(fragment => fragment.replace(/\d[\d.,]*/g, '').replace(/[•*]+/g, '').trim())
    .filter(fragment => fragment.length > 1 && fragment.length <= 120))];
  const pending = mode === 'criteria' && encoded !== value;
  const inputClass = 'mt-1 w-full rounded border border-[#D9E2EC] bg-white px-2 py-1 text-[11px] disabled:bg-[#F3F4F6]';
  return <div className="mt-1 space-y-1" onBlurCapture={event => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (mode === 'criteria' && encoded && (onValueChange || encoded !== value)) { onApply(encoded); setNotice('Regla aplicada al salir del editor.'); }
  }}>
    <select aria-label={`Modo de selección de ${label}`} value={mode} disabled={disabled} className={inputClass}
      onChange={event => { setMode(event.target.value); setNotice(''); if (event.target.value === 'criteria') publishDraft(terms, position); else if (onValueChange) { lastEmission.current = { context, value: '' }; onValueChange(''); } }}>
      <option value="index">Por posición en la lista</option>
      <option value="criteria">Por características y posición</option>
    </select>
    {mode === 'index' ? <select aria-label={label} value={rule ? '' : value} disabled={disabled} className={inputClass}
      onChange={event => onApply(event.target.value)}>
      <option value="">Selecciona una posición</option>
      {options.map((option, index) => <option key={`${index}:${option}`} value={option}>Opción {index + 1}</option>)}
    </select> : <>
      <input aria-label={`Características de ${label}`} value={terms} disabled={disabled} className={inputClass}
        placeholder="Texto a buscar; otro texto requerido" onChange={event => { setTerms(event.target.value); publishDraft(event.target.value, position); }} />
      {suggestions.length > 0 && <select aria-label={`Añadir característica observada de ${label}`} value="" disabled={disabled} className={inputClass}
        onChange={event => { if (event.target.value) { const nextTerms = terms.trim() ? `${terms}; ${event.target.value}` : event.target.value; setTerms(nextTerms); publishDraft(nextTerms, position); } }}>
        <option value="">Añadir característica observada</option>
        {suggestions.map(suggestion => <option key={suggestion} value={suggestion}>{suggestion}</option>)}
      </select>}
      <div className="text-[10px] text-[#58646D]">Todas las características deben aparecer en la opción actual. Separa cada una con ;</div>
      <label className="block text-[10px]">Posición entre las coincidencias
        <input aria-label={`Posición entre coincidencias de ${label}`} type="number" min="1" step="1" value={position}
          disabled={disabled} className={inputClass} onChange={event => { setPosition(event.target.value); publishDraft(terms, event.target.value); }} />
      </label>
      <div className="text-[10px] text-[#58646D]">Coincidencias en las opciones grabadas: {matches.length}. Se buscarán de nuevo durante la ejecución.</div>
      <button type="button" disabled={disabled || !encoded} className="text-[11px] text-[#104B99] disabled:opacity-50"
        onClick={() => { if (encoded) { onApply(encoded); setNotice('Regla aplicada al escenario.'); } }}>Aplicar regla</button>
      {pending && !onValueChange && <div className="text-[10px] text-[#B4463C]">Cambios pendientes: pulsa Aplicar regla antes de ejecutar.</div>}
      {projectSlug && <div className="flex flex-wrap gap-3 text-[10px] text-[#104B99]">
        <button type="button" disabled={disabled || !encoded} onClick={() => {
          try { if (encoded) { localStorage.setItem(storageKey, encoded); setNotice('Regla guardada para este campo y proyecto en este navegador.'); } }
          catch { setNotice('No se pudo guardar la regla en este navegador.'); }
        }}>Guardar regla del proyecto</button>
        <button type="button" disabled={disabled} onClick={() => {
          try {
            const saved = localStorage.getItem(storageKey) ?? '';
            const parsed = parseSelectionRule(saved);
            if (parsed) { const nextTerms = parsed.terms.join('; '); const nextPosition = String(parsed.matchIndex + 1); setTerms(nextTerms); setPosition(nextPosition); publishDraft(nextTerms, nextPosition); onApply(saved); setNotice('Regla cargada y aplicada al escenario.'); }
            else setNotice('No hay una regla guardada para este campo y proyecto.');
          } catch { setNotice('No se pudo cargar la regla.'); }
        }}>Cargar regla del proyecto</button>
      </div>}
    </>}
    {notice && <div role="status" className="text-[10px] text-[#58646D]">{notice}</div>}
  </div>;
}
