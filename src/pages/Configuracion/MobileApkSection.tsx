import { useRef, useState } from 'react';
import { AlertCircle, Boxes, ChevronDown, Loader2, Smartphone, Upload } from 'lucide-react';
import { cn } from '../../constants/theme';
import { apkDetails, apkDisplayName, type ApkInspection } from './mobile-apk';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const INPUT_CLS = 'w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]';
const LABEL_CLS = 'text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block';

export interface MobileApkValue {
  apkPath: string;
  packageName: string;
  mainActivity: string;
  framework: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {message}</div>;
}

async function inspect(body: FormData | string): Promise<ApkInspection> {
  const isFile = body instanceof FormData;
  // Con FormData el navegador pone el boundary: no fijar Content-Type.
  const res = await fetch(`${API_BASE}/api/projects/inspect-apk`, {
    method: 'POST',
    body,
    ...(isFile ? {} : { headers: { 'Content-Type': 'application/json' } }),
  });
  const data = (await res.json().catch(() => null)) as (ApkInspection & { message?: string; error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.message || data?.error || `Error ${res.status}`);
  return data;
}

/**
 * APK del proyecto móvil: se sube, el servidor lo inspecciona y rellena package y actividad.
 * El emulador o teléfono no se configura aquí; se elige al grabar o lanzar pruebas.
 */
export function MobileApkSection({ value, onChange, errors, isEdit }: {
  value: MobileApkValue;
  onChange: (patch: Partial<MobileApkValue>) => void;
  errors: Record<string, string>;
  isEdit: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<ApkInspection | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [serverPath, setServerPath] = useState('');

  const apply = (result: ApkInspection, name: string) => {
    onChange({
      apkPath: result.apkPath || value.apkPath,
      packageName: result.packageName || '',
      mainActivity: result.mainActivity || '',
    });
    setDetected(result);
    setUploadedName(name);
    if (!result.packageName) setError('El APK no declara un package; revisa que sea un APK de Android válido.');
    else if (!result.mainActivity) setAdvanced(true);
  };

  const run = async (body: FormData | string, name: string) => {
    setError(null);
    setInspecting(true);
    try {
      apply(await inspect(body), name);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo leer el APK');
    } finally {
      setInspecting(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) { setError('El archivo debe ser .apk'); return; }
    const fd = new FormData();
    fd.append('apk', file, file.name);
    await run(fd, file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleServerPath = async () => {
    const raw = serverPath.trim();
    if (raw) await run(JSON.stringify({ apkPath: raw }), apkDisplayName(raw));
  };

  const currentName = uploadedName ?? (value.apkPath ? apkDisplayName(value.apkPath) : null);
  const details = detected ? apkDetails(detected) : [];
  const missingActivity = !!value.apkPath && !!value.packageName && !value.mainActivity;
  const showAdvanced = advanced || !!errors.packageName || !!errors.mainActivity;

  return (
    <>
      <div>
        <label className={LABEL_CLS}>APK de la app</label>
        {currentName ? (
          <div className={cn('rounded-xl border px-3 py-2.5', errors.apkPath ? 'border-[#E63946]' : 'border-[#E8EBEC] bg-[#FAFAF7]')}>
            <div className="flex items-start gap-2.5">
              <Boxes size={16} className="mt-0.5 text-[#48A157] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[#1a1f2e] truncate" title={currentName}>{currentName}</div>
                {value.packageName && <div className="text-[11px] font-mono text-[#58646D] truncate">{value.packageName}</div>}
                {details.map((line) => <div key={line} className="text-[11px] text-[#8B999D]">{line}</div>)}
              </div>
              <label className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition flex-shrink-0', inspecting ? 'border-[#E8EBEC] text-[#BABEC3] cursor-not-allowed' : 'border-[#E8EBEC] bg-white text-[#58646D] hover:border-[#104B99]/40 cursor-pointer')}>
                {inspecting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {inspecting ? 'Leyendo…' : 'Reemplazar'}
                <input ref={fileRef} type="file" accept=".apk" className="hidden" disabled={inspecting} onChange={(e) => void handleFile(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        ) : (
          <label
            className={cn('flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition', inspecting ? 'cursor-not-allowed border-[#E8EBEC]' : 'cursor-pointer hover:border-[#104B99]/50 hover:bg-[#104B99]/[0.03]', errors.apkPath ? 'border-[#E63946]' : 'border-[#BABEC3]')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!inspecting) void handleFile(e.dataTransfer.files?.[0]); }}
          >
            {inspecting ? <Loader2 size={20} className="animate-spin text-[#104B99]" /> : <Upload size={20} className="text-[#58646D]" />}
            <span className="text-[13px] font-medium text-[#1a1f2e]">{inspecting ? 'Leyendo el APK…' : 'Selecciona o arrastra el APK'}</span>
            <span className="text-[11px] text-[#8B999D]">El package y la actividad principal se detectan solos.</span>
            <input ref={fileRef} type="file" accept=".apk" className="hidden" disabled={inspecting} onChange={(e) => void handleFile(e.target.files?.[0])} />
          </label>
        )}
        <FieldError message={error ?? errors.apkPath} />
        {isEdit && uploadedName && <div className="mt-1.5 text-[11px] text-[#58646D]">El APK nuevo se usará en las próximas grabaciones y ejecuciones al guardar.</div>}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-[#104B99]/[0.05] px-3 py-2.5 text-[11px] text-[#58646D]">
        <Smartphone size={14} className="mt-0.5 text-[#104B99] flex-shrink-0" />
        <span>No necesitas configurar emulador ni Appium aquí. Al grabar o lanzar pruebas eliges el emulador o teléfono de tu equipo (Android Studio) y la app se instala sola.</span>
      </div>

      <div>
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#58646D] hover:text-[#104B99] transition">
          <ChevronDown size={13} className={cn('transition-transform', showAdvanced && 'rotate-180')} /> Opciones avanzadas
          {missingActivity && !showAdvanced && <span className="ml-1 text-[#E63946]">· falta la actividad principal</span>}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-xl border border-[#E8EBEC] p-3">
            <div>
              <label className={LABEL_CLS}>Package name</label>
              <input value={value.packageName} onChange={(e) => onChange({ packageName: e.target.value })} placeholder="com.example.app" className={cn(INPUT_CLS, 'font-mono', errors.packageName && 'border-[#E63946]')} />
              <FieldError message={errors.packageName} />
            </div>
            <div>
              <label className={LABEL_CLS}>Actividad principal</label>
              <input value={value.mainActivity} onChange={(e) => onChange({ mainActivity: e.target.value })} placeholder="com.example.app.MainActivity" className={cn(INPUT_CLS, 'font-mono', errors.mainActivity && 'border-[#E63946]')} />
              <FieldError message={errors.mainActivity} />
            </div>
            <div>
              <label className={LABEL_CLS}>Framework <span className="normal-case text-[#BABEC3]">(opcional)</span></label>
              <input value={value.framework} onChange={(e) => onChange({ framework: e.target.value })} placeholder="react-native" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Ruta del APK en el servidor <span className="normal-case text-[#BABEC3]">(en lugar de subirlo)</span></label>
              <div className="flex gap-2">
                <input value={serverPath} onChange={(e) => setServerPath(e.target.value)} placeholder="D:\apks\app.apk" className={cn(INPUT_CLS, 'flex-1 font-mono')} />
                <button type="button" onClick={() => void handleServerPath()} disabled={inspecting || !serverPath.trim()} className={cn('px-3 py-2 rounded-xl text-[12px] font-medium transition', inspecting || !serverPath.trim() ? 'bg-[#E8EBEC] text-[#BABEC3] cursor-not-allowed' : 'bg-[#1a1f2e] text-white hover:bg-[#1a1f2e]/90')}>
                  Usar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
