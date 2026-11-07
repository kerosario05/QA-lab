import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { testFilesApi, type TestFileAsset } from '../services/test-files';

export function TestFileAssetInput({ projectSlug, area, value, onChange, disabled = false, variant = 'dark', actions }: {
  projectSlug?: string;
  area: 'test-design' | 'runs';
  value: string;
  onChange: (fileRef: string) => void;
  disabled?: boolean;
  variant?: 'dark' | 'light';
  /** Extra row controls, placed horizontally below the picker in the compact recording layout. */
  actions?: ReactNode;
}) {
  const light = variant === 'light';
  const [files, setFiles] = useState<TestFileAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [loadedProjectSlug, setLoadedProjectSlug] = useState('');

  useEffect(() => {
    let alive = true;
    if (!projectSlug) { setFiles([]); setLoadedProjectSlug(''); return; }
    setLoading(true);
    testFilesApi.list(area, projectSlug).then(items => { if (alive) { setFiles(items); setLoadedProjectSlug(projectSlug); setError(''); } })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'No se pudo consultar el almacenamiento de archivos.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [area, projectSlug]);

  useEffect(() => {
    if (!projectSlug || loadedProjectSlug !== projectSlug || loading || !value) return;
    if (files.some(file => file.fileRef === value)) return;
    onChange('');
    setError('El archivo guardado no está disponible para este proyecto. Adjunta el archivo nuevamente.');
  }, [files, loadedProjectSlug, loading, onChange, projectSlug, value]);

  const upload = async (file?: File) => {
    if (!file || !projectSlug) return;
    setUploading(true); setError('');
    try {
      const asset = await testFilesApi.upload(area, projectSlug, file);
      setFiles(current => [asset, ...current.filter(item => item.fileRef !== asset.fileRef)]);
      onChange(asset.fileRef);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el archivo de prueba.');
    } finally { setUploading(false); }
  };

  const inputClass = light
    ? 'min-h-10 min-w-0 w-full rounded-md border border-[#B9C8D7] bg-white px-3 py-2 text-[12px] text-[#1A1F2E] outline-none transition focus:border-[#104B99] focus:ring-2 focus:ring-[#104B99]/15 disabled:bg-[#F3F4F6] disabled:text-[#8B999D]'
    : 'min-w-0 w-full rounded-md border border-white/15 bg-[#0d1119] px-2.5 py-1.5 text-[11px] text-white/80 disabled:opacity-50';
  const picker = <select aria-label="Archivo de prueba" className={inputClass} value={value} disabled={disabled || loading || !projectSlug}
    onChange={event => onChange(event.target.value)}>
    <option value="">{loading ? 'Cargando archivos…' : 'Selecciona o adjunta un archivo…'}</option>
    {files.map(file => <option key={file.fileRef} value={file.fileRef}>{file.filename}</option>)}
    {value && !files.some(file => file.fileRef === value) && <option value={value}>Archivo guardado (no disponible en este proyecto)</option>}
  </select>;
  // `relative` anchors the sr-only (absolute) input here; otherwise focusing it scrolls the whole page to its static position.
  const uploadControl = <label className={light
    ? 'relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#B9C8D7] bg-white px-3 py-2 text-[11px] font-semibold text-[#104B99] transition hover:border-[#104B99] hover:bg-[#F4F8FD] focus-within:ring-2 focus-within:ring-[#104B99]/15'
    : 'relative inline-flex cursor-pointer items-center gap-1 text-[10px] text-[#8B99A6] hover:text-white/80'}>
    {uploading ? <Loader2 size={light ? 13 : 11} className="animate-spin" /> : <UploadCloud size={light ? 13 : 11} />}
    {uploading ? 'Guardando archivo…' : light ? 'Subir otro archivo' : 'Adjuntar archivo de prueba'}
    <input type="file" className="sr-only" disabled={disabled || uploading || !projectSlug}
      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv,.rtf" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
  </label>;
  const helperText = !light && <span className="block text-[9px] text-white/40">
    Se guarda en el almacenamiento persistente del proyecto; máximo 25 MB.
  </span>;
  const errorMessage = error && <span role="alert" className={light ? 'block text-[11px] text-[#B4463C]' : 'block text-[10px] text-[#E58B82]'}>{error}</span>;

  if (light && actions) return <div className="grid min-w-0 grid-cols-1 items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0">{picker}</div>
    <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
      {uploadControl}{actions}
    </div>
    {errorMessage && <div className="sm:col-span-2">{errorMessage}</div>}
  </div>;

  return <div className="min-w-0 space-y-1">
    {picker}
    {uploadControl}
    {helperText}
    {errorMessage}
  </div>;
}
