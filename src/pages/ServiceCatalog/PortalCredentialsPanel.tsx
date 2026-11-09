import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const PROJECT = 'portal-comercial';
const endpointFor = (credentialKey: string) => `${API_BASE}/api/projects/${PROJECT}/service-credentials/${credentialKey}`;

type Status = { configured: false } | { configured: true; username: string; updatedAt: string | null; updatedBy: string | null };

async function request(endpoint: string, init?: RequestInit): Promise<Status> {
  const response = await fetch(endpoint, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'No se pudieron guardar las credenciales.');
  return body as Status;
}

/**
 * The Portal login the services below use (cédula generation, LexisNexis screening, request cancellation).
 * The password is write-only: it is encrypted on the server and never comes back to the browser. When the Portal
 * refuses it, a service sends the person here (`attention`) to type it again.
 */
export function PortalCredentialsPanel({ attention, credentialKey = 'portal-login', title = 'Credenciales del Portal', description = 'Las usan la generación de cédulas, la consulta a LexisNexis y la cancelación de solicitudes. Se guardan cifradas; la contraseña no se vuelve a mostrar.' }: { attention?: string; credentialKey?: string; title?: string; description?: string }) {
  const endpoint = endpointFor(credentialKey);
  const [status, setStatus] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => { void request(endpoint).then(setStatus).catch(() => setStatus(null)); }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  // A service that was refused by the Portal asks for the credentials again.
  useEffect(() => { if (attention) setEditing(true); }, [attention]);

  const configured = status?.configured === true;
  const showForm = editing || (status !== null && !configured);

  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const next = await request(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      setStatus(next); setPassword(''); setEditing(false); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las credenciales.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError(''); setSaved(false);
    try { setStatus(await request(endpoint, { method: 'DELETE' })); setUsername(''); setPassword(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron quitar las credenciales.'); }
    finally { setBusy(false); }
  };

  return <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5" aria-label={title}>
    <div className="mb-3 flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2F8] text-[#104B99]"><KeyRound size={16} /></div>
      <div>
        <h3 className="text-[13px] font-semibold text-[#1a1f2e]">{title}</h3>
        <p className="text-[11px] text-[#8B999D]">{description}</p>
      </div>
    </div>
    {attention && <p role="alert" className="mb-3 rounded-xl border border-[#F0C46A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#8A5A00]">{attention}</p>}
    {configured && !showForm && <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] text-[#1a1f2e]">Guardadas · usuario <strong>{(status as { username: string }).username}</strong>{(status as { updatedAt: string | null }).updatedAt ? <span className="text-[#8B999D]"> · actualizadas {new Date((status as { updatedAt: string }).updatedAt).toLocaleString('es-DO')}</span> : null}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setEditing(true); setSaved(false); }} className="rounded-full border border-[#E8EBEC] px-3 py-1.5 text-[11px] font-semibold text-[#1a1f2e]">Cambiar</button>
        <button type="button" onClick={() => void remove()} disabled={busy} className="rounded-full border border-[#E8EBEC] px-3 py-1.5 text-[11px] font-semibold text-[#B4463C] disabled:opacity-50">Quitar</button>
      </div>
    </div>}
    {showForm && <form className="grid max-w-2xl gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Usuario<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] font-normal normal-case text-[#1a1f2e]" /></label>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Contraseña<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] font-normal normal-case text-[#1a1f2e]" /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !username.trim() || !password} className="rounded-full bg-[#48A157] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
        {configured && <button type="button" onClick={() => { setEditing(false); setPassword(''); }} className="rounded-full border border-[#E8EBEC] px-3 py-2 text-[11px] font-semibold text-[#1a1f2e]">Cancelar</button>}
      </div>
    </form>}
    {saved && <p role="status" className="mt-3 text-[12px] text-[#34773D]">Credenciales guardadas.</p>}
    {error && <p role="alert" className="mt-3 text-[12px] text-[#E63946]">{error}</p>}
  </div>;
}
