import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MonitorSmartphone,
  Play,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useRecordingSession } from './useRecordingSession';
import { useRecordingExecution, type RecordingProjectDetail } from './useRecordingExecution';
import { useTestRailDestination } from './useTestRailDestination';
import { useWebRecordingReplay } from './useWebRecordingReplay';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenario, RecordingSummary } from '../../services/recordings/types';
import type { ActiveRun } from '../../types';

/**
 * Recording module.
 *
 * The flow is one line: pick the project, record the walkthrough, derive the scenarios,
 * publish them. Picking the project first is not a convenience — it is what binds the
 * recording to a configured application, so nothing here ever asks for a package name or a
 * URL.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface RecordingProject {
  slug: string;
  name: string;
  type: 'web' | 'mobile';
  ready: boolean;
}

async function fetchRecordingProjects(): Promise<RecordingProject[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error(`No se pudieron cargar los proyectos: ${res.statusText}`);
  const body = await res.json();
  const items = Array.isArray(body?.projects) ? body.projects : [];
  return items.map((p: any) => ({
    slug: p.slug,
    name: p.name ?? p.slug,
    type: p.projectType === 2 ? 'mobile' : 'web',
    // status 1 is READY in the engine's project registry.
    ready: p.status === 1 && p.enabled !== false,
  }));
}

/**
 * Reads the project's own configuration for what execution needs.
 *
 * The TestRail project and section come from here rather than from a form, so a recorded
 * case lands in the same place the rest of the project's cases do.
 */
async function fetchProjectDetail(slug: string): Promise<RecordingProjectDetail> {
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`No se pudo cargar el proyecto ${slug}`);
  const body = await res.json();
  return {
    slug: body?.project?.slug ?? slug,
    name: body?.project?.name ?? slug,
    type: body?.project?.projectType === 2 ? 'mobile' : 'web',
    appPackage: body?.mobileConfig?.packageName,
    apkPath: body?.mobileConfig?.apkPath,
    testRail: body?.testRailConfig ?? null,
  };
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 min-w-[92px]">
      <div className="text-[20px] font-semibold tracking-tight text-[#1a1f2e] leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[#8B999D] mt-1.5">{label}</div>
    </div>
  );
}

