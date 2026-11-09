import { useEffect, useMemo, useState } from 'react';
import { PortalCredentialsPanel } from './PortalCredentialsPanel';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const BASE = `${API_BASE}/api/projects/portal-comercial/requests/db-cancellation`;
const MAX_SELECTION = 1000;

type Config = { configured: boolean; source?: 'settings_file' | 'env_and_panel'; server?: string; database?: string; username?: string; problem?: string; settingsPathHint?: string; credentials?: { configured: boolean } };
type Item = { id: number; type: string; status: string; subStatus: string; stage: string; customIdentifier: string; identityHint: string; createdOnUtc: string | null };
type Listing = { createdBy: string; total: number; shown: number; requests: Item[] };
type ImportResult = { username: string; server: string; database: string; matchesConfiguredLocation: boolean };
type Outcome = { dryRun: boolean; requested: number; cancelled: number; backupFile: string };
class ApiError extends Error {
  readonly code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || 'No se pudo completar la operación.', String(data.error ?? ''));
  return data as T;
}
const post = <T,>(path: string, body: unknown) => call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const PATH_KEY = 'qalab.portalDbSettingsPath';
const savedPath = () => { try { return localStorage.getItem(PATH_KEY) ?? ''; } catch { return ''; } };
const when = (value: string | null) => (value ? new Date(value).toLocaleString('es-DO') : '');

/**
 * Cancels the Portal requests of one creator straight in the Portal database, for the ones the person selects.
 * Nothing changes until "Cancelar seleccionadas" is confirmed; "Simular" runs the same change and undoes it.
 */
