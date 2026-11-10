import { useEffect, useRef, useState } from 'react';
import { PortalCredentialsPanel } from './PortalCredentialsPanel';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
type Status = { running: boolean; target: number | null; startedAt: string | null; finishedAt: string | null; approved: number; added?: number; rejected: number; lastLog: string };

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}/api/data-cedulas${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'No se pudo completar la solicitud.');
  return body;
}

export function ReadyCedulasPanel() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [database, setDatabase] = useState('');
  const [target, setTarget] = useState(500);
  const [renew, setRenew] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const wasRunning = useRef(false);

  // Tell the person when a run that was in progress ends: in the page and, when allowed, as a system notification.
  useEffect(() => {
    if (!status) return;
    if (wasRunning.current && !status.running) {
      const done = status.target ? status.approved >= status.target : Boolean(status.finishedAt);
      const message = done ? `Listo: ${status.approved} cédulas aprobadas y preparadas.` : `Proceso detenido con ${status.approved} cédulas aprobadas.`;
      setNotice(message);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Generación de cédulas', { body: message }); } catch { /* notifications are optional */ }
    }
    if (status.running) setNotice(''); // a run in progress makes the previous run's message stale
    wasRunning.current = status.running;
  }, [status]);

  useEffect(() => {
    void call('/databases').then(body => { const list = Array.isArray(body.databases) ? body.databases : []; setDatabases(list); setDatabase(current => current || list.find((alias: string) => alias === 'QA1') || list[0] || ''); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = () => call('/ready/status').then(body => { if (alive) setStatus(body); }).catch(() => undefined);
    void poll();
    const timer = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const start = async () => {
    setBusy(true); setError(''); setNotice('');
    try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* optional */ }
    try {
      await call('/ready/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, database, renew }) });
      setStatus(await call('/ready/status'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar.'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true); setError('');
    try { await call('/ready/stop', { method: 'POST' }); setStatus(await call('/ready/status')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo detener.'); }
    finally { setBusy(false); }
  };

  const credentialsAttention = /credentials_rejected/.test(status?.lastLog ?? '') ? 'El Portal rechazó las credenciales guardadas. Vuelve a escribirlas y genera de nuevo.'
    : /credenciales del Portal/i.test(error) ? 'Faltan las credenciales del Portal: guárdalas aquí para generar cédulas.' : undefined;
  const percent = status && status.target ? Math.min(100, Math.round(((status.added ?? status.approved) / status.target) * 100)) : 0;
  return <div className="space-y-4">
  <PortalCredentialsPanel attention={credentialsAttention} />
  <div className="rounded-2xl border border-[#E8EBEC] bg-white p-5">
    <div className="mb-4"><h3 className="text-[13px] font-semibold text-[#1a1f2e]">Generar cédulas listas</h3><p className="text-[11px] text-[#8B999D]">Renueva la fecha de consulta de cada cédula en la base de buró (con respaldo) y deja solo las que el motor de decisión aprueba.</p></div>
    <div className="grid max-w-3xl gap-3 md:grid-cols-2">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Cantidad a agregar al stock<input type="number" min={1} max={5000} value={target} onChange={event => setTarget(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] font-normal normal-case text-[#1a1f2e]" /></label>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8B999D]">Base TNS<select value={database} onChange={event => setDatabase(event.target.value)} className="mt-1 w-full rounded-lg border border-[#E8EBEC] bg-white px-3 py-2 text-[12px] font-normal normal-case text-[#1a1f2e]"><option value="">Selecciona una base</option>{databases.map(alias => <option key={alias} value={alias}>{alias}</option>)}</select></label>
    </div>
    <label className="mt-3 flex items-center gap-2 text-[11px] text-[#1a1f2e]"><input type="checkbox" checked={renew} onChange={event => setRenew(event.target.checked)} />Renovar desde cero (aparta el stock actual y vuelve a preparar y validar todas; lo normal es NO marcarlo)</label>
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={() => void start()} disabled={busy || status?.running === true || !database || target < 1} className="rounded-full bg-[#48A157] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">Generar cédulas</button>
      <button type="button" onClick={() => void stop()} disabled={busy || status?.running !== true} className="rounded-full bg-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">Detener</button>
    </div>
    {status && <div className="mt-4 max-w-3xl">
      <div className="mb-1 flex justify-between text-[11px] text-[#1a1f2e]"><span>{status.running ? 'En curso' : 'Detenido'} · aprobadas {status.approved}{status.target ? ` de ${status.target}` : ''} · rechazadas {status.rejected}</span><span>{percent}%</span></div>
      <div className="h-2 rounded-full bg-[#E8EBEC]"><div className="h-2 rounded-full bg-[#48A157]" style={{ width: `${percent}%` }} /></div>
      {status.lastLog && <p className="mt-2 truncate text-[10px] text-[#8B999D]">{status.lastLog}</p>}
    </div>}
    {notice && <div role="status" className="mt-4 flex max-w-3xl items-center justify-between rounded-xl border border-[#48A157] bg-[#EAF5ED] px-4 py-3 text-[12px] font-medium text-[#34773D]"><span>{notice}</span><button type="button" onClick={() => setNotice('')} className="text-[11px] underline">Cerrar</button></div>}
    {error && <p role="alert" className="mt-3 text-[12px] text-[#E63946]">{error}</p>}
  </div>
  </div>;
}
