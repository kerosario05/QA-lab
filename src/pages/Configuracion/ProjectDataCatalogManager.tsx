import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import type { ProjectListItem } from './index';
import { deriveProjectDataCatalogAliases, formatProjectDataCatalogOptions, parseProjectDataCatalogOptions, projectDataCatalogApi, type ProjectDataCatalog } from '../../services/project-data-catalog';

const input = 'w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#104B99]';
export function ProjectDataCatalogManager({ projects }: { projects: ProjectListItem[] }) {
  const [slug, setSlug] = useState('');
  const [catalogs, setCatalogs] = useState<ProjectDataCatalog[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [name, setName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [aliases, setAliases] = useState('');
  const [catalogActive, setCatalogActive] = useState(true);
  const [optionsText, setOptionsText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async (project: string) => {
    setSlug(project);
    setSelected('');
    setName(''); setFieldName(''); setAliases(''); setOptionsText(''); setCatalogActive(true);
    setError('');
    if (!project) { setCatalogs([]); return; }
    try { const list = await projectDataCatalogApi.list(project, true); setCatalogs(list); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los catálogos.'); }
  };
  useEffect(() => { if (selected === 'new') { setName(''); setFieldName(''); setAliases(''); setOptionsText(''); setCatalogActive(true); return; }
    if (!selected) return;
    const catalog = catalogs.find(item => item.id === selected); if (!catalog) return;
    setName(catalog.name); setFieldName(catalog.fieldName); setAliases(catalog.aliases.join(', '));
    setCatalogActive(catalog.active);
    setOptionsText(formatProjectDataCatalogOptions(catalog.options));
  }, [selected, catalogs]);
  const save = async () => {
    if (!slug) return;
    setSaving(true); setError('');
    try {
      const priorOptions = selected === 'new' ? [] : catalogs.find(c => c.id === selected)?.options ?? [];
      const options = parseProjectDataCatalogOptions(optionsText, priorOptions);
      const generatedAliases = deriveProjectDataCatalogAliases(fieldName);
      const previousFieldAliases = selected === 'new' ? [] : deriveProjectDataCatalogAliases(catalogs.find(c => c.id === selected)?.fieldName ?? '');
      const manualAliases = aliases.split(',').map(value => value.trim()).filter(Boolean).filter(value => !previousFieldAliases.includes(value));
      const payload = { name, fieldName, aliases: [...new Set([...generatedAliases, ...manualAliases])], active: catalogActive, options };
      const saved = selected === 'new' ? await projectDataCatalogApi.create(slug, payload) : await projectDataCatalogApi.update(slug, selected, payload);
      setCatalogs(previous => [...previous.filter(c => c.id !== saved.id), saved]); setSelected(saved.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el catálogo.'); }
    finally { setSaving(false); }
  };
  return <section className="space-y-4">
    <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5">
      <div className="mb-4 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1f2e] text-[10px] font-semibold text-white">1</span><div><h2 className="text-[13px] font-semibold text-[#1a1f2e]">Proyecto para configurar</h2><p className="text-[11px] text-[#8B999D]">Selecciona un proyecto para administrar sus catálogos.</p></div></div>
      <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.filter(project => project.enabled).map(project => {
          const active = project.slug === slug;
          return <button type="button" key={project.slug} aria-pressed={active} onClick={() => void load(project.slug)} className={'relative overflow-hidden rounded-2xl border-2 p-6 text-left transition-all ' + (active ? 'border-[#1a1f2e] bg-[#1a1f2e] text-white' : 'border-[#E8EBEC] bg-white hover:border-[#1a1f2e]/40')}>
            {active && <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#48A157] opacity-20" />}
            <div className="relative mb-3 flex items-start justify-between"><span className={'text-[10px] font-semibold uppercase tracking-wider ' + (active ? 'text-white/50' : 'text-[#8B999D]')}>{project.projectType === 2 ? 'Mobile · Android' : 'Web · Playwright'}</span>{active && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#48A157]"><Check size={12} className="text-white" strokeWidth={3} /></span>}</div>
            <div className={'text-[22px] font-medium leading-tight ' + (active ? 'text-white' : 'text-[#1a1f2e]')} style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{project.name}</div>
            <div className={'mt-1.5 text-[12px] ' + (active ? 'text-white/60' : 'text-[#8B999D]')}>{project.projectType === 2 ? 'Android · Appium' : 'Web · Playwright'}</div>
          </button>;
        })}
        {projects.filter(project => project.enabled).length === 0 && <div className="text-[12px] text-[#8B999D]">No hay proyectos habilitados.</div>}
      </div>
    </div>
    {slug && <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Catálogos del proyecto</div><h2 className="text-[16px] font-semibold text-[#1a1f2e]">{projects.find(project => project.slug === slug)?.name}</h2><p className="mt-1 text-[11px] text-[#8B999D]">Selecciona un catálogo para editarlo o crea uno nuevo.</p></div><button type="button" onClick={() => setSelected('new')} className="rounded-full bg-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-white">+ Nuevo catálogo</button></div>
      <div className="grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {catalogs.map(catalog => {
          const active = catalog.id === selected;
          return <button type="button" key={catalog.id} aria-pressed={active} onClick={() => setSelected(active ? '' : catalog.id)} className={'relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ' + (active ? 'border-[#1a1f2e] bg-[#1a1f2e] text-white' : 'border-[#E8EBEC] bg-white hover:border-[#1a1f2e]/40')}>
            {active && <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-[#48A157] opacity-20" />}
            <div className="relative mb-2 flex items-start justify-between"><span className={'text-[10px] font-semibold uppercase tracking-wider ' + (active ? 'text-white/50' : 'text-[#8B999D]')}>{catalog.active ? 'Activo' : 'Inactivo'} · {catalog.options.length} opciones</span>{active && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#48A157]"><Check size={12} className="text-white" strokeWidth={3} /></span>}</div>
            <div className={'text-[18px] font-medium leading-tight ' + (active ? 'text-white' : 'text-[#1a1f2e]')}>{catalog.name}</div>
            <div className={'mt-1.5 text-[12px] ' + (active ? 'text-white/60' : 'text-[#8B999D]')}>{catalog.fieldName}</div>
          </button>;
        })}
        {catalogs.length === 0 && <div className="text-[12px] text-[#8B999D]">Este proyecto aún no tiene catálogos.</div>}
      </div>
      {selected && <div className="mt-4 rounded-2xl border border-[#E8EBEC] bg-[#FAFBFC] p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-[#1a1f2e]">{selected === 'new' ? 'Nuevo catálogo' : 'Editar catálogo'}</h3><button type="button" onClick={() => setSelected('')} className="text-[11px] text-[#68777D]">Cerrar</button></div>
      <div className="grid gap-3 md:grid-cols-2"><input className={input} placeholder="Nombre del catálogo" value={name} onChange={event => setName(event.target.value)} /><div><input className={input} placeholder="Campo asociado, p. ej. Cuenta de origen" value={fieldName} onChange={event => setFieldName(event.target.value)} />{deriveProjectDataCatalogAliases(fieldName).length > 0 && <p className="mt-1 text-[10px] text-[#8B999D]">Alias automático: {deriveProjectDataCatalogAliases(fieldName).join(', ')}</p>}</div><textarea className={input + ' min-h-24'} placeholder={'Cuenta Corriente\nCuenta de ahorros'} value={optionsText} onChange={event => setOptionsText(event.target.value)} /><details className="text-[11px] text-[#58646D]"><summary className="cursor-pointer select-none">Opciones avanzadas: alias personalizados</summary><input className={input + ' mt-2'} placeholder="Sinónimos del campo, separados por coma" value={aliases} onChange={event => setAliases(event.target.value)} /></details><label className="flex items-center gap-2 text-[12px] text-[#58646D]"><input type="checkbox" checked={catalogActive} onChange={event => setCatalogActive(event.target.checked)} />Catálogo activo</label></div>
      {error && <div className="mt-3 text-[12px] text-[#E63946]">{error}</div>}<div className="mt-3 flex justify-end"><button disabled={saving || !name.trim() || !fieldName.trim()} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1f2e] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"><Save size={13} />{saving ? 'Guardando…' : 'Guardar catálogo'}</button></div>
      </div>}
    </div>}
  </section>;
}
