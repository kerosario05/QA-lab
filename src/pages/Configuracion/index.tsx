import { useState, useEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Boxes, Plus, FolderCog, Loader2, X, ChevronDown, Upload } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ProjectListItem {
  id: string;
  slug: string;
  name: string;
  projectType: number;
  status: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const TYPE_LABEL: Record<number, string> = { 1: 'Web', 2: 'Mobile' };
const STATUS_LABEL: Record<number, string> = { 0: 'Draft', 1: 'Ready', 2: 'Invalid' };

const TYPE_STYLE: Record<number, string> = {
  1: 'bg-[#104B99]/8 text-[#104B99]',
  2: 'bg-[#48A157]/8 text-[#48A157]',
};

const STATUS_STYLE: Record<number, string> = {
  0: 'bg-[#F4F1EA] text-[#58646D]',
  1: 'bg-[#48A157]/8 text-[#48A157]',
  2: 'bg-[#E63946]/8 text-[#E63946]',
};

const AUTH_TO_LOGIN_MODE: Record<string, number> = {
  no_login: 2,
  password: 1,
  manual: 3,
};

const INPUT_CLS = 'w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]';
const LABEL_CLS = 'text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block';
const SELECT_CLS = 'w-full bg-white border border-[#E8EBEC] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#104B99] focus:ring-4 focus:ring-[#104B99]/10';

export async function listProjects(): Promise<ProjectListItem[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.statusText}`);
  const body = await res.json();
  return Array.isArray(body?.projects) ? body.projects : [];
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

type ApiError = Error & { status?: number };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

type FormType = 'web' | 'mobile';

function NewProjectModal({ onClose, onCreated, editSlug }: { onClose: () => void; onCreated: (slug: string, status: number, reasons: string[]) => void; editSlug?: string }) {
  const [type, setType] = useState<FormType>('web');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [auth, setAuth] = useState('no_login');
  const [username, setUsername] = useState('');
  const [passwordSecretRef, setPasswordSecretRef] = useState('');
  const [apkPath, setApkPath] = useState('');
  const [packageName, setPackageName] = useState('');
  const [mainActivity, setMainActivity] = useState('');
  const [framework, setFramework] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectInfo, setInspectInfo] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const apkFileRef = useRef<HTMLInputElement>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editSlug);
  const isEdit = !!editSlug;
  const [jiraKey, setJiraKey] = useState('');
  const [jiraAcField, setJiraAcField] = useState(''); const [jiraJql, setJiraJql] = useState('');
  const [jiraDryRun, setJiraDryRun] = useState(false);
  const [jiraOrig, setJiraOrig] = useState<Record<string, any> | null>(null);
  const [trProjId, setTrProjId] = useState('');
  const [trSuiteId, setTrSuiteId] = useState(''); const [trSectionId, setTrSectionId] = useState('');
  const [trSessionId, setTrSessionId] = useState('');
  const [trOrig, setTrOrig] = useState<Record<string, any> | null>(null);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [trError, setTrError] = useState<string | null>(null);

  useEffect(() => {
    if (!editSlug) return;
    setLoadingEdit(true);
    Promise.all([
      apiRequest<any>(`/api/projects/${encodeURIComponent(editSlug)}`),
    ])
      .then(([data]) => {
        const p = data.project;
        const cfg = data.mobileConfig || data.webConfig;
        setName(p.name || '');
        setSlug(p.slug || '');
        setType(p.projectType === 2 ? 'mobile' : 'web');
        if (p.projectType === 1 && data.webConfig) {
          setBaseUrl(data.webConfig.baseUrl || '');
          const mode = data.webConfig.loginMode;
          setAuth(mode === 1 ? 'password' : mode === 3 ? 'manual' : 'no_login');
          setUsername(data.webConfig.username || '');
          setPasswordSecretRef(data.webConfig.passwordSecretRef || '');
        }
        if (p.projectType === 2 && data.mobileConfig) {
          setApkPath(data.mobileConfig.apkPath || '');
          setPackageName(data.mobileConfig.packageName || '');
          setMainActivity(data.mobileConfig.mainActivity || '');
          setFramework(data.mobileConfig.framework || '');
        }
        if (data.jiraConfig) {
          const j = data.jiraConfig;
          setJiraKey(j.projectKey || '');
          setJiraAcField(j.acceptanceCriteriaField || ''); setJiraJql(j.defaultJql || '');
          setJiraDryRun(!!j.dryRun);
          setJiraOrig({ projectKey: j.projectKey || '', acceptanceCriteriaField: j.acceptanceCriteriaField || '', defaultJql: j.defaultJql || '', dryRun: !!j.dryRun });
        }
        if (data.testRailConfig) {
          const t = data.testRailConfig;
          setTrProjId(t.projectIdTr || '');
          setTrSuiteId(t.suiteId || ''); setTrSectionId(t.sectionId || ''); setTrSessionId(t.sessionId || '');
          setTrOrig({ projectIdTr: t.projectIdTr || '', suiteId: t.suiteId || '', sectionId: t.sectionId || '', sessionId: t.sessionId || '' });
        }
      })
      .catch((e: any) => setSubmitError(e.message))
      .finally(() => setLoadingEdit(false));
  }, [editSlug]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'El nombre es requerido';
    if (!isEdit && !slug.trim()) errs.slug = 'El slug es requerido';
    if (type === 'web') {
      if (!baseUrl.trim()) errs.baseUrl = 'La URL es requerida';
      else {
        try {
          const u = new URL(baseUrl);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
        } catch {
          errs.baseUrl = 'URL inválida';
        }
      }
      if (!auth) errs.auth = 'El tipo de autenticación es requerido';
      if (auth === 'password') {
        if (!username.trim()) errs.username = 'El usuario es requerido';
        if (!passwordSecretRef.trim()) errs.passwordSecretRef = 'La referencia del secreto es requerida';
      }
    } else {
      if (!apkPath.trim()) errs.apkPath = 'La ruta del APK es requerida';
      if (!packageName.trim()) errs.packageName = 'El package name es requerido';
      if (!mainActivity.trim()) errs.mainActivity = 'La main activity es requerida';
    }
    return errs;
  };

  const handleInspectWithPath = async (targetPath: string) => {
    setInspectError(null); setInspectInfo(null); setInspecting(true);
    try {
      const result = await apiRequest<{ apkPath: string; packageName: string; mainActivity: string; versionName?: string; versionCode?: string; minSdk?: string; targetSdk?: string; inspectionSource?: string }>(
        '/api/projects/inspect-apk',
        { method: 'POST', body: JSON.stringify({ apkPath: targetPath }) },
      );
      if (result.apkPath) setApkPath(result.apkPath);
      if (result.packageName) setPackageName(result.packageName);
      if (typeof result.mainActivity === 'string') setMainActivity(result.mainActivity);
      if (!result.mainActivity) setInspectInfo('Package detectado. MainActivity no detectada — completa manualmente.');
      else setInspectInfo(`Inspeccionado via ${result.inspectionSource ?? 'aapt'}`);
    } catch (err: any) {
      setInspectError(err.message || 'Error al inspeccionar el APK');
    } finally { setInspecting(false); }
  };

  const handleInspectApk = async () => {
    if (selectedFile) { await handleApkFile(selectedFile); return; }
    const file = apkFileRef.current?.files?.[0];
    if (file) { await handleApkFile(file); return; }
    if (!apkPath.trim()) return;
    await handleInspectWithPath(apkPath.trim());
  };

  const handleApkFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.apk')) { setInspectError('El archivo debe ser .apk'); return; }
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setInspectError(null); setInspectInfo(null); setInspecting(true);
    try {
      const fd = new FormData();
      fd.append('apk', file, file.name);
      console.log(`[apk-upload-front] hasFile=${String(file instanceof File)} fileName=${file.name} fileSize=${file.size} formDataHasApk=${String(fd.has("apk"))} requestUrl=${API_BASE}/api/projects/inspect-apk`);
      // NO establecer Content-Type manualmente — el browser genera boundary
      const res = await fetch(`${API_BASE}/api/projects/inspect-apk`, { method: 'POST', body: fd });
      const body: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || `Error ${res.status}`);
      if (body?.apkPath) setApkPath(body.apkPath);
      // preservar File hasta terminar inspección — no limpiar selectedFile aquí
      if (body?.packageName) setPackageName(body.packageName);
      if (typeof body?.mainActivity === 'string') setMainActivity(body.mainActivity);
      if (!body?.packageName) throw new Error('packageName no detectado');
      if (!body?.mainActivity) setInspectInfo('Package detectado. MainActivity no detectada — completa manualmente.');
      else setInspectInfo(`Inspeccionado via ${body.inspectionSource ?? 'apk'} — ${file.name}`);
    } catch (err: any) {
      setInspectError(err.message || 'Error al inspeccionar el APK');
    } finally { setInspecting(false); }
  };

  const handleApkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    await handleApkFile(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      let resultSlug = slug;
      if (isEdit) {
        // Edit mode: PUT
        const payload: any = { name, enabled: true };
        if (type === 'web') {
          payload.baseUrl = baseUrl;
          payload.loginMode = AUTH_TO_LOGIN_MODE[auth] ?? 2;
          if (auth === 'password') { payload.username = username; payload.passwordSecretRef = passwordSecretRef; }
        } else {
          payload.apkPath = apkPath;
          payload.packageName = packageName;
          payload.mainActivity = mainActivity;
          payload.framework = framework || null;
        }
        const res = await apiRequest<{ slug: string; status: number; reasons: string[] }>(
          `/api/projects/${encodeURIComponent(slug)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        // Save integrations if modified
        setJiraError(null); setTrError(null);
        const jMod = jiraKey !== (jiraOrig?.projectKey ?? '') || jiraAcField !== (jiraOrig?.acceptanceCriteriaField ?? '') || jiraJql !== (jiraOrig?.defaultJql ?? '') || jiraDryRun !== (jiraOrig?.dryRun ?? false);
        const tMod = trProjId !== (trOrig?.projectIdTr ?? '') || trSuiteId !== (trOrig?.suiteId ?? '') || trSectionId !== (trOrig?.sectionId ?? '') || trSessionId !== (trOrig?.sessionId ?? '');
        if (jMod && jiraKey.trim()) {
          try { await apiRequest(`/api/projects/${encodeURIComponent(slug)}/jira`, { method: 'PUT', body: JSON.stringify({ projectKey: jiraKey, acceptanceCriteriaField: jiraAcField || null, defaultJql: jiraJql || null, dryRun: jiraDryRun }) }); } catch (e: any) { setJiraError(e.message); setSaving(false); return; }
        }
        if (tMod && trProjId.trim()) {
          try { await apiRequest(`/api/projects/${encodeURIComponent(slug)}/testrail`, { method: 'PUT', body: JSON.stringify({ projectIdTr: trProjId, suiteId: trSuiteId || null, sectionId: trSectionId || null, sessionId: trSessionId || null }) }); } catch (e: any) { setTrError(e.message); setSaving(false); return; }
        }
        onCreated(res.slug, res.status, res.reasons ?? []);
        return;
      } else {
        // Create mode: POST
        if (type === 'web') {
          const payload: any = { name, slug, baseUrl, loginMode: AUTH_TO_LOGIN_MODE[auth] ?? 2 };
          if (auth === 'password') { payload.username = username; payload.passwordSecretRef = passwordSecretRef; }
          const res = await apiRequest<{ project: ProjectListItem }>('/api/projects/web', { method: 'POST', body: JSON.stringify(payload) });
          resultSlug = res.project.slug;
        } else {
          const payload: any = { name, slug, apkPath, packageName, mainActivity, appName: name };
          if (framework.trim()) payload.framework = framework;
          console.log(`[mobile-project-create-front] name=${name} slug=${slug} hasName=${String(!!name.trim())} payloadKeys=${Object.keys(payload).join(',')}`);
          const res = await apiRequest<{ project: ProjectListItem }>('/api/projects/mobile', { method: 'POST', body: JSON.stringify(payload) });
          resultSlug = res.project.slug;
        }
        const refresh = await apiRequest<{ status: number; reasons: string[] }>(`/api/projects/${encodeURIComponent(resultSlug)}/refresh-status`, { method: 'POST', body: '{}' });
        if (refresh.status === 1) {
          await apiRequest(`/api/projects/${encodeURIComponent(resultSlug)}/materialize`, { method: 'POST', body: '{}' });
        }
        onCreated(resultSlug, refresh.status, refresh.reasons ?? []);
      }
    } catch (err: any) {
      const e = err as ApiError;
      if (e.status === 409) setSubmitError('El slug ya existe. Usa otro nombre o slug.');
      else if (e.status === 400) setSubmitError(e.message);
      else if (e.status === 500) setSubmitError('Error interno del servidor. Intenta nuevamente.');
      else setSubmitError(e.message || 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (k: string) => cn(INPUT_CLS, fieldErrors[k] && 'border-[#E63946]');

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" style={{ background: 'rgba(26,31,46,0.45)' }} onClick={saving ? undefined : onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-[0_12px_40px_-8px_rgba(16,75,153,0.22)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBEC]">
          <div>
            <div className="text-[14px] font-semibold text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}</div>
            <div className="text-[11px] text-[#8B999D] mt-0.5">{isEdit ? 'Modifica la configuración del proyecto.' : 'Crea un proyecto de automatización Web o Mobile.'}</div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-[#8B999D] hover:text-[#1a1f2e] transition disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={LABEL_CLS}>Tipo de proyecto</label>
            <div className="grid grid-cols-2 gap-2">
              {(['web', 'mobile'] as FormType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => !isEdit && setType(t)}
                  disabled={isEdit}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-[13px] font-medium transition flex items-center justify-center gap-2',
                    type === t ? 'border-[#104B99] bg-[#104B99]/8 text-[#104B99]' : 'border-[#E8EBEC] bg-white text-[#58646D] hover:border-[#104B99]/40',
                    isEdit && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {t === 'web' ? 'Web' : 'Mobile'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Nombre del proyecto</label>
            <input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Mi proyecto" className={inputCls('name')} />
            {fieldErrors.name && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.name}</div>}
          </div>

          <div>
            <label className={LABEL_CLS}>Slug</label>
            <div className="relative">
              <input
                value={slug}
                onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                placeholder="mi-proyecto"
                disabled={isEdit}
                className={cn(INPUT_CLS, 'font-mono pr-8', isEdit && 'opacity-60 cursor-not-allowed bg-[#F4F1EA]')}
              />
              <button
                type="button"
                title="Re-derivar del nombre"
                onClick={() => { setSlugEdited(false); setSlug(slugify(name)); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#104B99] transition"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {fieldErrors.slug && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.slug}</div>}
          </div>

          {type === 'web' ? (
            <>
              <div>
                <label className={LABEL_CLS}>URL</label>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://app.example.com" className={inputCls('baseUrl')} />
                {fieldErrors.baseUrl && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.baseUrl}</div>}
              </div>
              <div>
                <label className={LABEL_CLS}>Tipo de autenticación</label>
                <select value={auth} onChange={(e) => setAuth(e.target.value)} className={SELECT_CLS}>
                  <option value="no_login">Sin autenticación</option>
                  <option value="password">Usuario y contraseña</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              {auth === 'password' && (
                <>
                  <div>
                    <label className={LABEL_CLS}>Usuario</label>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="usuario" className={inputCls('username')} />
                    {fieldErrors.username && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.username}</div>}
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Referencia del secreto de contraseña</label>
                    <input value={passwordSecretRef} onChange={(e) => setPasswordSecretRef(e.target.value)} placeholder="vault:projects/.../password" className={inputCls('passwordSecretRef')} />
                    {fieldErrors.passwordSecretRef && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.passwordSecretRef}</div>}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <label className={LABEL_CLS}>APK — seleccionar archivo o ruta local</label>
                <div className="flex gap-2">
                  <input value={apkPath} onChange={(e) => { setApkPath(e.target.value); setSelectedFileName(null); setSelectedFile(null); if (apkFileRef.current) apkFileRef.current.value = ''; }} placeholder="C:\qa\app.apk  o  /data/app.apk" className={cn(inputCls('apkPath'), 'flex-1 font-mono')} />
                  <label className={cn('inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium border cursor-pointer transition', inspecting ? 'bg-[#E8EBEC] text-[#BABEC3] border-[#E8EBEC] cursor-not-allowed' : 'bg-white border-[#E8EBEC] text-[#58646D] hover:border-[#104B99]/40')}>
                    <Upload size={13} /> Seleccionar APK
                    <input ref={apkFileRef} type="file" accept=".apk" className="hidden" onChange={handleApkFileChange} disabled={inspecting} />
                  </label>
                </div>
                {selectedFileName && <div className="mt-1.5 text-[11px] text-[#58646D] font-mono flex items-center gap-1"><Boxes size={11} /> {selectedFileName} → se inspeccionará automáticamente</div>}
                <div className="mt-1 text-[10px] text-[#8B999D]">El archivo .apk seleccionado se sube al backend y se inspecciona automáticamente. También puedes escribir una ruta local y usar &ldquo;Inspeccionar APK&rdquo;.</div>
                {fieldErrors.apkPath && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.apkPath}</div>}
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleInspectApk}
                  disabled={inspecting || (!apkPath.trim() && !selectedFile)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-all',
                    inspecting || (!apkPath.trim() && !selectedFile)
                      ? 'bg-[#E8EBEC] text-[#BABEC3] cursor-not-allowed'
                      : 'bg-[#1a1f2e] text-white hover:bg-[#1a1f2e]/90'
                  )}
                >
                  {inspecting ? <Loader2 size={13} className="animate-spin" /> : <Boxes size={13} />}
                  {inspecting ? 'Inspeccionando...' : 'Inspeccionar APK'}
                </button>
                {inspectError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {inspectError}</div>}
                {inspectInfo && !inspectError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#48A157]"><AlertCircle size={12} /> {inspectInfo}</div>}
              </div>
              <div>
                <label className={LABEL_CLS}>Package Name <span className="normal-case text-[#BABEC3]">(autodetectado)</span></label>
                <input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="com.example.app" className={cn(inputCls('packageName'), 'font-mono bg-[#F4F1EA]/40')} readOnly={false} title="Autocompletado desde APK — editable si es necesario" />
                {fieldErrors.packageName && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.packageName}</div>}
              </div>
              <div>
                <label className={LABEL_CLS}>Main Activity <span className="normal-case text-[#BABEC3]">(editable — override manual)</span></label>
                <input value={mainActivity} onChange={(e) => setMainActivity(e.target.value)} placeholder="com.example.app.MainActivity" className={cn(inputCls('mainActivity'), 'font-mono')} />
                {fieldErrors.mainActivity && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {fieldErrors.mainActivity}</div>}
              </div>
              <div>
                <label className={LABEL_CLS}>Framework <span className="normal-case text-[#BABEC3]">(opcional)</span></label>
                <input value={framework} onChange={(e) => setFramework(e.target.value)} placeholder="react-native" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Platform</label>
                <div className="text-[13px] font-medium text-[#58646D] bg-[#F4F1EA] rounded-xl px-3 py-2.5">Android</div>
              </div>
            </>
          )}

          {isEdit && (
            <div className="border-t border-[#E8EBEC] pt-4 mt-2">
              <div className="text-[12px] font-semibold text-[#1a1f2e] mb-3">Integraciones</div>
              <div className="rounded-xl border border-[#E8EBEC] p-3 mb-3">
                <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-semibold text-[#58646D]">Jira</span>{jiraOrig && <span className="text-[10px] text-[#48A157]">Configurado</span>}</div>
                <div className="text-[10px] text-[#8B999D] mb-2 italic">Jira utiliza la conexion global de la arquitectura.</div>
                <div className="space-y-2">
                  <div><label className={LABEL_CLS}>Project Key</label><input value={jiraKey} onChange={(e) => setJiraKey(e.target.value)} placeholder="PROJ" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>Acceptance Criteria Field <span className="normal-case text-[#BABEC3]">(opc)</span></label><input value={jiraAcField} onChange={(e) => setJiraAcField(e.target.value)} placeholder="customfield_100" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>Default JQL <span className="normal-case text-[#BABEC3]">(opc)</span></label><input value={jiraJql} onChange={(e) => setJiraJql(e.target.value)} placeholder="project = PROJ" className={INPUT_CLS} /></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={jiraDryRun} onChange={(e) => setJiraDryRun(e.target.checked)} className="rounded" /><label className="text-[12px] text-[#58646D]">Dry run</label></div>
                </div>
                {jiraError && <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {jiraError}</div>}
              </div>
              <div className="rounded-xl border border-[#E8EBEC] p-3">
                <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-semibold text-[#58646D]">TestRail</span>{trOrig && <span className="text-[10px] text-[#48A157]">Configurado</span>}</div>
                <div className="text-[10px] text-[#8B999D] mb-2 italic">TestRail utiliza la conexion global de la arquitectura.</div>
                <div className="space-y-2">
                  <div><label className={LABEL_CLS}>Project ID (TestRail)</label><input value={trProjId} onChange={(e) => setTrProjId(e.target.value)} placeholder="1" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>Suite ID <span className="normal-case text-[#BABEC3]">(opc)</span></label><input value={trSuiteId} onChange={(e) => setTrSuiteId(e.target.value)} placeholder="1" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>Section ID <span className="normal-case text-[#BABEC3]">(opc)</span></label><input value={trSectionId} onChange={(e) => setTrSectionId(e.target.value)} placeholder="1" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>Session ID <span className="normal-case text-[#BABEC3]">(opc)</span></label><input value={trSessionId} onChange={(e) => setTrSessionId(e.target.value)} placeholder="SESS-1" className={INPUT_CLS} /></div>
                </div>
                {trError && <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {trError}</div>}
              </div>
            </div>
          )}

          {submitError && (
            <div className="flex items-start gap-2 rounded-xl border border-[#E63946]/30 bg-[#E63946]/5 px-3 py-2.5 text-[12px] text-[#E63946]">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="bg-white border border-[#E8EBEC] px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] text-[#58646D] text-[12px] transition disabled:opacity-40">
              Cancelar
            </button>
            <button type="submit" disabled={saving || loadingEdit} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed px-4 py-2 rounded-full transition">
              {saving ? <Loader2 size={13} className="animate-spin" /> : isEdit ? null : <Plus size={13} />} {isEdit ? 'Guardar cambios' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DeleteProjectModal({ target, onClose, onDeleted }: { target: { slug: string; name: string }; onClose: () => void; onDeleted: (slug: string) => void }) {
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const match = confirm.trim() === target.slug;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!match) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(target.slug)}`, { method: 'DELETE' });
      onDeleted(target.slug);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar');
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" style={{ background: 'rgba(26,31,46,0.45)' }} onClick={saving ? undefined : onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_12px_40px_-8px_rgba(16,75,153,0.22)] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBEC]">
          <div className="text-[14px] font-semibold text-[#1a1f2e]" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Eliminar proyecto</div>
          <button onClick={onClose} disabled={saving} className="text-[#8B999D] hover:text-[#1a1f2e] transition disabled:opacity-40"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="text-[12px] text-[#58646D]">
            Vas a eliminar <span className="font-semibold text-[#1a1f2e]">{target.name}</span> (<span className="font-mono">{target.slug}</span>).
          </div>
          <div className="rounded-xl border border-[#E63946]/30 bg-[#E63946]/5 px-3 py-2.5 text-[11px] text-[#E63946]">
            Esto elimina la configuración, el knowledge y los archivos runtime del proyecto. Esta acción no se puede deshacer.
          </div>
          <div>
            <label className={LABEL_CLS}>Escribe <span className="font-mono normal-case">{target.slug}</span> para confirmar</label>
            <input value={confirm} onChange={e => setConfirm(e.target.value)} className={INPUT_CLS} placeholder={target.slug} />
          </div>
          {error && <div className="flex items-center gap-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {error}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="bg-white border border-[#E8EBEC] px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] text-[#58646D] text-[12px] transition disabled:opacity-40">Cancelar</button>
            <button type="submit" disabled={saving || !match} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#E63946] hover:bg-[#E63946]/90 disabled:bg-[#BABEC3] disabled:cursor-not-allowed px-4 py-2 rounded-full transition">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Eliminar proyecto
            </button>
          </div>
        </form>
      </div>
    </div>, document.body);
}

export function Configuracion() {
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'invalid'; text: string } | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    listProjects()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const handleCreated = (slug: string, status: number, reasons: string[]) => {
    setShowNew(false);
    setEditSlug(null);
    reload();
    if (status === 1) setNotice({ kind: 'ok', text: `Proyecto "${slug}" ${editSlug ? 'actualizado' : 'creado'} y listo (READY).` });
    else setNotice({ kind: 'invalid', text: `Proyecto "${slug}" ${editSlug ? 'actualizado' : 'creado'} (DRAFT/INVALID): ${reasons.join(', ') || 'no cumple readiness'}` });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleDeleted = (slug: string) => {
    setDeleteTarget(null);
    reload();
    setNotice({ kind: 'ok', text: `Proyecto "${slug}" eliminado.` });
    setTimeout(() => setNotice(null), 6000);
  };

  return (
    <div className="p-7 min-h-full" style={{ background: C.canvas }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FolderCog size={16} className="text-[#104B99]" />
            <span className="text-[13px] font-semibold text-[#1a1f2e]">Proyectos</span>
          </div>
          <button
            onClick={() => { setShowNew(true); setNotice(null); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1a1f2e] hover:bg-black px-4 py-2 rounded-full transition"
          >
            <Plus size={13} /> Nuevo proyecto
          </button>
        </div>

        {notice && (
          <div className={cn('mb-4 rounded-xl border px-4 py-3 text-[12px] flex items-center gap-2', notice.kind === 'ok' ? 'border-[#48A157]/30 bg-[#48A157]/5 text-[#357a42]' : 'border-[#E63946]/30 bg-[#E63946]/5 text-[#E63946]')}>
            <AlertCircle size={13} /> {notice.text}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-[72px] rounded-2xl bg-white border border-[#E8EBEC] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <BentoCard className="!p-8">
            <div className="flex items-center gap-3 text-[#E63946] mb-1">
              <AlertCircle size={18} />
              <span className="text-[14px] font-semibold">No se pudieron cargar los proyectos</span>
            </div>
            <p className="text-[12px] text-[#8B999D]">{error}</p>
          </BentoCard>
        )}

        {!loading && !error && items.length === 0 && (
          <BentoCard className="text-center !p-12 max-w-md mx-auto">
            <Boxes size={28} className="text-[#BABEC3] mx-auto mb-3" />
            <div className="text-[18px] font-medium text-[#1a1f2e] mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
              No hay proyectos configurados.
            </div>
            <div className="text-[11px] text-[#8B999D]">Crea tu primer proyecto para comenzar a automatizar.</div>
          </BentoCard>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map(p => (
              <div key={p.id} className="bg-white border border-[#E8EBEC] rounded-2xl px-5 py-4 flex items-center gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_STYLE[p.projectType] ?? TYPE_STYLE[1]}`}>
                      {TYPE_LABEL[p.projectType] ?? '—'}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[p.status] ?? STATUS_STYLE[0]}`}>
                      {STATUS_LABEL[p.status] ?? '—'}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.enabled ? 'bg-[#48A157]/8 text-[#48A157]' : 'bg-[#F4F1EA] text-[#8B999D]'}`}>
                      {p.enabled ? 'Habilitado' : 'Deshabilitado'}
                    </span>
                  </div>
                  <div className="text-[14px] font-medium text-[#1a1f2e] truncate">{p.name}</div>
                  <div className="text-[11px] text-[#8B999D] mt-0.5 font-mono">{p.slug}</div>
                </div>
                <button
                  onClick={() => { setEditSlug(p.slug); setNotice(null); }}
                  className="text-[12px] font-medium text-[#104B99] hover:text-[#104B99]/70 transition whitespace-nowrap"
                >
                  Editar
                </button>
                <button
                  onClick={() => { setDeleteTarget({ slug: p.slug, name: p.name }); setNotice(null); }}
                  className="text-[12px] font-medium text-[#E63946] hover:text-[#E63946]/70 transition whitespace-nowrap"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showNew || editSlug) && (
        <NewProjectModal
          onClose={() => { setShowNew(false); setEditSlug(null); }}
          onCreated={handleCreated}
          editSlug={editSlug ?? undefined}
        />
      )}
      {deleteTarget && (
        <DeleteProjectModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}