export function Recording({ onLaunch }: { onLaunch?: (run: ActiveRun) => void }) {
  const [projects, setProjects] = useState<RecordingProject[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectSlug, setProjectSlug] = useState('');
  const [projectDetail, setProjectDetail] = useState<RecordingProjectDetail | null>(null);
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dataOverrides, setDataOverrides] = useState<Record<string, Record<number, string>>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const session = useRecordingSession(projectSlug);
  const execution = useRecordingExecution();
  const testRail = useTestRailDestination(projectDetail?.testRail);
  const replay = useWebRecordingReplay();
  const project = projects.find((p) => p.slug === projectSlug);

  useEffect(() => {
    fetchRecordingProjects()
      .then(setProjects)
      .catch((err) => setProjectsError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!projectSlug) {
      setProjectDetail(null);
      return;
    }
    fetchProjectDetail(projectSlug)
      .then(setProjectDetail)
      .catch(() => setProjectDetail(null));
  }, [projectSlug]);

  // A fresh derivation pre-selects everything: the reviewer opts out, not in.
  useEffect(() => {
    setSelected(Object.fromEntries(session.scenarios.map((s) => [s.scenarioId, true])));
    setDataOverrides({});
    setPublishResult(null);
  }, [session.scenarios]);

  const selectedScenarios = useMemo(
    () => session.scenarios.filter((s) => selected[s.scenarioId]),
    [session.scenarios, selected],
  );

  const isRecording = session.phase === 'recording' || session.phase === 'starting';
  const busy = session.phase === 'starting' || session.phase === 'stopping' || session.phase === 'deriving';

  async function handlePublish() {
    if (!projectSlug || !session.recordingId || selectedScenarios.length === 0) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await recordingsApi.publishToTestRail(
        session.recordingId,
        projectSlug,
        selectedScenarios.map((s) => s.scenarioId),
        testRail.destination,
      );
      const created = res.created?.length ?? 0;
      const failed = res.failed?.length ?? 0;
      const where = res.sectionName ? `"${res.sectionName}"` : `${res.sectionId}`;
      setPublishResult(
        failed > 0
          ? `${created} caso(s) creados, ${failed} fallaron: ${res.failed[0]?.message ?? ''}`
          : `${created} caso(s) creados en TestRail (sección ${where})`,
      );
      const refreshed = await recordingsApi.scenarios(session.recordingId, projectSlug);
      session.setScenarios(refreshed.scenarios ?? []);
    } catch (err) {
      setPublishResult(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Web replay.
   *
   * Deliberately its own handler, next to the mobile one rather than merged with it: the two
   * share the selection and nothing else — different transport, different failure modes, and
   * no TestRail run in between.
   */
  async function handleReplay() {
    if (!projectSlug || !session.recordingId || selectedScenarios.length === 0) return;
    const launch = await replay.replay(projectSlug, session.recordingId, selectedScenarios, dataOverrides);
    if (!launch) return;
    // Same destination as a mobile run: the replay is a job like any other, and the live
    // screen is where a person expects to watch one — logs, progress and the failing step.
    onLaunch?.({
      id: launch.jobId,
      jobId: launch.jobId,
      project: projectDetail?.name ?? projectSlug,
      triggered: 'Grabación web',
      startedAt: new Date().toISOString(),
      progress: 0,
      total: launch.scenarioCount,
      completed: 0,
      passed: 0,
      failed: 0,
      currentTest: '',
      eta: '—',
      status: 'running',
    });
  }

  async function handleExecute() {
    if (!projectDetail || selectedScenarios.length === 0) return;
    // Publishing and executing must land in the same place: the run is created from the
    // cases this publishes, so honouring the picker here and not there would file the run
    // against a different section than the one on screen.
    const target: RecordingProjectDetail = {
      ...projectDetail,
      testRail: {
        projectIdTr: testRail.destination.projectId ?? projectDetail.testRail?.projectIdTr,
        suiteId: testRail.destination.suiteId ?? projectDetail.testRail?.suiteId,
        sectionId: testRail.destination.sectionId ?? projectDetail.testRail?.sectionId,
      },
    };
    const launch = await execution.execute(target, selectedScenarios, dataOverrides);
    if (!launch) return;
    onLaunch?.({
      id: launch.jobId,
      jobId: launch.jobId,
      project: projectDetail.name,
      triggered: 'Grabación',
      startedAt: new Date().toISOString(),
      progress: 0,
      total: launch.scenarioCount,
      completed: 0,
      passed: 0,
      failed: 0,
      currentTest: '',
      eta: '—',
      status: 'running',
      issueKey: launch.issueKey,
      checklistUrl: launch.checklistUrl,
    });
  }

  /** A sensitive field is never stored by the recorder, so a real value is required to run. */
  const missingSensitive = selectedScenarios.some((s) =>
    s.requiredData.some((d) => d.sensitive && !dataOverrides[s.scenarioId]?.[d.stepIndex]?.trim()),
  );

  return (
    <div className="p-6 max-w-[1180px] mx-auto space-y-4">
      {/* ── Step 1: project ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#E8EBEC] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-5 h-5 rounded-full bg-[#1a1f2e] text-white text-[10px] font-semibold flex items-center justify-center">
            1
          </span>
          <h2 className="text-[13px] font-semibold text-[#1a1f2e]">Proyecto a grabar</h2>
        </div>

        {projectsError && (
          <div className="text-[12px] text-[#B4463C] mb-3">{projectsError}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {projects.map((p) => {
            const active = p.slug === projectSlug;
            return (
              <button
                key={p.slug}
                disabled={isRecording}
                onClick={() => setProjectSlug(p.slug)}
                className={cn(
                  'text-left px-3.5 py-3 rounded-xl border transition disabled:opacity-50 disabled:cursor-not-allowed',
                  active
                    ? 'border-[#104B99] bg-[#F4F7FC]'
                    : 'border-[#E8EBEC] hover:border-[#BABEC3] bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#1a1f2e] truncate">{p.name}</span>
                  {active ? (
                    <CheckCircle2 size={14} className="text-[#104B99] shrink-0" />
                  ) : (
                    <Circle size={14} className="text-[#BABEC3] shrink-0" />
                  )}
                </div>
                <div className="text-[10px] text-[#8B999D] mt-1 flex items-center gap-1.5">
                  <MonitorSmartphone size={11} />
                  {p.type === 'mobile' ? 'Android · Appium' : 'Web · Playwright'}
                  {!p.ready && <span className="text-[#C2872F]">· sin configurar</span>}
                </div>
              </button>
            );
          })}
          {projects.length === 0 && !projectsError && (
            <div className="text-[12px] text-[#8B999D]">Cargando proyectos…</div>
          )}
        </div>
      </section>

      {/* ── Step 2: record ──────────────────────────────────────────── */}
      <section className={cn('bg-white rounded-2xl border border-[#E8EBEC] p-5', !projectSlug && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-5 h-5 rounded-full bg-[#1a1f2e] text-white text-[10px] font-semibold flex items-center justify-center">
            2
          </span>
          <h2 className="text-[13px] font-semibold text-[#1a1f2e]">Grabar el recorrido</h2>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#8B999D] mb-1.5">
              ¿Qué vas a recorrer?
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isRecording}
              placeholder="Ej. Registro de usuario nuevo"
              className="w-full px-3 py-2 rounded-lg border border-[#E8EBEC] text-[13px] outline-none focus:border-[#104B99] disabled:bg-[#FAFAF7]"
            />
          </div>

          {!isRecording ? (
            <button
              onClick={() => session.start(label.trim() || undefined)}
              disabled={!projectSlug || busy}
              className="bg-[#48A157] hover:bg-[#3d8a4a] disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition"
            >
              {session.phase === 'starting' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {session.phase === 'starting' ? 'Preparando…' : 'Iniciar grabación'}
            </button>
          ) : (
            <button
              onClick={session.stop}
              disabled={session.phase === 'stopping'}
              className="bg-[#B4463C] hover:bg-[#9c3b32] disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition"
            >
              {session.phase === 'stopping' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
              {session.phase === 'stopping' ? 'Cerrando…' : 'Detener'}
            </button>
          )}
        </div>

        {session.phase === 'recording' && (
          <div className="mt-4 rounded-xl border border-[#48A157]/30 bg-[#F3F9F4] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#48A157] animate-pulse" />
              <span className="text-[12px] font-semibold text-[#1a1f2e]">
                Grabando — {project?.type === 'mobile' ? 'usa la app en el emulador' : 'usa el navegador que se abrió'}
              </span>
            </div>
            <div className="flex gap-4">
              <Stat label="Acciones" value={session.live?.events ?? 0} />
              <Stat label="Pantallas" value={session.live?.screens ?? 0} />
              <div className="flex-[2] min-w-[160px]">
                <div className="text-[13px] font-medium text-[#1a1f2e] truncate">
                  {session.live?.currentScreen ?? '—'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#8B999D] mt-1.5">Pantalla actual</div>
              </div>
            </div>
            <p className="text-[11px] text-[#58646D] mt-3 leading-snug">
              No se guarda video. Se capturan las acciones y las pantallas; el material visual se usa solo para
              generar los escenarios y se elimina al terminar.
            </p>
          </div>
        )}

        {session.phase === 'stopped' && session.summary && (
          <div className="mt-4 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] p-4">
            <div className="flex gap-4 mb-3">
              <Stat label="Acciones" value={session.summary.actionCount} />
              <Stat label="Pantallas" value={session.summary.screenCount} />
              <Stat label="Duración" value={formatDuration(session.summary.durationMs)} />
            </div>
            <button
              onClick={() => session.derive(label.trim() || undefined)}
              disabled={session.phase !== 'stopped'}
              className="bg-[#104B99] hover:bg-[#0d3d7d] text-white text-[12px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition"
            >
              <Sparkles size={13} /> Generar escenarios
            </button>
          </div>
        )}

        {session.phase === 'deriving' && (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-[#58646D]">
            <Loader2 size={14} className="animate-spin" />
            Analizando el recorrido y construyendo los escenarios…
          </div>
        )}

        {session.error && (
          <div className="mt-3 flex items-start gap-2 text-[12px] text-[#B4463C]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{session.error}</span>
          </div>
        )}
      </section>

      {/* ── Step 3: scenarios ───────────────────────────────────────── */}
      {session.scenarios.length > 0 && (
        <section className="bg-white rounded-2xl border border-[#E8EBEC] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#1a1f2e] text-white text-[10px] font-semibold flex items-center justify-center">
                3
              </span>
              <h2 className="text-[13px] font-semibold text-[#1a1f2e]">
                Escenarios derivados ({session.scenarios.length})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePublish}
                disabled={publishing || selectedScenarios.length === 0}
                className="border border-[#E8EBEC] hover:border-[#BABEC3] disabled:opacity-40 text-[#1a1f2e] text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition"
              >
                {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Enviar a TestRail ({selectedScenarios.length})
              </button>
              {projectDetail?.type === 'mobile' && (
                <button
                  onClick={handleExecute}
                  disabled={execution.running || selectedScenarios.length === 0 || missingSensitive}
                  title={
                    missingSensitive
                      ? 'Completa los datos sensibles antes de ejecutar'
                      : 'Publica en TestRail y ejecuta en el emulador'
                  }
                  className="bg-[#1a1f2e] hover:bg-black disabled:opacity-40 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition"
                >
                  {execution.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Publicar y ejecutar
                </button>
              )}
              {projectDetail?.type === 'web' && (
                <button
                  onClick={handleReplay}
                  disabled={replay.starting || selectedScenarios.length === 0 || missingSensitive}
                  title={
                    missingSensitive
                      ? 'Completa los datos sensibles antes de reproducir'
                      : 'Reproduce el recorrido en un navegador y, si pasa, genera el spec'
                  }
                  className="bg-[#1a1f2e] hover:bg-black disabled:opacity-40 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition"
                >
                  {replay.starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Reproducir y generar spec
                </button>
              )}
            </div>
          </div>

          {replay.error && (
            <div className="mb-3 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{replay.error}</span>
            </div>
          )}

          <TestRailDestinationPicker testRail={testRail} />

          {publishResult && (
            <div className="mb-3 text-[12px] text-[#58646D] bg-[#FAFAF7] rounded-lg px-3 py-2">{publishResult}</div>
          )}
          {execution.error && (
            <div className="mb-3 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{execution.error}</span>
            </div>
          )}
          {execution.notice && (
            <div className="mb-3 text-[12px] text-[#58646D] bg-[#FAFAF7] rounded-lg px-3 py-2">{execution.notice}</div>
          )}

          <div className="space-y-2.5">
            {session.scenarios.map((s) => (
              <ScenarioCard
                key={s.scenarioId}
                scenario={s}
                checked={Boolean(selected[s.scenarioId])}
                onToggle={() => setSelected((prev) => ({ ...prev, [s.scenarioId]: !prev[s.scenarioId] }))}
                overrides={dataOverrides[s.scenarioId] ?? {}}
                onOverride={(stepIndex, value) =>
                  setDataOverrides((prev) => ({
                    ...prev,
                    [s.scenarioId]: { ...(prev[s.scenarioId] ?? {}), [stepIndex]: value },
                  }))
                }
              />
            ))}
          </div>

          {session.narrative && (
            <details className="mt-4 group">
              <summary className="text-[12px] font-medium text-[#104B99] cursor-pointer select-none">
                Ver el paso a paso observado
              </summary>
              <pre className="mt-2 text-[11px] leading-relaxed text-[#58646D] whitespace-pre-wrap bg-[#FAFAF7] rounded-lg p-3 max-h-[320px] overflow-y-auto">
                {session.narrative}
              </pre>
            </details>
          )}
        </section>
      )}

      {/* ── History ─────────────────────────────────────────────────── */}
      {projectSlug && session.history.length > 0 && (
        <section className="bg-white rounded-2xl border border-[#E8EBEC] p-5">
          <h2 className="text-[13px] font-semibold text-[#1a1f2e] mb-3">Grabaciones anteriores</h2>
          <div className="space-y-1.5">
            {session.history.map((h) => (
              <HistoryRow
                key={h.recordingId}
                item={h}
                active={h.recordingId === session.recordingId}
                onOpen={() => session.openExisting(h.recordingId)}
                onDelete={() => session.remove(h.recordingId)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Where the cases will be filed.
 *
 * Rendered above the publish button rather than in a settings screen: the destination is a
 * decision taken at publish time, and the section a recording belongs to is often not the
 * one the project files its regular cases in.
 */
function TestRailDestinationPicker({ testRail }: { testRail: ReturnType<typeof useTestRailDestination> }) {
  const select =
    'px-2.5 py-1.5 rounded-lg border border-[#E8EBEC] text-[12px] bg-white outline-none focus:border-[#104B99] min-w-0';
  return (
    <div className="mb-3 bg-[#FAFAF7] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[#8B999D]">Destino en TestRail</span>
        {testRail.loading && <Loader2 size={11} className="animate-spin text-[#8B999D]" />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={testRail.projectId}
          onChange={(e) => testRail.chooseProject(e.target.value)}
          className={select}
        >
          <option value="">Proyecto…</option>
          {testRail.projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={testRail.suiteId}
          onChange={(e) => testRail.chooseSuite(e.target.value)}
          disabled={!testRail.projectId || testRail.suites.length === 0}
          className={cn(select, 'disabled:opacity-50')}
        >
          <option value="">Suite…</option>
          {testRail.suites.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={testRail.sectionId}
          onChange={(e) => testRail.setSectionId(e.target.value)}
          disabled={!testRail.suiteId || testRail.sections.length === 0}
          className={cn(select, 'disabled:opacity-50')}
        >
          <option value="">Sección…</option>
          {testRail.sections.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.depth > 0 ? `${'— '.repeat(s.depth)}${s.name}` : s.name}
            </option>
          ))}
        </select>
      </div>
      {testRail.error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-[#B4463C]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{testRail.error}</span>
        </div>
      )}
      {!testRail.sectionId && (
        <p className="mt-2 text-[11px] text-[#8B999D]">
          Sin selección se usa la sección configurada en el proyecto.
        </p>
      )}
    </div>
  );
}

function ScenarioCard({
  scenario,
  checked,
  onToggle,
  overrides,
  onOverride,
}: {
  scenario: RecordedScenario;
  checked: boolean;
  onToggle: () => void;
  overrides: Record<number, string>;
  onOverride: (stepIndex: number, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('rounded-xl border transition', checked ? 'border-[#104B99]/40 bg-[#FBFCFE]' : 'border-[#E8EBEC]')}>
      <div className="flex items-start gap-3 p-3.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 w-4 h-4 accent-[#104B99] cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-[#1a1f2e]">{scenario.title}</span>
            <span
              className={cn(
                'text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded',
                scenario.kind === 'negative' ? 'bg-[#FDF3E7] text-[#C2872F]' : 'bg-[#F3F9F4] text-[#48A157]',
              )}
            >
              {scenario.kind === 'negative' ? 'Negativo' : 'Camino feliz'}
            </span>
            {scenario.testRailCaseId && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#104B99]">
                TR C{scenario.testRailCaseId}
              </span>
            )}
            {scenario.provenance === 'derived' && (
              <span
                title="La grabación no recorrió este caso: se publica, pero no se ejecuta automáticamente"
                className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#F4F1EA] text-[#8A7B5C]"
              >
                Derivado
              </span>
            )}
            {scenario.scope === 'segment' && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#58646D]">
                Bloque
              </span>
            )}
            {scenario.hasUncertainSteps && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FDF0EF] text-[#B4463C]">
                Revisar locators
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-[#58646D] mt-1 leading-snug">{scenario.description}</p>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-medium text-[#104B99] mt-2"
          >
            {open ? 'Ocultar pasos' : `Ver ${scenario.testRailSteps.length} pasos`}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5">
          <ol className="space-y-1.5 border-l-2 border-[#E8EBEC] pl-3 ml-1">
            {scenario.testRailSteps.map((step, i) => (
              <li key={i} className="text-[11.5px]">
                <div className="text-[#1a1f2e]">
                  <span className="text-[#8B999D] mr-1.5">{i + 1}.</span>
                  {step.content}
                </div>
                <div className="text-[#48A157] mt-0.5">→ {step.expected}</div>
              </li>
            ))}
          </ol>
          {scenario.stepTargets && scenario.stepTargets.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-medium text-[#1a1f2e] mb-1.5">
                Identificadores ({scenario.stepTargets.length})
              </div>
              <div className="space-y-1">
                {scenario.stepTargets.map((t) => (
                  <div
                    key={`${t.stepIndex}-${t.value}`}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5',
                      t.ambiguous ? 'bg-[#FDF0EF]' : 'bg-[#FAFAF7]',
                    )}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-[#1a1f2e]">{t.description}</span>
                      {t.ambiguous && (
                        <span
                          title="La etiqueta se repite en la pantalla: este identificador depende de la posición"
                          className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FDE3E1] text-[#B4463C]"
                        >
                          Por posición
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] font-mono text-[#58646D] mt-0.5 break-all">
                      <span className="text-[#8B999D]">{t.strategy}:</span> {t.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {scenario.requiredData.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-medium text-[#1a1f2e] mb-1.5">Datos del escenario</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {scenario.requiredData.map((d) => (
                  <label key={`${d.key}-${d.stepIndex}`} className="block">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[#8B999D]">
                      {d.label}
                      {d.sensitive && <span className="text-[#B4463C]"> · requerido</span>}
                    </span>
                    <input
                      type={d.sensitive ? 'password' : 'text'}
                      value={overrides[d.stepIndex] ?? (d.sensitive ? '' : d.exampleValue ?? '')}
                      onChange={(e) => onOverride(d.stepIndex, e.target.value)}
                      placeholder={d.sensitive ? 'No se grabó — ingrésalo para ejecutar' : d.exampleValue}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-[#E8EBEC] text-[12px] outline-none focus:border-[#104B99]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  item,
  active,
  onOpen,
  onDelete,
}: {
  item: RecordingSummary;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition',
        active ? 'border-[#104B99]/40 bg-[#FBFCFE]' : 'border-transparent hover:bg-[#FAFAF7]',
      )}
    >
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="text-[12.5px] font-medium text-[#1a1f2e] truncate">
          {item.label || `Grabación ${item.recordingId.slice(0, 8)}`}
        </div>
        <div className="text-[10px] text-[#8B999D] mt-0.5 flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            <Clock size={10} /> {new Date(item.startedAt).toLocaleString()}
          </span>
          <span>{item.actionCount} acciones</span>
          <span>{item.screenCount} pantallas</span>
          {item.scenarioCount > 0 && <span style={{ color: C.green }}>{item.scenarioCount} escenarios</span>}
        </div>
      </button>
      <button
        onClick={onDelete}
        title="Eliminar grabación"
        className="text-[#BABEC3] hover:text-[#B4463C] transition p-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
