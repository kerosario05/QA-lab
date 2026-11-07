import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function ProjectServiceCatalog({ slug }: { slug: string }) {
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `/api/projects/${encodeURIComponent(slug)}/request-cancellation-config`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}${endpoint}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('No se pudieron cargar los servicios del proyecto.');
        return response.json() as Promise<{ enabled: boolean }>;
      })
      .then(config => {
        if (controller.signal.aborted) return;
        setAvailable(Boolean(config));
        setEnabled(config?.enabled === true);
        setSaved(config?.enabled === true);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'No se pudo guardar el servicio.');
      setEnabled(body.enabled === true); setSaved(body.enabled === true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el servicio.'); }
    finally { setSaving(false); }
  };

  return <section className="rounded-2xl border border-[#E8EBEC] bg-white p-5" aria-label="Catálogo de servicios">
    <h2 className="text-[13px] font-semibold text-[#1a1f2e]">Servicios del proyecto</h2>
    {loading ? <p className="mt-2 text-[12px] text-[#58646D]">Cargando servicios…</p> : available ? <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h3 className="text-[13px] font-medium">Cancelación de solicitudes de prueba</h3><p className="mt-1 text-[12px] text-[#58646D]">Al aprobar Discovery, cancela y verifica la solicitud creada con los datos de la prueba antes de iniciar la promoción. Si falla, la promoción se detiene.</p><label className="mt-3 flex items-center gap-2 text-[12px] font-medium"><input type="checkbox" checked={enabled} disabled={saving} onChange={event => setEnabled(event.target.checked)} />Activar para este proyecto</label><details className="mt-3 text-[11px] text-[#58646D]"><summary className="cursor-pointer">Ver endpoint</summary><code className="mt-2 block break-all">POST /api/projects/{slug}/requests/cancel</code><p className="mt-1">La ejecución automática reutiliza la sesión autenticada y cancela solo la solicitud creada por esa corrida.</p></details></div><button type="button" onClick={() => void save()} disabled={saving || enabled === saved} className="rounded-full bg-[#48A157] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : enabled === saved ? 'Guardado' : 'Guardar servicio'}</button></div> : <p className="mt-2 text-[12px] text-[#58646D]">No hay servicios compatibles disponibles para este proyecto.</p>}
    {error && <p role="alert" className="mt-2 text-[12px] text-[#E63946]">{error}</p>}
  </section>;
}
