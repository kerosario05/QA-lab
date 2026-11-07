import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
type Application = { alias: string; baseUrl: string };
export function JiraWorkflowApplications({ projectSlug, area, disabled = false }: {
  projectSlug?: string; area: 'test-design' | 'runs'; disabled?: boolean;
}) {
  const [rows, setRows] = useState<Application[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedProject, setLoadedProject] = useState('');
  const [saved, setSaved] = useState(false);
  const activeProject = useRef(projectSlug ?? '');
  activeProject.current = projectSlug ?? '';
  const endpoint = `${API_BASE}/api/${area}/workflow-applications?projectSlug=${encodeURIComponent(projectSlug ?? '')}`;
  useEffect(() => {
    let alive = true; setLoadedProject(''); setRows([]); setError(''); setSaved(false); setSaving(false);
    if (projectSlug) fetch(endpoint, { cache: 'no-store' }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.message || 'No se pudo cargar la configuración.');
      if (alive) { setRows(Object.entries(body.applications ?? {}).map(([alias, app]) => ({ alias, baseUrl: (app as { baseUrl: string }).baseUrl }))); setLoadedProject(projectSlug); }
    }).catch(reason => { if (alive) setError(String(reason.message)); });
    return () => { alive = false; };
  }, [endpoint, projectSlug]);
  const update = (next: Application[]) => { setRows(next); setSaved(false); };
  const save = async () => {
    if (new Set(rows.map(row => row.alias.trim())).size !== rows.length || rows.some(row => !row.alias.trim() || !row.baseUrl.trim())) {
      setError('Completa cada nombre y URL; los nombres deben ser únicos.'); return;
    }
    const savingProject = projectSlug;
    setSaving(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applications: Object.fromEntries(rows.map(row => [row.alias.trim(), { baseUrl: row.baseUrl.trim() }])) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || 'No se pudo guardar.');
      if (activeProject.current === savingProject) setSaved(true);
    } catch (reason) { if (activeProject.current === savingProject) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (activeProject.current === savingProject) setSaving(false); }
  };
  if (!projectSlug) return null;
  return <details className="my-3 rounded-xl border border-[#D7E6D8] bg-[#F4F8F4] p-3 text-[12px] text-[#3D6944]">
    <summary className="cursor-pointer font-semibold">Flujos entre aplicaciones</summary>
    <p className="my-2">La aplicación de este proyecto se llama «principal». Agrega las otras webs usando los nombres de la HU y guarda antes de generar. Cada aplicación conserva su página; sus datos de acceso se completan en el escenario.</p>
    {rows.map((row, index) => <div key={index} className="flex flex-wrap gap-2 my-2">
      <input aria-label={`Nombre de aplicación ${index + 1}`} placeholder="Nombre de la aplicación" value={row.alias} disabled={disabled || saving} className="rounded border p-2 bg-white" onChange={event => update(rows.map((item, offset) => offset === index ? { ...item, alias: event.target.value } : item))} />
      <input aria-label={`URL de aplicación ${index + 1}`} type="url" placeholder="https://…" value={row.baseUrl} disabled={disabled || saving} className="flex-1 min-w-56 rounded border p-2 bg-white" onChange={event => update(rows.map((item, offset) => offset === index ? { ...item, baseUrl: event.target.value } : item))} />
      <button type="button" disabled={disabled || saving} onClick={() => update(rows.filter((_, offset) => offset !== index))}>Quitar</button>
    </div>)}
    <div className="flex gap-4"><button type="button" disabled={disabled || saving || loadedProject !== projectSlug} onClick={() => update([...rows, { alias: '', baseUrl: '' }])}>+ Agregar aplicación</button>
      <button type="button" disabled={disabled || saving || loadedProject !== projectSlug} onClick={() => void save()}>{saving ? 'Guardando…' : saved ? 'Configuración guardada' : 'Guardar aplicaciones'}</button></div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </details>;
}
