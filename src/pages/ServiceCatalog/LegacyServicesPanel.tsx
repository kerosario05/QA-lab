import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Database, ListChecks, XCircle } from 'lucide-react';
import type { ProjectListItem } from '../Configuracion';
import { ReadyCedulasPanel } from './ReadyCedulasPanel';
import { PortalCredentialsPanel } from './PortalCredentialsPanel';
import { CancellationRunPanel } from './CancellationRunPanel';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
type DataConfig = { enabled: boolean; database: string; savedDatabase: string; databases: string[] };
type CancellationConfig = { enabled: boolean; available: boolean };

function projectEndpoint(slug: string, path: string) { return `${API_BASE}/api/projects/${encodeURIComponent(slug)}${path}`; }
async function jsonOrNull(url: string) { const response = await fetch(url); if (response.status === 404) return null; const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || 'No se pudo cargar el servicio.'); return body; }

const services = [
  { id: 'data-cedulas', title: 'Generación de datos de cédula', description: 'Genera identificaciones nuevas comparándolas contra la base Oracle seleccionada.', tone: 'bg-[#EAF5ED] text-[#34773D]' },
  { id: 'ready-cedulas', title: 'Generación de cédulas listas', description: 'Prepara cédulas aprobadas por el motor de decisión y las deja listas para reutilizar.', tone: 'bg-[#FBF1E3] text-[#9A5B0B]' },
  { id: 'cancellation', title: 'Cancelación de solicitudes de prueba', description: 'Cancela y verifica la solicitud creada antes de iniciar la promoción.', tone: 'bg-[#EEF2F8] text-[#104B99]' },
] as const;