export function CancellationRunPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [createdBy, setCreatedBy] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'' | 'search' | 'simulate' | 'cancel'>('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [attention, setAttention] = useState('');
  // Importing the sign-in from the API's appsettings.json: the file is read by the server, which keeps the password.
  const [importPath, setImportPath] = useState(savedPath);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [credentialsVersion, setCredentialsVersion] = useState(0);

  useEffect(() => { void call<Config>('config').then(setConfig).catch(() => setConfig(null)); }, []);

  const fail = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : 'No se pudo completar la operación.';
    if (reason instanceof ApiError && (reason.code === 'credentials_required' || reason.code === 'db_login_failed')) { setAttention(message); setError(''); }
    else { setError(message); setAttention(''); }
  };

  const importSettings = async () => {
    setImporting(true); setImportError(''); setImported(null); setAttention('');
    try {
      const result = await post<ImportResult>('import-settings', { path: importPath.trim() });
      setImported(result); setCredentialsVersion(version => version + 1);
      try { localStorage.setItem(PATH_KEY, importPath.trim()); } catch { /* optional */ }
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : 'No se pudo importar el archivo.'); }
    finally { setImporting(false); }
  };

  const search = async () => {
    setBusy('search'); setError(''); setAttention(''); setOutcome(null); setConfirmed(false);
    try {
      const result = await post<Listing>('preview', { createdBy: createdBy.trim() });
      setListing(result); setSelected(new Set()); setTypeFilter(''); setStageFilter(''); setText('');
    } catch (reason) { setListing(null); fail(reason); }
    finally { setBusy(''); }
  };

  const requests = listing?.requests ?? [];
  const types = useMemo(() => [...new Set(requests.map(item => item.type))].sort(), [requests]);
  const stages = useMemo(() => [...new Set(requests.map(item => item.stage || item.subStatus).filter(Boolean))].sort(), [requests]);
  const visible = useMemo(() => requests.filter(item =>
    (!typeFilter || item.type === typeFilter)
    && (!stageFilter || (item.stage || item.subStatus) === stageFilter)
    && (!text.trim() || String(item.id).includes(text.trim()))), [requests, typeFilter, stageFilter, text]);

  const toggle = (id: number) => { setConfirmed(false); setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const selectVisible = () => { setConfirmed(false); setSelected(previous => { const next = new Set(previous); visible.forEach(item => next.add(item.id)); return next; }); };
  const clearVisible = () => { setConfirmed(false); setSelected(previous => { const next = new Set(previous); visible.forEach(item => next.delete(item.id)); return next; }); };
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.has(item.id));
  const tooMany = selected.size > MAX_SELECTION;

  const run = async (dryRun: boolean) => {
    if (!listing || selected.size === 0 || tooMany) return;
    setBusy(dryRun ? 'simulate' : 'cancel'); setError(''); setAttention(''); setOutcome(null);
    try {
      const result = await post<Outcome>('cancel', { createdBy: listing.createdBy, ids: [...selected], confirmed: dryRun ? undefined : true, dryRun });
      setOutcome(result);
      if (!dryRun) { setConfirmed(false); setSelected(new Set()); setListing(null); }
    } catch (reason) { fail(reason); }
    finally { setBusy(''); }
  };

  const ready = config?.configured === true;
  // PORTAL_API_APPSETTINGS in the .env: the sign-in comes from that file, so there is nothing to type or import.
  const fromFile = config?.source === 'settings_file';
  return <div className="space-y-4">
    {fromFile
      ? <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5" role="status" aria-label="Acceso a la base de datos del Portal">
          <h3 className="text-[13px] font-semibold text-[#1a1f2e]">Acceso a la base de datos del Portal</h3>
          <p className="mt-1 text-[12px] text-[#1a1f2e]">Tomado del archivo indicado en <code>PORTAL_API_APPSETTINGS</code> (.env) · usuario <strong>{config?.username}</strong> · base <strong>{config?.database}</strong> en <strong>{config?.server}</strong>.</p>
          <p className="mt-1 text-[11px] text-[#8B999D]">No hay nada que escribir ni importar aquí. Para cambiarlo, edita ese archivo y reinicia el engine.</p>
        </div>
      : <>    <PortalCredentialsPanel key={credentialsVersion} attention={attention || undefined} credentialKey="portal-db" title="Acceso a la base de datos del Portal"
      description={ready ? `Base ${config?.database} en ${config?.server}. Usuario y contraseña se guardan cifrados; la contraseña no se vuelve a mostrar.` : 'Usuario y contraseña de la base de datos del Portal. Se guardan cifrados; la contraseña no se vuelve a mostrar.'} />
    <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5" aria-label="Importar acceso desde appsettings.json">
      <h3 className="text-[13px] font-semibold text-[#1a1f2e]">Importar el acceso desde el appsettings.json de la API</h3>
      <p className="text-[11px] text-[#8B999D]">En vez de escribir el usuario y la contraseña, indica la ruta del archivo <code>appsettings.json</code> de la API del Portal en el equipo donde corre QA Lab. Se lee solo la conexión a la base; la contraseña se guarda cifrada y no se muestra.</p>
      <form className="mt-3 grid max-w-3xl gap-3 md:grid-cols-[1fr_auto] md:items-end" onSubmit={event => { event.preventDefault(); void importSettings(); }}>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Ruta del archivo<input value={importPath || config?.settingsPathHint || ''} onChange={event => setImportPath(event.target.value)} autoComplete="off" placeholder="C:\ruta\Api_BPM\appsettings.json" className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 font-mono text-[11px] font-normal normal-case text-[#1a1f2e]" /></label>
        <button type="submit" disabled={importing || !(importPath || config?.settingsPathHint || '').trim()} className="rounded-full bg-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{importing ? 'Importando…' : 'Importar'}</button>
      </form>
      {imported && <div role="status" className="mt-3 rounded-xl border border-[#48A157] bg-[#EAF5ED] px-3 py-2 text-[12px] text-[#34773D]">
        Acceso importado y guardado cifrado · usuario <strong>{imported.username}</strong> · base <strong>{imported.database}</strong> en <strong>{imported.server}</strong>.
        {!imported.matchesConfiguredLocation && <span className="mt-1 block text-[#8A5A00]">Ojo: la base del archivo no coincide con PORTAL_DB_SERVER / PORTAL_DB_DATABASE del .env. Se usará la del .env.</span>}
      </div>}
      {importError && <p role="alert" className="mt-3 text-[12px] text-[#E63946]">{importError}</p>}
    </div>      </>}
    <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5" aria-label="Cancelar solicitudes por usuario">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-[#1a1f2e]">Cancelar solicitudes de un usuario</h3>
        <p className="text-[11px] text-[#8B999D]">Busca las solicitudes activas (borrador o en progreso) que creó un usuario, marca las que quieras y cancélalas. Se cancelan directo en la base del Portal, sin pasar por el proceso de negocio.</p>
      </div>
      {config && !config.configured && config.problem === 'settings_file_unusable' && <p role="alert" className="mb-3 rounded-xl border border-[#F0C46A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#8A5A00]">PORTAL_API_APPSETTINGS apunta a un archivo que no se puede usar (no existe, no es un appsettings.json o le falta la conexión). Revísalo y reinicia el engine.</p>}
      {config && !config.configured && config.problem !== 'settings_file_unusable' && <p role="alert" className="mb-3 rounded-xl border border-[#F0C46A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#8A5A00]">Falta indicar la base del Portal: define PORTAL_API_APPSETTINGS (ruta del appsettings.json) o bien PORTAL_DB_SERVER y PORTAL_DB_DATABASE en el .env y reinicia el engine.</p>}
      <form className="grid max-w-xl gap-3 md:grid-cols-[1fr_auto] md:items-end" onSubmit={event => { event.preventDefault(); void search(); }}>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Usuario creador<input value={createdBy} onChange={event => setCreatedBy(event.target.value)} autoComplete="off" placeholder="Ej. radames" className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] font-normal normal-case text-[#1a1f2e]" /></label>
        <button type="submit" disabled={busy !== '' || !ready || createdBy.trim().length < 3} className="rounded-full bg-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy === 'search' ? 'Buscando…' : 'Buscar'}</button>
      </form>

      {listing && <div className="mt-4" role="region" aria-label="Solicitudes encontradas">
        <p className="text-[12px] text-[#1a1f2e]">Solicitudes activas de <strong>{listing.createdBy}</strong>: <strong>{listing.shown}</strong>{listing.total > listing.shown ? '+' : ''} · <strong>{selected.size}</strong> seleccionadas</p>
        {listing.shown === 0 && <p className="mt-2 text-[11px] text-[#8B999D]">No hay solicitudes activas para ese usuario.</p>}
        {listing.shown > 0 && <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Tipo<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="mt-1 block rounded-lg border border-[#E8EBEC] bg-white px-2 py-1.5 text-[11px] font-normal normal-case text-[#1a1f2e]"><option value="">Todos</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Etapa<select value={stageFilter} onChange={event => setStageFilter(event.target.value)} className="mt-1 block rounded-lg border border-[#E8EBEC] bg-white px-2 py-1.5 text-[11px] font-normal normal-case text-[#1a1f2e]"><option value="">Todas</option>{stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Número<input value={text} onChange={event => setText(event.target.value)} placeholder="Buscar" className="mt-1 block w-28 rounded-lg border border-[#E8EBEC] bg-white px-2 py-1.5 text-[11px] font-normal normal-case text-[#1a1f2e]" /></label>
            <div className="flex gap-2">
              <button type="button" onClick={selectVisible} disabled={visible.length === 0 || allVisibleSelected} className="rounded-full border border-[#E8EBEC] px-3 py-1.5 text-[11px] font-semibold text-[#1a1f2e] disabled:opacity-50">Seleccionar visibles ({visible.length})</button>
              <button type="button" onClick={clearVisible} disabled={!visible.some(item => selected.has(item.id))} className="rounded-full border border-[#E8EBEC] px-3 py-1.5 text-[11px] font-semibold text-[#1a1f2e] disabled:opacity-50">Quitar visibles</button>
            </div>
          </div>
          <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-[#E8EBEC]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#F4F1EA] text-left text-[10px] uppercase tracking-wide text-[#58646D]"><tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Seleccionar todas las visibles" checked={allVisibleSelected} onChange={event => event.target.checked ? selectVisible() : clearVisible()} /></th>
                <th className="px-2 py-2">Número</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Etapa</th><th className="px-2 py-2">Identidad</th><th className="px-2 py-2">Creada</th></tr></thead>
              <tbody className="divide-y divide-[#E8EBEC]">
                {visible.map(item => <tr key={item.id} className={selected.has(item.id) ? 'bg-[#FDF3F1]' : ''}>
                  <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Seleccionar ${item.id}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></td>
                  <td className="px-2 py-1.5 font-mono text-[#1a1f2e]">{item.id}</td><td className="px-2 py-1.5">{item.type}</td><td className="px-2 py-1.5">{item.status}</td>
                  <td className="px-2 py-1.5">{item.stage || item.subStatus}</td><td className="px-2 py-1.5 text-[#58646D]">{item.identityHint}</td><td className="px-2 py-1.5 text-[#58646D]">{when(item.createdOnUtc)}</td></tr>)}
                {visible.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-center text-[#8B999D]">Ninguna coincide con los filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          {tooMany && <p role="alert" className="mt-2 text-[11px] text-[#B4463C]">Se pueden cancelar hasta {MAX_SELECTION} a la vez. Quita algunas de la selección.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void run(true)} disabled={busy !== '' || selected.size === 0 || tooMany} className="rounded-full border border-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-[#1a1f2e] disabled:opacity-50">{busy === 'simulate' ? 'Simulando…' : 'Simular (no cambia nada)'}</button>
            <label className="flex items-center gap-2 text-[11px] text-[#1a1f2e]"><input type="checkbox" checked={confirmed} disabled={selected.size === 0} onChange={event => setConfirmed(event.target.checked)} />Confirmo cancelar {selected.size} solicitudes (no se puede deshacer)</label>
            <button type="button" onClick={() => void run(false)} disabled={busy !== '' || !confirmed || selected.size === 0 || tooMany} className="rounded-full bg-[#B4463C] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy === 'cancel' ? 'Cancelando…' : `Cancelar seleccionadas (${selected.size})`}</button>
          </div>
        </>}
      </div>}

      {outcome && <div role="status" className={'mt-4 rounded-xl border px-4 py-3 text-[12px] ' + (outcome.dryRun ? 'border-[#9DB7DC] bg-[#EEF3FA] text-[#104B99]' : 'border-[#48A157] bg-[#EAF5ED] text-[#34773D]')}>
        {outcome.dryRun
          ? `Simulación correcta: se cancelarían las ${outcome.requested} solicitudes seleccionadas. No se cambió nada.`
          : `Listo: ${outcome.cancelled} solicitudes canceladas.`}
        <div className="mt-1 break-all text-[10px] opacity-80">Copia de las filas antes del cambio: {outcome.backupFile}</div>
      </div>}
      {error && <p role="alert" className="mt-3 text-[12px] text-[#E63946]">{error}</p>}
    </div>
  </div>;
}
