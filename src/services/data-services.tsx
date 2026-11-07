import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const IDENTIFICATION_LABEL = /(?:c[eé]dula|identificaci[oó]n|\b(?:id|dni|rnc)\b)/i;
type DataServiceSettings = { cedulasEnabled: boolean; recordingSpecGenerationEnabled: boolean };
const settingsCache = new Map<string, { settings: DataServiceSettings; expiresAt: number }>();
const settingsRequests = new Map<string, Promise<DataServiceSettings>>();

export function supportsDataCedulaGeneration(label: unknown, key?: unknown): boolean {
  const text = `${String(label ?? '')} ${String(key ?? '')}`.normalize('NFKC');
  return IDENTIFICATION_LABEL.test(text);
}

export async function generateCedulas(projectSlug: string, count = 1, excludeCedulas: string[] = []): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectSlug)}/data-services/data-cedulas/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, excludeCedulas }),
  });
  const body = await response.json().catch(() => ({}));
  const values = Array.isArray(body.cedulas)
    ? body.cedulas.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    : typeof body.cedula === 'string' && body.cedula.trim().length > 0 ? [body.cedula] : [];
  if (!response.ok || values.length < count) throw new Error(body.message || body.detail || body.error || 'No se pudo generar una cédula.');
  return values;
}

export async function getDataServiceSettings(projectSlug: string): Promise<DataServiceSettings> {
  const slug=projectSlug.trim();
  if(!slug) return { cedulasEnabled: false, recordingSpecGenerationEnabled: false };
  const cached=settingsCache.get(slug);
  if(cached && cached.expiresAt>Date.now()) return cached.settings;
  const pending=settingsRequests.get(slug);
  if(pending) return pending;
  const request=(async()=>{
    const response=await fetch(`${API_BASE}/api/projects/${encodeURIComponent(slug)}/data-services`);
    const body=await response.json();
    if(!response.ok) throw new Error(body.message || 'No se pudo consultar el servicio de cédulas');
    const settings={
      cedulasEnabled: body.services?.dataCedulas?.enabled === true,
      recordingSpecGenerationEnabled: body.services?.recordingSpecGenerationEnabled !== false,
    };
    settingsCache.set(slug,{settings,expiresAt:Date.now()+5000});
    return settings;
  })();
  settingsRequests.set(slug,request);
  try{return await request;}finally{if(settingsRequests.get(slug)===request) settingsRequests.delete(slug);}
}

export async function isCedulaServiceEnabled(projectSlug:string):Promise<boolean> {
  return (await getDataServiceSettings(projectSlug)).cedulasEnabled;
}

export async function isRecordingSpecGenerationEnabled(projectSlug:string):Promise<boolean> {
  return (await getDataServiceSettings(projectSlug)).recordingSpecGenerationEnabled;
}

export async function generateCedula(projectSlug: string): Promise<string> {
  return (await generateCedulas(projectSlug, 1))[0];
}

export function DataGeneratorButton({ projectSlug, label, fieldKey, onGenerated, onGeneratedSpec, generateSpecValue = false, className = '' }: { projectSlug?: string; label: string; fieldKey?: string; onGenerated: (value: string) => void; onGeneratedSpec?: (value: string) => void; generateSpecValue?: boolean; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceEnabled,setServiceEnabled]=useState(false);
  const [specGenerationEnabled,setSpecGenerationEnabled]=useState(false);
  useEffect(()=>{
    let current=true;
    setServiceEnabled(false);
    setSpecGenerationEnabled(false);
    if(!projectSlug) return ()=>{current=false;};
    void getDataServiceSettings(projectSlug).then(settings=>{if(current){setServiceEnabled(settings.cedulasEnabled);setSpecGenerationEnabled(settings.recordingSpecGenerationEnabled);}}).catch(()=>{if(current){setServiceEnabled(false);setSpecGenerationEnabled(false);}});
    return ()=>{current=false;};
  },[projectSlug]);
  if (!projectSlug || !serviceEnabled || !supportsDataCedulaGeneration(label, fieldKey)) return null;
  const generateSpec = generateSpecValue && specGenerationEnabled;
  const handleGenerate = async () => {
    setLoading(true); setError('');
    try {
      const values = await generateCedulas(projectSlug, generateSpec ? 2 : 1);
      onGenerated(values[0]);
      if (generateSpec && values[1]) onGeneratedSpec?.(values[1]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo generar el dato.'); } finally { setLoading(false); }
  };
  return <span className={`inline-flex items-center gap-1 ${className}`}><button type="button" onClick={() => void handleGenerate()} disabled={loading} className="rounded-md border border-[#48A157]/50 px-1.5 py-0.5 text-[10px] font-semibold text-[#48A157] hover:bg-[#48A157]/10 disabled:opacity-50" aria-label={`Generar data para ${label}`}>{loading ? 'Generando…' : 'Generar data'}</button>{error && <span role="alert" className="max-w-48 text-[10px] font-normal text-[#E63946]">{error}</span>}</span>;
}
