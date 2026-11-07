import { useEffect, useRef, useState } from 'react';
import { TestFileAssetInput } from './TestFileAssetInput';

export function documentSetComplete(value: string): boolean {
  try {
    const data = JSON.parse(value);
    return data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0
      && Object.keys(data).length <= 20
      && Object.entries(data).every(([label, ref]) => label.trim() && typeof ref === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ref));
  } catch { return false; }
}
type DocumentRow = { id: string; label: string; fileRef: string };
const newRowId = () => crypto.randomUUID();
const rowsOf = (value: string): DocumentRow[] => {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([label, fileRef]) => ({ id: newRowId(), label, fileRef })) : []; }
  catch { return []; }
};

/** A document group has independently labelled fixtures; the live form determines its cardinality. */
export function TestDocumentSetInput({ projectSlug, area, value, onChange, disabled = false, variant = 'dark' }: {
  projectSlug?: string; area: 'test-design' | 'runs'; value: string; onChange: (value: string) => void; disabled?: boolean;
  /** `light` is the compact form used in Recording: the document labels come from the recording, so only the file is chosen. */
  variant?: 'dark' | 'light';
}) {
  const light = variant === 'light';
  const [rows, setRows] = useState(() => rowsOf(value));
  const rowsRef = useRef(rows);
  const lastValue = useRef(value);
  useEffect(() => { if (lastValue.current !== value) { lastValue.current = value; const next = rowsOf(value); rowsRef.current = next; setRows(next); } }, [value]);
  const update = (transform: (current: DocumentRow[]) => DocumentRow[]) => {
    const next = transform(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
    const duplicate = new Set(next.map(row => row.label)).size !== next.length;
    const serialized = duplicate ? '' : JSON.stringify(Object.fromEntries(next.map(row => [row.label, row.fileRef])));
    lastValue.current = serialized; onChange(serialized);
  };
  const duplicate = new Set(rows.map(row => row.label)).size !== rows.length;
  const nextLabel = (current: DocumentRow[]) => { let n = current.length + 1; while (current.some(row => row.label === `Documento ${n}`)) n += 1; return `Documento ${n}`; };
  const linkButton = 'inline-flex min-h-9 items-center rounded-md border border-[#B9C8D7] bg-white px-3 py-2 text-[11px] font-semibold text-[#104B99] transition hover:border-[#104B99] hover:bg-[#F4F8FD] disabled:opacity-50';
  const removeButton = 'rounded-md border border-[#F0D5D2] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#B4463C] hover:bg-[#FDF0EF] disabled:opacity-50';
  const renderRow = (row: DocumentRow, index: number) => <div key={row.id} className={light
    ? 'min-w-0 space-y-1.5 rounded-md border border-[#E5EBF1] bg-white p-2.5'
    : 'rounded border border-white/15 p-2 space-y-1'}>
    {light && rows.length > 1 && <div className="text-[11px] font-medium text-[#1A1F2E]">{row.label || `Documento ${index + 1}`}</div>}
    {!light && <input aria-label={`Etiqueta del documento ${index + 1}`} placeholder="Etiqueta exacta del documento" value={row.label} disabled={disabled}
      className="w-full rounded bg-[#171C26] border border-white/20 p-1.5" onChange={event => update(current => current.map(item => item.id === row.id ? { ...item, label: event.target.value } : item))} />}
    <TestFileAssetInput variant={variant} projectSlug={projectSlug} area={area} value={row.fileRef} disabled={disabled}
      onChange={fileRef => update(current => current.map(item => item.id === row.id ? { ...item, fileRef } : item))}
      actions={light && <>
        {rows.length > 1 && <button type="button" className={removeButton} disabled={disabled} onClick={() => update(current => current.filter(item => item.id !== row.id))}>Quitar este documento</button>}
        {index === rows.length - 1 && <button type="button" className={linkButton} disabled={disabled || rows.length >= 20}
          onClick={() => update(current => [...current, { id: newRowId(), label: nextLabel(current), fileRef: '' }])}>+ Agregar otro documento</button>}
      </>} />
    {!light && rows.length > 1 && <button type="button" disabled={disabled} onClick={() => update(current => current.filter(item => item.id !== row.id))}>Quitar documento</button>}
  </div>;

  return <div className={light ? 'mt-2 space-y-2 text-[11px] text-[#58646D]' : 'space-y-2 text-[11px] text-white/70'}>
    {!light && <p>Asocia cada etiqueta de documento de la pantalla con su archivo. Se usarán los campos que aparezcan durante la ejecución.</p>}
    {light && rows.length > 1 && <p className="text-[11px] leading-relaxed text-[#58646D]">Selecciona un archivo para cada documento requerido.</p>}
    {light ? <div className={rows.length > 1 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-3'}>{rows.map(renderRow)}</div> : rows.map(renderRow)}
    {!light && <button type="button" disabled={disabled || rows.length >= 20} onClick={() => update(current => [...current, { id: newRowId(), label: '', fileRef: '' }])}>+ Agregar documento</button>}
    {duplicate && <p role="alert">Cada documento debe tener una etiqueta distinta.</p>}
  </div>;
}
