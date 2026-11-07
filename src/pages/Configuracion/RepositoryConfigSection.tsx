import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { AlertCircle, CheckCircle2, GitBranch, Loader2, PlugZap, Trash2 } from 'lucide-react';
import { cn } from '../../constants/theme';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const INPUT_CLS = 'w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]';
const LABEL_CLS = 'text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block';

const DEFAULTS = {
  defaultBranch: 'develop',
  specsPath: 'docs/specs',
  filePattern: 'test-plan-{key}.md',
  protectedBranches: 'main, master, develop',
};

interface RepositoryConfig {
  repoUrl: string;
  defaultBranch: string;
  specsPath: string;
  filePattern: string;
  protectedBranches: string[];
  credentialSecretRef: string | null;
  authMode: 'pat' | 'system';
  enabled: boolean;
}

interface TestResult {
  branchCount: number;
  remoteHead: string | null;
  defaultBranchExists: boolean;
  authMode: 'pat' | 'system';
  elapsedMs: number;
}

interface FormState {
  repoUrl: string;
  defaultBranch: string;
  specsPath: string;
  filePattern: string;
  protectedBranches: string;
  authMode: 'pat' | 'system';
  credentialSecretRef: string;
  enabled: boolean;
}

export interface RepositoryConfigSectionHandle {
  /** Saves when the form changed; returns an error message or null. */
  saveIfChanged: () => Promise<string | null>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`);
  return body as T;
}

function toForm(config: RepositoryConfig | null): FormState {
  return {
    repoUrl: config?.repoUrl ?? '',
    defaultBranch: config?.defaultBranch ?? DEFAULTS.defaultBranch,
    specsPath: config?.specsPath ?? DEFAULTS.specsPath,
    filePattern: config?.filePattern ?? DEFAULTS.filePattern,
    protectedBranches: config ? config.protectedBranches.join(', ') : DEFAULTS.protectedBranches,
    authMode: config?.authMode ?? 'system',
    credentialSecretRef: config?.credentialSecretRef ?? 'env:AZDO_GIT_PAT',
    enabled: config?.enabled ?? true,
  };
}

function toPayload(form: FormState) {
  return {
    repoUrl: form.repoUrl.trim(),
    defaultBranch: form.defaultBranch.trim(),
    specsPath: form.specsPath.trim(),
    filePattern: form.filePattern.trim(),
    protectedBranches: form.protectedBranches,
    credentialSecretRef: form.authMode === 'pat' ? form.credentialSecretRef.trim() : null,
    enabled: form.enabled,
  };
}

export const RepositoryConfigSection = forwardRef<RepositoryConfigSectionHandle, { slug: string }>(
  function RepositoryConfigSection({ slug }, ref) {
    const base = `/api/projects/${encodeURIComponent(slug)}/repository`;
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState<RepositoryConfig | null>(null);
    const [form, setForm] = useState<FormState>(toForm(null));
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
      setLoading(true);
      request<{ repository: RepositoryConfig | null }>(base)
        .then(({ repository }) => {
          setSaved(repository);
          setForm(toForm(repository));
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, [base]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setTestResult(null);
    };

    const dirty = JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(toForm(saved)));

    useImperativeHandle(ref, () => ({
      async saveIfChanged() {
        // An untouched, never-configured section is not an error.
        if (!dirty || (!saved && !form.repoUrl.trim())) return null;
        setError(null);
        try {
          const res = await request<{ repository: RepositoryConfig }>(base, { method: 'PUT', body: JSON.stringify(toPayload(form)) });
          setSaved(res.repository);
          setForm(toForm(res.repository));
          return null;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          return message;
        }
      },
    }), [base, dirty, form, saved]);

    const runTest = async () => {
      setTesting(true);
      setError(null);
      setTestResult(null);
      try {
        setTestResult(await request<TestResult>(`${base}/test`, { method: 'POST', body: JSON.stringify(toPayload(form)) }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTesting(false);
      }
    };

    const remove = async () => {
      if (!window.confirm('¿Quitar el repositorio de este proyecto? El módulo de Planificación dejará de mostrarlo.')) return;
      setRemoving(true);
      setError(null);
      try {
        await request(base, { method: 'DELETE' });
        setSaved(null);
        setForm(toForm(null));
        setTestResult(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRemoving(false);
      }
    };

    return (
      <div className="rounded-xl border border-[#E8EBEC] p-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[#58646D] inline-flex items-center gap-1.5">
            <GitBranch size={12} /> Repositorio de planes de prueba
          </span>
          {saved && <span className={cn('text-[10px]', saved.enabled ? 'text-[#48A157]' : 'text-[#8B999D]')}>{saved.enabled ? 'Configurado' : 'Desactivado'}</span>}
        </div>
        <div className="text-[10px] text-[#8B999D] mb-2 italic">
          Repositorio donde están los test-plan de cada HU. Lo usa el módulo Planificación de pruebas.
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={13} className="animate-spin" /> Cargando…</div>
        ) : (
          <div className="space-y-2">
            <div>
              <label className={LABEL_CLS}>URL del repositorio</label>
              <input value={form.repoUrl} onChange={(e) => set('repoUrl', e.target.value)} placeholder="https://org@dev.azure.com/org/proyecto/_git/repo" className={cn(INPUT_CLS, 'font-mono')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Rama por defecto</label>
                <input value={form.defaultBranch} onChange={(e) => set('defaultBranch', e.target.value)} placeholder="develop" className={cn(INPUT_CLS, 'font-mono')} />
              </div>
              <div>
                <label className={LABEL_CLS}>Carpeta de specs</label>
                <input value={form.specsPath} onChange={(e) => set('specsPath', e.target.value)} placeholder="docs/specs" className={cn(INPUT_CLS, 'font-mono')} />
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Patrón del archivo <span className="normal-case text-[#BABEC3]">({'{key}'} = key de la HU)</span></label>
              <input value={form.filePattern} onChange={(e) => set('filePattern', e.target.value)} placeholder="test-plan-{key}.md" className={cn(INPUT_CLS, 'font-mono')} />
            </div>
            <div>
              <label className={LABEL_CLS}>Ramas protegidas <span className="normal-case text-[#BABEC3]">(no se permite commit; admite release/*)</span></label>
              <input value={form.protectedBranches} onChange={(e) => set('protectedBranches', e.target.value)} placeholder="main, develop" className={cn(INPUT_CLS, 'font-mono')} />
            </div>
            <div>
              <label className={LABEL_CLS}>Credenciales</label>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 text-[12px] text-[#58646D]">
                  <input type="radio" className="mt-0.5" checked={form.authMode === 'system'} onChange={() => set('authMode', 'system')} />
                  <span>Credenciales de git de la máquina donde corre el motor <span className="text-[#8B999D]">(uso local)</span></span>
                </label>
                <label className="flex items-start gap-2 text-[12px] text-[#58646D]">
                  <input type="radio" className="mt-0.5" checked={form.authMode === 'pat'} onChange={() => set('authMode', 'pat')} />
                  <span>Token (PAT) en una variable de entorno del servidor</span>
                </label>
                {form.authMode === 'pat' && (
                  <div className="pl-5">
                    <input value={form.credentialSecretRef} onChange={(e) => set('credentialSecretRef', e.target.value)} placeholder="env:AZDO_GIT_PAT" className={cn(INPUT_CLS, 'font-mono')} />
                    <div className="text-[10px] text-[#8B999D] mt-1">
                      Solo el nombre de la variable; el token nunca se guarda aquí. El nombre debe contener GIT_PAT o GIT_TOKEN.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} className="rounded" />
              <label className="text-[12px] text-[#58646D]">Activo en Planificación de pruebas</label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={runTest}
                disabled={testing || !form.repoUrl.trim()}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border border-[#E8EBEC] bg-white text-[#1a1f2e] hover:bg-[#FAFAF7] disabled:opacity-40"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />} Probar conexión
              </button>
              {saved && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={removing}
                  className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full text-[#E63946] hover:bg-[#E63946]/5 disabled:opacity-40"
                >
                  {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Quitar repositorio
                </button>
              )}
              {dirty && saved && <span className="text-[10px] text-[#B7791F] ml-auto">Cambios sin guardar</span>}
            </div>
            {testResult && (
              <div className="flex items-start gap-1.5 text-[11px] text-[#48A157]">
                <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                  Conexión correcta ({testResult.authMode === 'pat' ? 'token' : 'credenciales de la máquina'}): {testResult.branchCount} ramas, {(testResult.elapsedMs / 1000).toFixed(1)} s.
                  {!testResult.defaultBranchExists && <span className="text-[#B7791F]"> La rama por defecto "{form.defaultBranch}" no existe en el remoto.</span>}
                </span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-1.5 text-[11px] text-[#E63946]">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
