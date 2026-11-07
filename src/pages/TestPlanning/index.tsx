import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  FolderGit2,
  GitBranch,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import {
  testPlanning,
  type BranchInfo,
  type PlanDocument,
  type PlanningProject,
  type PlansResponse,
} from '../../services/test-planning';
import { PlanEditor } from './PlanEditor';
import { REVIEW_LABELS, reviewState } from './plan-utils';

/**
 * "Planificación de pruebas": pick a project, then a branch of its repository,
 * and review the test-plan-<HU>.md files of that branch. A QA can complete the
 * scenarios and commit + push the change, or accept the plan as valid; both are
 * recorded for the dashboard. The engine keeps its own clone of the repository.
 */

const branchKey = (slug: string) => `qa-lab.testplanning.branch.${slug}`;

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString();
}

// --- Step 1: project selection ------------------------------------------------------

function ProjectSelection({ projects, error, onOpen }: { projects: PlanningProject[] | null; error: string | null; onOpen: (project: PlanningProject) => void }) {
  const [unconfigured, setUnconfigured] = useState<PlanningProject | null>(null);
  const { can } = useAuth();

  if (unconfigured) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8EBEC] py-14 px-6 flex flex-col items-center gap-3 text-center">
        <FolderGit2 size={30} className="text-[#BABEC3]" />
        <div className="text-[15px] font-semibold text-[#1a1f2e]">{unconfigured.name} todavía no tiene un repositorio de planes</div>
        <div className="text-[12.5px] text-[#58646D] max-w-md leading-relaxed">
          Para revisar sus test-plan aquí, hay que indicar en qué repositorio y carpeta están.
          {can('projects.edit') ? (
            <> Ve a <b>Configuración</b>, edita el proyecto y completa el bloque <b>Repositorio de planes de prueba</b>.</>
          ) : (
            <> Pide a un administrador que lo configure en <b>Configuración → proyecto → Repositorio de planes de prueba</b>.</>
          )}
        </div>
        <button
          type="button"
          onClick={() => setUnconfigured(null)}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E8EBEC] text-[12px] text-[#1a1f2e] hover:bg-[#FAFAF7]"
        >
          <ArrowLeft size={13} /> Elegir otro proyecto
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[15px] font-semibold text-[#1a1f2e]">Selecciona un proyecto</div>
        <div className="text-[12px] text-[#8B999D]">Solo ves los proyectos a los que tienes acceso.</div>
      </div>
      {error && (
        <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C] flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {!projects && !error && (
        <div className="py-16 flex items-center justify-center gap-2 text-[13px] text-[#8B999D]"><Loader2 size={14} className="animate-spin" /> Cargando proyectos…</div>
      )}
      {projects && projects.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E8EBEC] py-14 text-center text-[13px] text-[#8B999D]">No tienes proyectos asignados.</div>
      )}
      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((project) => (
            <button
              type="button"
              key={project.slug}
              onClick={() => (project.configured ? onOpen(project) : setUnconfigured(project))}
              className="group bg-white rounded-2xl border border-[#E8EBEC] p-4 text-left hover:border-[#104B99]/40 hover:shadow-sm transition flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', project.configured ? 'bg-[#104B99]/8 text-[#104B99]' : 'bg-[#F4F1EA] text-[#BABEC3]')}>
                    <FolderGit2 size={16} />
                  </div>
                  <div className="text-[14px] font-semibold text-[#1a1f2e] truncate">{project.name}</div>
                </div>
                <ChevronRight size={15} className="text-[#BABEC3] group-hover:text-[#104B99] mt-1.5 flex-shrink-0" />
              </div>
              {project.configured ? (
                <>
                  <div className="text-[11px] text-[#8B999D] font-mono truncate" title={project.repository ?? ''}>{project.repository}</div>
                  <div className="text-[11px] text-[#58646D]">
                    Rama por defecto <span className="font-mono">{project.defaultBranch}</span> · último fetch {timeAgo(project.lastFetchAt)}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[#B7791F] inline-flex items-center gap-1"><Settings size={11} /> Sin repositorio configurado</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Branch picker ------------------------------------------------------------------

function BranchPicker({ branches, value, onChange }: { branches: BranchInfo[]; value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyWithPlans, setOnlyWithPlans] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const current = branches.find((b) => b.name === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const visible = branches.filter(
    (b) => (!onlyWithPlans || b.planCount > 0 || b.name === value) && b.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div ref={ref} className="relative min-w-0 flex-1 max-w-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white border border-[#E8EBEC] rounded-xl px-3 py-2 flex items-center gap-2 text-left hover:border-[#BABEC3]"
      >
        <GitBranch size={14} className="text-[#8B999D] flex-shrink-0" />
        <span className="text-[13px] font-mono text-[#1a1f2e] truncate flex-1">{value || 'Selecciona una rama'}</span>
        {current && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#104B99]/8 text-[#104B99] flex-shrink-0">{current.planCount} test-plan</span>}
        <ChevronDown size={14} className="text-[#8B999D] flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#E8EBEC] rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-[#F0F1F2] space-y-2">
            <div className="flex items-center gap-2 bg-[#FAFAF7] rounded-lg px-2">
              <Search size={13} className="text-[#8B999D]" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar rama…" className="flex-1 bg-transparent py-1.5 text-[12px] outline-none" />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-[#58646D] px-1">
              <input type="checkbox" checked={onlyWithPlans} onChange={(e) => setOnlyWithPlans(e.target.checked)} />
              Solo ramas con test-plan
            </label>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visible.length === 0 && <div className="px-3 py-4 text-[12px] text-[#8B999D] text-center">Sin ramas que coincidan.</div>}
            {visible.map((branch) => (
              <button
                type="button"
                key={branch.name}
                onClick={() => {
                  onChange(branch.name);
                  setOpen(false);
                }}
                className={cn('w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-[#FAFAF7]', branch.name === value && 'bg-[#104B99]/5')}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-mono text-[#1a1f2e] truncate">{branch.name}</div>
                  <div className="text-[10px] text-[#8B999D] truncate">{timeAgo(branch.committedAt)} · {branch.subject}</div>
                </div>
                {branch.protected && <span title="Rama protegida: no se permite commit"><Lock size={11} className="text-[#8B999D]" /></span>}
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', branch.planCount ? 'bg-[#104B99]/8 text-[#104B99]' : 'bg-[#F4F1EA] text-[#BABEC3]')}>
                  {branch.planCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Step 2: branches and plans of one project --------------------------------------------

function ProjectWorkspace({ project, onBack }: { project: PlanningProject; onBack: () => void }) {
  const { can } = useAuth();
  const canSync = can('testplanning.sync');
  const canEdit = can('testplanning.edit');
  const canCommit = can('testplanning.commit');
  const slug = project.slug;

  const [branches, setBranches] = useState<{ list: BranchInfo[]; lastFetchAt: string | null } | null>(null);
  const [branch, setBranch] = useState('');
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [doc, setDoc] = useState<PlanDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'fetch' | 'pull' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  /** Asks before throwing away unsaved scenario edits. */
  const leaveOk = () => !dirty || window.confirm('Tienes cambios sin confirmar en este plan. ¿Descartarlos?');

  // Branches (the engine clones the repository on first use).
  useEffect(() => {
    let cancelled = false;
    testPlanning
      .listBranches(slug)
      .then((res) => {
        if (cancelled) return;
        setBranches({ list: res.branches, lastFetchAt: res.status.lastFetchAt });
        const remembered = recall(branchKey(slug));
        const names = new Set(res.branches.map((b) => b.name));
        setBranch(remembered && names.has(remembered) ? remembered : names.has(res.defaultBranch) ? res.defaultBranch : res.branches[0]?.name ?? '');
      })
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loadPlans = useCallback(
    (branchName: string, keepPath?: string) =>
      testPlanning.listPlans(slug, branchName).then((res) => {
        setPlans(res);
        const keep = keepPath && res.plans.some((p) => p.path === keepPath) ? keepPath : '';
        setSelectedPath(keep || res.plans[0]?.path || '');
        return res;
      }),
    [slug],
  );

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    loadPlans(branch).catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [branch, loadPlans]);

  const loadDoc = useCallback(
    (branchName: string, path: string) =>
      testPlanning
        .getPlan(slug, branchName, path)
        .then((next) => {
          setDoc(next);
          setDocError(null);
        })
        .catch((e) => setDocError(message(e))),
    [slug],
  );

  useEffect(() => {
    if (!plans || !selectedPath || plans.branch !== branch) return;
    void loadDoc(branch, selectedPath);
  }, [plans, selectedPath, branch, loadDoc]);

  const openPlan = (path: string) => {
    if (path === selectedPath || !leaveOk()) return;
    setDirty(false);
    setDocError(null);
    setSelectedPath(path);
  };

  const selectBranch = (next: string) => {
    if (next === branch || !leaveOk()) return;
    remember(branchKey(slug), next);
    setDirty(false);
    setError(null);
    setNotice(null);
    setPlans(null);
    setDoc(null);
    setBranch(next);
  };

  const runFetch = async () => {
    setBusy('fetch');
    setError(null);
    setNotice(null);
    try {
      const res = await testPlanning.fetch(slug);
      setBranches({ list: res.branches, lastFetchAt: res.status.lastFetchAt });
      const head = res.branches.find((b) => b.name === branch)?.headSha;
      setNotice(plans && head && head !== plans.headSha ? 'La rama tiene cambios nuevos en el remoto. Usa Pull para verlos.' : 'Ramas actualizadas.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const runPull = async () => {
    if (!leaveOk()) return;
    setBusy('pull');
    setError(null);
    setNotice(null);
    try {
      const before = plans?.headSha;
      const res = await testPlanning.pull(slug, branch);
      setBranches((prev) =>
        prev && {
          lastFetchAt: res.status.lastFetchAt,
          list: prev.list.map((b) => (b.name === branch ? { ...b, headSha: res.headSha, planCount: res.plans.length } : b)),
        },
      );
      setDirty(false);
      setDoc(null);
      await loadPlans(branch, selectedPath);
      setNotice(before && before !== res.headSha ? 'Rama actualizada al último commit.' : 'La rama ya estaba al día.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  /** After a commit or an acceptance: show the new version and refresh the badges. */
  const onDocChange = (next: PlanDocument, text: string) => {
    setDirty(false);
    setDoc(next);
    setNotice(text);
    setPlans((prev) =>
      prev && {
        ...prev,
        headSha: next.headSha,
        plans: prev.plans.map((p) => (p.path === next.file.path ? { ...next.file, review: next.review } : p)),
      },
    );
    setBranches((prev) => prev && { ...prev, list: prev.list.map((b) => (b.name === next.branch ? { ...b, headSha: next.headSha } : b)) });
  };

  const reloadDoc = () => {
    setDirty(false);
    setDoc(null);
    void loadPlans(branch, selectedPath);
  };

  const back = () => {
    if (leaveOk()) onBack();
  };

  const loadingBranches = !branches && !error;
  const loadingPlans = !!branch && (!plans || plans.branch !== branch) && !error;
  const currentPlans = plans && plans.branch === branch ? plans.plans : [];
  const loadingDoc = !!selectedPath && (!doc || doc.file.path !== selectedPath || doc.branch !== branch) && !docError;
  const branchList = useMemo(() => branches?.list ?? [], [branches]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={back} className="inline-flex items-center gap-1 text-[12px] text-[#58646D] hover:text-[#1a1f2e]">
          <ArrowLeft size={14} /> Proyectos
        </button>
        <div className="text-[14px] font-semibold text-[#1a1f2e]">{project.name}</div>
        {loadingBranches ? (
          <div className="flex items-center gap-2 text-[12px] text-[#8B999D]">
            <Loader2 size={13} className="animate-spin" /> {project.cloned ? 'Cargando ramas…' : 'Clonando el repositorio (solo la primera vez)…'}
          </div>
        ) : (
          <BranchPicker branches={branchList} value={branch} onChange={selectBranch} />
        )}
        {canSync && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={runFetch}
              disabled={!!busy || loadingBranches}
              title="Traer del remoto la lista y el estado de todas las ramas"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-full border border-[#E8EBEC] bg-white text-[#1a1f2e] hover:bg-[#FAFAF7] disabled:opacity-40"
            >
              {busy === 'fetch' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Fetch
            </button>
            <button
              type="button"
              onClick={runPull}
              disabled={!!busy || !branch}
              title="Actualizar la rama seleccionada al último commit y recargar los planes"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-full bg-[#1a1f2e] text-white hover:bg-black disabled:bg-[#BABEC3]"
            >
              {busy === 'pull' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Pull
            </button>
          </div>
        )}
        <div className="text-[11px] text-[#8B999D] ml-auto" title={project.repository ?? ''}>
          Último fetch: {timeAgo(branches?.lastFetchAt ?? project.lastFetchAt)}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C] flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {notice && !error && <div className="rounded-xl bg-[#104B99]/5 px-4 py-2.5 text-[12px] text-[#104B99]">{notice}</div>}

      {branch && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="bg-white rounded-2xl border border-[#E8EBEC] overflow-hidden lg:sticky lg:top-0">
            <div className="px-4 py-3 border-b border-[#F0F1F2] flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[#1a1f2e]">Test-plans de la rama</span>
              {plans?.protected && plans.branch === branch && (
                <span className="text-[10px] text-[#8B999D] inline-flex items-center gap-1" title="No se permite commit en esta rama"><Lock size={10} /> protegida</span>
              )}
            </div>
            {loadingPlans ? (
              <div className="px-4 py-6 flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={13} className="animate-spin" /> Cargando…</div>
            ) : currentPlans.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-[#8B999D]">Esta rama no tiene archivos {project.specsPath}/…/test-plan-*.md</div>
            ) : (
              <div className="divide-y divide-[#F0F1F2]">
                {currentPlans.map((plan) => {
                  const state = REVIEW_LABELS[reviewState(plan.review)];
                  return (
                    <button
                      type="button"
                      key={plan.path}
                      onClick={() => openPlan(plan.path)}
                      className={cn('w-full px-4 py-3 text-left hover:bg-[#FAFAF7] flex items-start gap-2.5', plan.path === selectedPath && 'bg-[#104B99]/5')}
                    >
                      <FileText size={14} className={cn('mt-0.5 flex-shrink-0', plan.path === selectedPath ? 'text-[#104B99]' : 'text-[#8B999D]')} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-[#1a1f2e]">{plan.key}</span>
                          {plan.matchesBranch && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#48A157]/10 text-[#48A157]">HU de la rama</span>}
                        </div>
                        <div className="text-[10px] text-[#8B999D] truncate" title={plan.folder}>{plan.folder}</div>
                        <span title={state.hint} className={cn('inline-block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full', state.className)}>{state.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0">
            {docError && (
              <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C] flex items-start gap-2">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {docError}
              </div>
            )}
            {loadingDoc && (
              <div className="py-16 flex items-center justify-center gap-2 text-[13px] text-[#8B999D]"><Loader2 size={14} className="animate-spin" /> Leyendo el plan…</div>
            )}
            {!loadingDoc && doc && doc.file.path === selectedPath && (
              <PlanEditor
                key={`${doc.branch}:${doc.file.path}:${doc.file.blobSha}`}
                slug={slug}
                doc={doc}
                canEdit={canEdit}
                canCommit={canCommit}
                onDirtyChange={setDirty}
                onDocChange={onDocChange}
                onReload={reloadDoc}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TestPlanning() {
  const [projects, setProjects] = useState<PlanningProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<PlanningProject | null>(null);

  useEffect(() => {
    testPlanning
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(message(e)));
  }, []);

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      <div className="max-w-7xl mx-auto">
        {current ? (
          <ProjectWorkspace key={current.slug} project={current} onBack={() => setCurrent(null)} />
        ) : (
          <ProjectSelection projects={projects} error={error} onOpen={setCurrent} />
        )}
      </div>
    </div>
  );
}