export function useLegacyServices(projects: ProjectListItem[]): { cards: ReactNode; detail: ReactNode } {
  const enabledProjects = projects.filter(project => project.enabled);
  const [openService, setOpenService] = useState<string>('');
  const [dataByProject, setDataByProject] = useState<Record<string, DataConfig>>({});
  const [cancellationByProject, setCancellationByProject] = useState<Record<string, CancellationConfig>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!openService || openService === 'ready-cedulas' || openService === 'cancellation-run' || enabledProjects.length === 0) return;
    let alive = true;
    setLoading(true); setError('');
    const load = async () => {
      try {
        const aliasesBody = openService === 'data-cedulas' ? await fetch(`${API_BASE}/api/data-cedulas/databases`).then(response => response.json()).catch(() => ({})) : {};
        const aliases = Array.isArray(aliasesBody.databases) ? aliasesBody.databases : [];
        const results = await Promise.all(enabledProjects.map(async project => {
          if (openService === 'data-cedulas') {
            const body = await jsonOrNull(projectEndpoint(project.slug, '/data-services'));
            const configured = body?.services?.dataCedulas;
            const database = configured?.database ?? aliases[0] ?? '';
            return [project.slug, { enabled: configured?.enabled === true, database, savedDatabase: configured?.database ?? '', databases: body?.databases ?? aliases }] as const;
          }
          const body = await jsonOrNull(projectEndpoint(project.slug, '/request-cancellation-config'));
          return [project.slug, { enabled: body?.enabled === true, available: Boolean(body) }] as const;
        }));
        if (!alive) return;
        if (openService === 'data-cedulas') setDataByProject(Object.fromEntries(results));
        else setCancellationByProject(Object.fromEntries(results));
      } catch (reason) { if (alive) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las asignaciones.'); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [openService, projects]);

  const saveData = async (slug: string) => {
    const config = dataByProject[slug]; if (!config) return;
    setSaving(slug); setError('');
    try {
      const response = await fetch(projectEndpoint(slug, '/data-services/data-cedulas'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: config.enabled, database: config.database }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No se pudo guardar la asignación.');
      setDataByProject(previous => ({ ...previous, [slug]: { ...previous[slug], enabled: body.enabled === true, database: body.database ?? config.database, savedDatabase: body.database ?? config.database } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la asignación.'); }
    finally { setSaving(''); }
  };

  const saveCancellation = async (slug: string) => {
    const config = cancellationByProject[slug]; if (!config?.available) return;
    setSaving(slug); setError('');
    try {
      const response = await fetch(projectEndpoint(slug, '/request-cancellation-config'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: config.enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No se pudo guardar la asignación.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la asignación.'); }
    finally { setSaving(''); }
  };

  const cards = services.map(service => {
    const open = openService === service.id;
    const Icon = service.id === 'data-cedulas' ? Database : service.id === 'ready-cedulas' ? ListChecks : XCircle;
    return <article key={service.id} className={'flex flex-col rounded-2xl border bg-white p-5 transition ' + (open ? 'border-[#1a1f2e]' : 'border-[#E8EBEC]')}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={'flex h-10 w-10 items-center justify-center rounded-xl ' + service.tone}><Icon size={18} /></div>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-[#F4F1EA] text-[#58646D]">{service.id === 'cancellation' ? 'Discovery' : 'Datos'}</span>
      </div>
      <h2 className="text-[16px] font-semibold text-[#1a1f2e]">{service.title}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[#58646D]">{service.description}</p>
      <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-[#E8EBEC] pt-4">
        {service.id === 'cancellation' && <button type="button" onClick={() => setOpenService(openService === 'cancellation-run' ? '' : 'cancellation-run')} aria-expanded={openService === 'cancellation-run'}
          className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ' + (openService === 'cancellation-run' ? 'bg-[#1a1f2e] text-white' : 'bg-[#48A157] text-white hover:opacity-90')}>
          Ejecutar {openService === 'cancellation-run' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>}
        <button type="button" onClick={() => setOpenService(open ? '' : service.id)} aria-expanded={open}
          className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ' + (open ? 'bg-[#1a1f2e] text-white' : 'border border-[#E8EBEC] bg-white text-[#1a1f2e] hover:border-[#1a1f2e]/40')}>
          {service.id === 'ready-cedulas' ? 'Abrir' : 'Asignar a proyectos'} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
    </article>;
  });

  const detail = <>
    {openService === 'ready-cedulas' && <ReadyCedulasPanel />}
    {openService === 'cancellation-run' && <CancellationRunPanel />}
    {(openService === 'data-cedulas' || openService === 'cancellation') && <PortalCredentialsPanel />}
    {openService && openService !== 'ready-cedulas' && openService !== 'cancellation-run' && <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-[#1a1f2e]">Asignar {services.find(service => service.id === openService)?.title}</h3><p className="text-[11px] text-[#8B999D]">Activa el servicio por proyecto.</p></div>{loading && <span className="text-[11px] text-[#8B999D]">Cargando…</span>}</div><div className="space-y-2">{enabledProjects.map(project => {
      const data = dataByProject[project.slug]; const cancellation = cancellationByProject[project.slug]; const enabled = openService === 'data-cedulas' ? data?.enabled === true : cancellation?.enabled === true; const available = openService === 'data-cedulas' ? Boolean(data) : cancellation?.available !== false;
      return <div key={project.slug} className="rounded-xl border border-[#E8EBEC] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-[12px] font-medium text-[#1a1f2e]"><input type="checkbox" checked={enabled} disabled={loading || !available} onChange={event => { if (openService === 'data-cedulas') setDataByProject(previous => ({ ...previous, [project.slug]: { ...previous[project.slug], enabled: event.target.checked } })); else setCancellationByProject(previous => ({ ...previous, [project.slug]: { ...previous[project.slug], enabled: event.target.checked } })); }} /><span>{project.name}</span><span className="text-[10px] text-[#8B999D]">{project.slug}</span></label>{openService === 'data-cedulas' && data && <button type="button" onClick={() => void saveData(project.slug)} disabled={saving === project.slug || (data.enabled && !data.database)} className="rounded-full bg-[#1a1f2e] px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50">{saving === project.slug ? 'Guardando…' : 'Guardar'}</button>}{openService === 'cancellation' && cancellation?.available && <button type="button" onClick={() => void saveCancellation(project.slug)} disabled={saving === project.slug} className="rounded-full bg-[#48A157] px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50">{saving === project.slug ? 'Guardando…' : 'Guardar'}</button>}</div>{openService === 'data-cedulas' && data?.enabled && <div className="mt-3 max-w-sm pl-6"><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]" htmlFor={`tns-${project.slug}`}>Base TNS</label><select id={`tns-${project.slug}`} value={data.database} onChange={event => setDataByProject(previous => ({ ...previous, [project.slug]: { ...previous[project.slug], database: event.target.value } }))} className="w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px]"><option value="">Selecciona una base</option>{data.databases.map(alias => <option key={alias} value={alias}>{alias}</option>)}</select></div>}</div>;
    })}{enabledProjects.length === 0 && <p className="text-[12px] text-[#8B999D]">No hay proyectos habilitados.</p>}</div>{error && <p role="alert" className="mt-3 text-[12px] text-[#E63946]">{error}</p>}</div>}
  </>;

  return { cards, detail };
}
