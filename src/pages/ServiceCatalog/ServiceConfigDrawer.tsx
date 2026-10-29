import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCircle2, Copy, FlaskConical, Loader2, Save, X } from 'lucide-react';
import type { ProjectListItem } from '../Configuracion';
import { serviceCatalogApi, type CatalogService, type ProjectServiceEntry, type ServiceTestResult } from '../../services/service-catalog';

const INPUT_CLS = 'w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]';
const LABEL_CLS = 'text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block';
const SELECT_CLS = 'w-full bg-white border border-[#E8EBEC] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#104B99] focus:ring-4 focus:ring-[#104B99]/10';
const ENVIRONMENTS = [
  { key: 'local', label: 'Local' },
  { key: 'qa', label: 'QA' },
];

type Form = { defaultChannel: string; allowedChannels: string; environments: string[] };

const EMPTY_FORM: Form = { defaultChannel: '', allowedChannels: '', environments: ['local', 'qa'] };

function settingsFrom(form: Form) {
  return {
    defaultChannel: form.defaultChannel.trim() || null,
    allowedChannels: form.allowedChannels.split(',').map(value => value.trim()).filter(Boolean),
    enabledEnvironments: form.environments,
  };
}

function formFrom(entry: ProjectServiceEntry): Form {
  return {
    defaultChannel: entry.settings.defaultChannel ?? '',
    allowedChannels: (entry.settings.allowedChannels ?? []).join(', '),
    environments: entry.settings.enabledEnvironments?.length ? entry.settings.enabledEnvironments : ['local', 'qa'],
  };
}

function sameSettings(a: Form, b: Form): boolean {
  return JSON.stringify(settingsFrom(a)) === JSON.stringify(settingsFrom(b));
}

type TestOutcome = { ok: true; result: ServiceTestResult } | { ok: false; text: string };

/**
 * Which projects use one catalog service and with which values. One form applies to every
 * project checked here: checking enables the service there, unchecking disables it. The
 * test call never shows the produced value: the engine only answers with its length.
 */
export function ServiceConfigDrawer({ service, projects, onClose, onSaved }: {
  service: CatalogService;
  projects: ProjectListItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<Record<string, ProjectServiceEntry | undefined>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [testSlug, setTestSlug] = useState('');
  const [identity, setIdentity] = useState('');
  const [testChannel, setTestChannel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestOutcome | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const loaded: Record<string, ProjectServiceEntry | undefined> = {};
    const failures: string[] = [];
    await Promise.all(projects.map(async (project) => {
      try {
        const list = await serviceCatalogApi.projectServices(project.slug);
        loaded[project.slug] = list.find(entry => entry.serviceKey === service.key);
      } catch {
        failures.push(project.name);
      }
    }));
    setEntries(loaded);
    const enabled = projects.filter(project => loaded[project.slug]?.configured && loaded[project.slug]?.enabled).map(project => project.slug);
    setChecked(new Set(enabled));
    const reference = enabled.map(slug => loaded[slug]!).find(Boolean);
    setForm(reference ? formFrom(reference) : EMPTY_FORM);
    setTestSlug(current => current || enabled[0] || projects[0]?.slug || '');
    if (failures.length > 0) setMessage({ kind: 'error', text: `No se pudo leer la configuración de: ${failures.join(', ')}.` });
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [service.key, projects]);

  const enabledBefore = useMemo(
    () => new Set(projects.filter(project => entries[project.slug]?.configured && entries[project.slug]?.enabled).map(project => project.slug)),
    [projects, entries],
  );
  // Projects already using the service with other values: saving gives them this form's values.
  const differing = projects.filter(project => checked.has(project.slug) && entries[project.slug]?.configured && !sameSettings(formFrom(entries[project.slug]!), form));
  const legacy = projects.filter(project => entries[project.slug]?.legacy);
  const toEnable = projects.filter(project => checked.has(project.slug));
  const toDisable = projects.filter(project => !checked.has(project.slug) && enabledBefore.has(project.slug));

  const toggle = (slug: string) => setChecked(current => {
    const next = new Set(current);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const failed: string[] = [];
    const settings = settingsFrom(form);
    for (const project of toEnable) {
      try { await serviceCatalogApi.saveProjectService(project.slug, service.key, { enabled: true, settings }); }
      catch (e) { failed.push(`${project.name}: ${e instanceof Error ? e.message : 'error'}`); }
    }
    for (const project of toDisable) {
      // Disabling keeps the project's own values, so turning it back on restores them.
      const own = entries[project.slug];
      try { await serviceCatalogApi.saveProjectService(project.slug, service.key, { enabled: false, settings: own ? settingsFrom(formFrom(own)) : settings }); }
      catch (e) { failed.push(`${project.name}: ${e instanceof Error ? e.message : 'error'}`); }
    }
    setSaving(false);
    if (failed.length > 0) {
      setMessage({ kind: 'error', text: `No se pudo guardar en ${failed.join(' · ')}` });
    } else {
      const parts = [
        toEnable.length > 0 ? `activo en ${toEnable.length} proyecto${toEnable.length === 1 ? '' : 's'}` : '',
        toDisable.length > 0 ? `desactivado en ${toDisable.length}` : '',
      ].filter(Boolean);
      setMessage({ kind: 'ok', text: `Servicio ${parts.join(' y ') || 'sin cambios'}.` });
    }
    onSaved();
    await load();
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setCopied(false);
    try {
      const params: Record<string, unknown> = { identity: identity.trim() };
      if (testChannel.trim()) params.channel = testChannel.trim();
      const result = await serviceCatalogApi.test(testSlug, service.key, params, settingsFrom(form));
      setTestResult({ ok: true, result });
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : 'La prueba falló.' });
    } finally {
      setTesting(false);
    }
  };

  const toggleEnvironment = (key: string) => setForm(current => ({
    ...current,
    environments: current.environments.includes(key)
      ? current.environments.filter(value => value !== key)
      : [...current.environments, key],
  }));

  const statusOf = (slug: string) => {
    const entry = entries[slug];
    if (!entry?.configured) return { text: 'Sin configurar', cls: 'text-[#8B999D]' };
    if (entry.legacy) return { text: entry.enabled ? 'Activo · tabla anterior' : 'Inactivo · tabla anterior', cls: 'text-[#B7791F]' };
    return entry.enabled ? { text: 'Activo', cls: 'text-[#48A157]' } : { text: 'Inactivo', cls: 'text-[#8B999D]' };
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label={`Configurar ${service.name}`}
      >
        <header className="flex items-start justify-between border-b border-[#E8EBEC] px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Catálogo de servicios</div>
            <h2 className="text-[16px] font-semibold text-[#1a1f2e]">{service.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-[#8B999D] hover:bg-[#F4F1EA]" aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={14} className="animate-spin" /> Cargando proyectos…</div>
          ) : (
            <section className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <span className={LABEL_CLS}>Proyectos que usan este servicio</span>
                  <div className="flex gap-3 text-[10px] font-semibold text-[#104B99]">
                    <button type="button" onClick={() => setChecked(new Set(projects.map(project => project.slug)))}>Todos</button>
                    <button type="button" onClick={() => setChecked(new Set())}>Ninguno</button>
                  </div>
                </div>
                {projects.length === 0 ? (
                  <div className="text-[12px] text-[#8B999D]">No hay proyectos habilitados.</div>
                ) : (
                  <ul className="divide-y divide-[#E8EBEC] rounded-xl border border-[#E8EBEC]">
                    {projects.map(project => {
                      const isChecked = checked.has(project.slug);
                      const status = statusOf(project.slug);
                      return (
                        <li key={project.slug}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[#FAFAF7]">
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                              style={{ background: isChecked ? '#104B99' : '#E8EBEC' }}
                            >
                              {isChecked && <Check size={10} className="text-white" strokeWidth={3.5} />}
                            </span>
                            <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => toggle(project.slug)} aria-label={project.name} />
                            <span className="flex-1 text-[13px] text-[#1a1f2e]">{project.name}</span>
                            <span className={'text-[10.5px] ' + status.cls}>{status.text}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-4">
                <div className="text-[11px] text-[#58646D]">Estos valores se aplican a todos los proyectos marcados.</div>
                <div>
                  <label className={LABEL_CLS} htmlFor="service-channel">Canal por defecto</label>
                  <input id="service-channel" className={INPUT_CLS} placeholder="ONBOARDINGWEB" value={form.defaultChannel}
                    onChange={event => setForm({ ...form, defaultChannel: event.target.value.toUpperCase() })} />
                  <p className="mt-1 text-[10px] text-[#8B999D]">Valor de CANAL en Oracle con el que se genera el token.</p>
                </div>
                <div>
                  <label className={LABEL_CLS} htmlFor="service-channels">Canales permitidos</label>
                  <input id="service-channels" className={INPUT_CLS} placeholder="APP, WEB" value={form.allowedChannels}
                    onChange={event => setForm({ ...form, allowedChannels: event.target.value.toUpperCase() })} />
                  <p className="mt-1 text-[10px] text-[#8B999D]">Separados por coma. Vacío = solo el canal por defecto.</p>
                </div>
                <div>
                  <span className={LABEL_CLS}>Ambientes</span>
                  <div className="flex gap-4">
                    {ENVIRONMENTS.map(environment => (
                      <label key={environment.key} className="flex items-center gap-2 text-[13px] text-[#1a1f2e]">
                        <input type="checkbox" checked={form.environments.includes(environment.key)} onChange={() => toggleEnvironment(environment.key)} />
                        {environment.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {differing.length > 0 && (
                <p className="rounded-xl bg-[#FFF9E9] px-3 py-2 text-[11px] text-[#765D22]">
                  {differing.map(project => project.name).join(', ')} {differing.length === 1 ? 'tiene' : 'tienen'} otros valores; al guardar quedan con estos.
                </p>
              )}
              {legacy.length > 0 && (
                <p className="text-[11px] text-[#B7791F]">
                  {legacy.map(project => project.name).join(', ')}: configuración de la tabla anterior de OTP. Al guardar pasa al catálogo.
                </p>
              )}

              {message && (
                <div className={'flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] ' + (message.kind === 'ok' ? 'bg-[#48A157]/10 text-[#48A157]' : 'bg-[#E63946]/5 text-[#E63946]')}>
                  {message.kind === 'ok' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />} {message.text}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#8B999D]">
                  {toEnable.length} activo{toEnable.length === 1 ? '' : 's'}{toDisable.length > 0 ? ` · ${toDisable.length} se desactivan` : ''}
                </span>
                <button
                  type="button"
                  disabled={saving || (toEnable.length === 0 && toDisable.length === 0) || (toEnable.length > 0 && form.environments.length === 0)}
                  onClick={() => void save()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1f2e] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                </button>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-[#E8EBEC] bg-[#FAFBFC] p-4">
            <div>
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1a1f2e]"><FlaskConical size={14} /> Probar el servicio</h3>
              <p className="mt-1 text-[11px] text-[#8B999D]">
                Genera un código real con los valores del formulario (aunque no estén guardados) y lo muestra aquí.
              </p>
            </div>
            {!service.availability.available && (
              <div className="rounded-xl bg-[#E9A23B]/8 px-3 py-2 text-[11px] text-[#B7791F]">
                El servidor todavía no puede usar este servicio: {service.availability.reasons.join(' ')}
              </div>
            )}
            <div>
              <label className={LABEL_CLS} htmlFor="service-test-project">Proyecto para la prueba</label>
              <select id="service-test-project" className={SELECT_CLS} value={testSlug} onChange={event => setTestSlug(event.target.value)}>
                {projects.map(project => <option key={project.slug} value={project.slug}>{project.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS} htmlFor="service-identity">Identidad (cédula de prueba)</label>
              <input id="service-identity" className={INPUT_CLS} inputMode="numeric" value={identity} onChange={event => setIdentity(event.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS} htmlFor="service-test-channel">Canal (opcional)</label>
              <input id="service-test-channel" className={INPUT_CLS} placeholder={form.defaultChannel || 'Canal por defecto'} value={testChannel}
                onChange={event => setTestChannel(event.target.value.toUpperCase())} />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!testSlug || !identity.trim() || testing || !service.availability.available}
                onClick={() => void runTest()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1a1f2e] px-4 py-2 text-[12px] font-semibold text-[#1a1f2e] disabled:opacity-40"
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} Probar
              </button>
            </div>
            {testResult && (testResult.ok ? (
              <div className="rounded-xl bg-[#48A157]/10 px-3 py-2 text-[12px] text-[#2F7A3D]">
                <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 size={13} /> Código generado ({testResult.result.valueLength} dígitos)</div>
                <div className="mt-2 flex items-center gap-3">
                  <span aria-label="Código generado" className="rounded-lg bg-white px-3 py-1.5 font-mono text-[22px] font-semibold tracking-[0.35em] text-[#1a1f2e]">
                    {testResult.result.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(testResult.result.value).then(() => setCopied(true)).catch(() => undefined); }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#104B99] hover:underline"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-[#58646D]">
                  {Object.entries(testResult.result.meta).map(([key, value]) => `${key}: ${value}`).join(' · ')} · {testResult.result.durationMs} ms
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-1.5 rounded-xl bg-[#E63946]/5 px-3 py-2 text-[12px] text-[#E63946]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {testResult.text}
              </div>
            ))}
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
