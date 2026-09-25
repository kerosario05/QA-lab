import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MonitorSmartphone,
  Play,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useRecordingSession, type RecordingPhase } from './useRecordingSession';
import { useRecordingExecution, type RecordingProjectDetail } from './useRecordingExecution';
import { useTestRailDestination } from './useTestRailDestination';
import { TestRailUploadScreen } from './TestRailUploadScreen';
import { ApiError, recordingsApi } from '../../services/recordings';
import { flushScenarioValueWrites, stageScenarioValueWrite } from '../../services/recordings/scenario-value-flush';
import type { RecordedScenario, RecordedScenarioStep, RecordingSummary } from '../../services/recordings/types';
import type { ActiveRun } from '../../types';
import { derivationFeedback } from './derivation-feedback';
import { isQaOverridableRuntimeInput, missingInputLabel, readinessBadge, resolveScenarioReadiness, runtimeRequirementsForScenario } from './recording-readiness';

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

/**
 * The dataset-value save gate, extracted as a pure decision so it is testable without mounting
 * the whole page. Order matters: the sensitive-materialization policy is checked FIRST and
 * unconditionally -- it must never be bypassed just because the scenario happens to be ready.
 *
 * `scenarioPersisted` is PER-SCENARIO authority -- whether THIS scenarioId specifically is
 * already in the backend's own persisted scenario store (from `derive()`'s response or
 * `GET .../scenarios`, never a global "some scenario is ready" flag). A scenario B that is still
 * only a live/unpersisted preview must never piggyback on scenario A having been persisted.
 */
export function decideDatasetSaveAction(params: {
  sensitive: boolean;
  allowSensitiveMaterialization: boolean;
  scenarioPersisted: boolean;
}): 'skip_sensitive' | 'queue_not_ready' | 'attempt' {
  if (params.sensitive && !params.allowSensitiveMaterialization) return 'skip_sensitive';
  if (!params.scenarioPersisted) return 'queue_not_ready';
  return 'attempt';
}

/**
 * Replay (Recording Replay / `/execute`) authority is a SEPARATE question from dataset-save
 * authority above, but shares the same underlying invariant: `executionReadiness` alone (can the
 * recorded ACTIONS technically be attempted) says nothing about whether THIS scenarioId has
 * actually reached the backend's persisted scenario store yet. A scenario still shown from the
 * live/unpersisted preview can be `executionReadiness: true` while `loadScenarios(...)` on the
 * backend is still empty for it -- sending it to `POST /execute` in that state is exactly what
 * produces `409 SCENARIO_NOT_READY`. Neither scenario visibility, `session.scenarios.length`,
 * recording-stopped status, nor TestRail publication readiness may substitute for
 * `scenarioPersisted` here.
 */
export function canReplayScenario(params: { executionReadiness: boolean; scenarioPersisted: boolean }): boolean {
  return params.executionReadiness && params.scenarioPersisted;
}

/**
 * A mixed selection (one scenario already persisted, another still only live) must never
 * execute as a partial batch -- the whole action stays blocked until EVERY selected scenario is
 * individually replayable. An empty selection is never "blocked" (there is simply nothing to
 * gate yet); the caller separately disables the button on an empty selection.
 */
export function isExecutionSelectionBlocked(entries: Array<{ executionReadiness: boolean; scenarioPersisted: boolean }>): boolean {
  return entries.length > 0 && entries.some((entry) => !canReplayScenario(entry));
}

/**
 * FIRST_LOSS fix (recordingId df1bdcbd-8e22-4c85-b259-5dde8fe8e277): the "Generar escenarios"
 * button used to be gated behind `session.summary` too, which `openExisting` only ever populates
 * from `history.find((h) => h.recordingId === id)` -- a lookup that can legitimately miss a
 * just-finished recording if `history` has not yet refreshed to include it, leaving `summary`
 * null even though `recordingId`/`phase` are already correct. That silently hid the entire panel
 * (including the button), so `derive()` was never called and no `POST /derive` was ever sent --
 * not a guard inside `derive()` itself (which only ever checks `recordingId`), but this render
 * gate. `session.summary` is display-only stat data (action/screen counts, duration); it must
 * never decide whether the derive capability itself is offered.
 */
export function canShowScenarioGenerationPanel(phase: RecordingPhase): boolean {
  return phase === 'stopped' || phase === 'derived';
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
  const [executionSelected, setExecutionSelected] = useState<Record<string, boolean>>({});
  // Keyed by the STABLE scenarioId, never local component state: a scenario card can be
  // unmounted/remounted (e.g. the primary-scenario slot briefly has no match while
  // `session.scenarios` is mid-refresh) without losing whether its steps panel was open --
  // the same invariant `selected`/`executionSelected` above already rely on.
  const [expandedScenarioIds, setExpandedScenarioIds] = useState<Record<string, boolean>>({});
  // A dataset edit blurred BEFORE the backend has materialized its scenario (still
  // mid-recording, race between the live preview and `derive()`/persistence) -- the value is
  // already visible via `datasetOverrides`, this only remembers it needs ONE retry once
  // `persistedScenarioIds` confirms THIS scenarioId specifically. Never a sensitive value (see
  // `handleDatasetBlur`'s own gate below): a secret is never queued here. Carries its own
  // `recordingId` so a retry triggered by a LATER recording's persisted authority can never
  // replay an edit that belongs to an earlier, unrelated recording/scenario.
  const [pendingScenarioSaves, setPendingScenarioSaves] = useState<Record<string, { recordingId: string; scenarioId: string; valueKey: string; value: string }>>({});
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>();
  const [datasetOverrides, setDatasetOverrides] = useState<Record<string, Record<string, string>>>({});
  const [publishResult, setPublishResult] = useState<string | null>(null);
  // Structured hand-off to the dedicated TestRail destination screen — carries exactly the
  // scenarios/overrides the user had selected, never a label or a re-derived query. `null`
  // means "stay on the Recording screen"; going back just clears it, so nothing here is lost.
  const [testRailUpload, setTestRailUpload] = useState<{
    scenarios: RecordedScenario[];
    dataOverrides: Record<string, Record<number, string>>;
    datasetValues: Record<string, string | undefined>;
  } | null>(null);

  const session = useRecordingSession(projectSlug);
  const execution = useRecordingExecution();
  const testRail = useTestRailDestination(projectDetail?.testRail);
  const project = projects.find((p) => p.slug === projectSlug);
  const primaryScenario = session.scenarios.find((scenario) => scenario.primary) ?? session.scenarios[0];
  const suggestionScenarios = primaryScenario
    ? session.scenarios.filter((scenario) => scenario.scenarioId !== primaryScenario.scenarioId)
    : [];
  const selectedScenarios = useMemo(
    () => session.scenarios.filter((s) => selected[s.scenarioId]),
    [session.scenarios, selected],
  );
  const executionScenarios = useMemo(
    () => session.scenarios.filter((s) => executionSelected[s.scenarioId]),
    [session.scenarios, executionSelected],
  );
  const sharedDatasetValues = useMemo(
    (): Record<string, string | undefined> => {
      const confirmedDatasets: Record<string, string | undefined> = {};
      for (const dataset of session.semanticModel?.datasets ?? []) {
        if (/^entity[_-]\d+\./i.test(dataset.valueKey)) continue;
        if (typeof dataset.value === 'string') confirmedDatasets[dataset.valueKey] = dataset.value;
      }
      return confirmedDatasets;
    },
    [session.semanticModel],
  );
  const scenarioDatasetValues = useMemo(() => {
    const result = new Map<string, Record<string, string | undefined>>();
    for (const scenario of session.scenarios) {
      const values = { ...sharedDatasetValues };
      for (const requirement of runtimeRequirementsForScenario(scenario)) {
        if (typeof requirement.value === 'string') values[requirement.valueKey] = requirement.value;
      }
      for (const [key, value] of Object.entries(datasetOverrides[scenario.scenarioId] ?? {})) {
        if (runtimeRequirementsForScenario(scenario).some((requirement) => requirement.valueKey === key)) values[key] = value;
      }
      result.set(scenario.scenarioId, values);
    }
    return result;
  }, [session.scenarios, sharedDatasetValues, datasetOverrides]);
  const activeScenario = session.scenarios.find((scenario) => scenario.scenarioId === activeScenarioId) ?? primaryScenario;
  const currentDatasetValues = activeScenario ? scenarioDatasetValues.get(activeScenario.scenarioId) ?? sharedDatasetValues : sharedDatasetValues;
  const selectedReadiness = useMemo(
    () => selectedScenarios.map((scenario) => ({ scenario, readiness: resolveScenarioReadiness(scenario, scenarioDatasetValues.get(scenario.scenarioId) ?? sharedDatasetValues) })),
    [selectedScenarios, scenarioDatasetValues, sharedDatasetValues],
  );
  const selectedMissingInputs = useMemo(
    () => selectedReadiness.flatMap(({ scenario, readiness }) => readiness.missingInputs.map((input) => ({ ...input, scenarioId: scenario.scenarioId }))),
    [selectedReadiness],
  );
  const readySelectedReadiness = useMemo(() => selectedReadiness.filter(({ readiness }) => readiness.publicationReadiness), [selectedReadiness]);
  const blockedSelectedReadiness = useMemo(() => selectedReadiness.filter(({ readiness }) => !readiness.publicationReadiness), [selectedReadiness]);
  const reviewSelectedCount = blockedSelectedReadiness.filter(({ readiness }) => !readiness.oracleReadiness && readiness.missingInputs.length === 0).length;
  const dataBlockedSelectedCount = blockedSelectedReadiness.filter(({ readiness }) => readiness.missingInputs.length > 0).length;
  // `executionReadiness` alone says the recorded ACTIONS can technically be attempted -- it says
  // nothing about whether THIS scenarioId has actually been written to the backend's persisted
  // store yet. A scenario still shown from the live/unpersisted preview (visible before
  // "Generar escenarios" ever ran, or before its response applied) can be `executionReadiness:
  // true` while `loadScenarios(...)` on the backend is still empty for it -- sending it to
  // `POST /execute` in that state is exactly what produces `409 SCENARIO_NOT_READY`. Replay must
  // never substitute scenario visibility, `session.scenarios.length`, recording-stopped status,
  // or TestRail publication readiness for this: the only authority is
  // `session.persistedScenarioIds`, populated exclusively from `derive()`'s own response and
  // `GET .../scenarios` (the persisted store itself).
  const executionReadinessForSelection = useMemo(
    () => executionScenarios.map((scenario) => {
      const readiness = resolveScenarioReadiness(scenario, scenarioDatasetValues.get(scenario.scenarioId) ?? sharedDatasetValues);
      const scenarioPersisted = session.persistedScenarioIds?.has(scenario.scenarioId) ?? false;
      return { scenario, readiness, scenarioPersisted, executable: canReplayScenario({ executionReadiness: readiness.executionReadiness, scenarioPersisted }) };
    }),
    [executionScenarios, scenarioDatasetValues, sharedDatasetValues, session.persistedScenarioIds],
  );
  const executionReadyCount = executionReadinessForSelection.filter(({ executable }) => executable).length;
  const executionBlocked = isExecutionSelectionBlocked(
    executionReadinessForSelection.map(({ readiness, scenarioPersisted }) => ({ executionReadiness: readiness.executionReadiness, scenarioPersisted })),
  );
  const executionBlockReasons = useMemo(() => executionReadinessForSelection.flatMap(({ scenario, readiness, scenarioPersisted }) => {
    const reasons: string[] = [];
    if (readiness.missingInputs.length > 0) reasons.push(`${scenario.title}: faltan ${readiness.missingInputs.length} datos`);
    // A `runtime_resolution_required` action already lets `executionReadiness` through (the
    // runtime will attempt live structural resolution) -- only surface this as a BLOCKING
    // reason when it is actually why the scenario isn't executable, never merely because
    // technical certification is honestly incomplete.
    if (!readiness.technicalReadiness && !readiness.executionReadiness) reasons.push(`${scenario.title}: falta cobertura técnica para una acción ejecutable`);
    if (readiness.executionReadiness && !scenarioPersisted) reasons.push(`${scenario.title}: escenario pendiente de materialización`);
    if (scenario.stateSequenceValid === false) reasons.push(`${scenario.title}: secuencia de estados incompatible`);
    if (scenario.mutationDiagnostics?.rejectionReason === 'MUTATION_NO_EFFECT') reasons.push(`${scenario.title}: la variante no cambia el recorrido`);
    return reasons;
  }), [executionReadinessForSelection]);
  const semanticLifecycleBlocked = Boolean(executionScenarios.length > 0 && session.lifecycle && !session.lifecycle.semanticReady);
  const executionBlockedWithLifecycle = executionBlocked || semanticLifecycleBlocked;
  const executionBlockReasonsWithLifecycle = semanticLifecycleBlocked
    ? [...executionBlockReasons, 'La base semántica de la grabación todavía no está lista']
    : executionBlockReasons;
  const effectiveDataOverrides = useMemo(() => {
    const result: Record<string, Record<number, string>> = {};
    for (const scenario of session.scenarios) {
      const values: Record<number, string> = {};
      for (const field of scenario.requiredData) {
        const value = scenarioDatasetValues.get(scenario.scenarioId)?.[field.key];
        if (value !== undefined) values[field.stepIndex] = value;
      }
      result[scenario.scenarioId] = values;
    }
    return result;
  }, [session.scenarios, scenarioDatasetValues]);
  const sensitiveDatasetKeys = useMemo(
    () => new Set((session.semanticModel?.datasets ?? []).filter((dataset) => dataset.sensitive).map((dataset) => dataset.valueKey)),
    [session.semanticModel],
  );
  const allowSensitiveMaterialization = session.semanticModel?.recordingDataPolicy.persistQaCredentials === true;

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

  // Keep the reviewer's selection stable while scenario values are refreshed. The previous
  // implementation rebuilt it from the primary scenario on every refresh, collapsing N -> 1.
  const selectionRecordingRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const primaryId = session.scenarios.find((scenario) => scenario.primary)?.scenarioId ?? session.scenarios[0]?.scenarioId;
    const recordingChanged = selectionRecordingRef.current !== session.recordingId;
    const ids = new Set(session.scenarios.map((scenario) => scenario.scenarioId));
    const preserveSelection = (previous: Record<string, boolean>) => {
      const retained = Object.fromEntries(Object.entries(previous).filter(([scenarioId, value]) => value && ids.has(scenarioId)));
      return Object.keys(retained).length > 0 ? retained : primaryId ? { [primaryId]: true } : {};
    };
    if (recordingChanged) {
      setSelected(primaryId ? { [primaryId]: true } : {});
      setExecutionSelected(primaryId ? { [primaryId]: true } : {});
      setDatasetOverrides({});
      setPublishResult(null);
      // A pending save queued under a DIFFERENT recording must never retry against this one
      // (see `pendingScenarioSaves`'s own `recordingId` guard in the retry effect below).
      setPendingScenarioSaves({});
    } else {
      setSelected(preserveSelection);
      setExecutionSelected(preserveSelection);
    }
    setActiveScenarioId((previous) => previous && ids.has(previous) ? previous : primaryId);
    selectionRecordingRef.current = session.recordingId;
  }, [session.scenarios, session.recordingId]);

  // TEMPORARY DIAGNOSTIC (this ticket only): traces whether section 3 ("Escenarios") is visible
  // right after the scenario list/recording identity actually changes -- no dataset value or
  // secret is logged, only ids/counts/booleans.
  useEffect(() => {
    console.info('[recording-history-render]', {
      recordingId: session.recordingId,
      sessionRecordingId: session.recordingId,
      scenarioCount: session.scenarios.length,
      hasNarrative: Boolean(session.narrative),
      hasSemantic: Boolean(session.semanticModel),
      sectionVisible: session.scenarios.length > 0 && session.phase !== 'recording',
    });
  }, [session.recordingId, session.scenarios, session.narrative, session.semanticModel, session.phase]);

  const isRecording = session.phase === 'recording' || session.phase === 'starting';
  const busy = session.phase === 'starting' || session.phase === 'stopping' || session.phase === 'deriving';

  /**
   * "Reproducir y subir a TestRail".
   *
   * Deliberately its own handler, next to the mobile one rather than merged with it: the two
   * share the selection and nothing else — different transport, different failure modes.
   *
   * It does not execute anything itself anymore — picking the TestRail destination is a
   * decision made on its own screen now, not inline here, so this only hands off the
   * already-selected scenarios and overrides and navigates there.
   */
  function handleReplay() {
    if (!projectSlug || !session.recordingId || executionScenarios.length === 0) return;
    if (executionBlockedWithLifecycle) return;
    const selectedIds = executionScenarios.map((scenario) => scenario.scenarioId);
    console.info(`[recording:execute] handlerSelectedIds=${JSON.stringify(selectedIds)} handlerSelectedCount=${selectedIds.length} readyCount=${executionReadyCount}`);
    setTestRailUpload({
      scenarios: executionScenarios,
      dataOverrides: effectiveDataOverrides,
      datasetValues: currentDatasetValues,
    });
  }

  async function handleExecute() {
    if (!projectDetail || executionScenarios.length === 0) return;
    const executionReadiness = executionScenarios.map((scenario) => ({ scenario, readiness: resolveScenarioReadiness(scenario, scenarioDatasetValues.get(scenario.scenarioId) ?? sharedDatasetValues) }));
    if (executionReadiness.some(({ scenario, readiness }) => !canReplayScenario({
      executionReadiness: readiness.executionReadiness,
      scenarioPersisted: session.persistedScenarioIds?.has(scenario.scenarioId) ?? false,
    }))) return;
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
    const launch = await execution.execute(target, executionScenarios, effectiveDataOverrides);
    if (!launch) return;
    onLaunch?.({
      id: launch.jobId,
      jobId: launch.jobId,
      recordingId: session.recordingId,
      scenarioIds: executionScenarios.map((scenario) => scenario.scenarioId),
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

  function handleDatasetValueChange(scenarioId: string, valueKey: string, value: string) {
    setDatasetOverrides((previous) => ({
      ...previous,
      [scenarioId]: { ...(previous[scenarioId] ?? {}), [valueKey]: value },
    }));
    if (session.recordingId && projectSlug && (!sensitiveDatasetKeys.has(valueKey) || allowSensitiveMaterialization)) {
      const recordingId = session.recordingId;
      stageScenarioValueWrite({
        recordingId,
        scenarioId,
        valueKey,
        persist: () => persistScenarioValue(recordingId, scenarioId, valueKey, value),
      });
    }
  }

  /** Attempts one real PUT. Never throws -- reports whether it saved, hit the known transient
   *  not-ready race, or failed for another reason (in which case the caller's prior state is
   *  refreshed from the backend, never wiped locally). */
  async function persistScenarioValue(recordingId: string, scenarioId: string, valueKey: string, value: string): Promise<'saved' | 'not_ready' | 'failed'> {
    // TEMPORARY diagnostic instrumentation -- no dataset values logged, remove after root-cause
    // is confirmed on the next real run (see task: PASO 4).
    console.info('[scenario-value-network]', { recordingId, scenarioId, allowed: true });
    try {
      const result = await recordingsApi.updateScenarioValue(recordingId, projectSlug, scenarioId, valueKey, value);
      session.setScenarios(session.scenarios.map((scenario) => scenario.scenarioId === scenarioId ? result.scenario : scenario));
      return 'saved';
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'SCENARIO_NOT_READY') return 'not_ready';
      setPublishResult(error instanceof Error ? error.message : 'No se pudo guardar la actualización de Recording; el servidor conserva el estado anterior.');
      const refreshed = await recordingsApi.scenarios(recordingId, projectSlug).catch(() => null);
      if (refreshed?.scenarios) session.setScenarios(refreshed.scenarios);
      return 'failed';
    }
  }

  async function handleDatasetBlur(scenarioId: string, valueKey: string, editedValue?: string) {
    if (!session.recordingId || !projectSlug) return;
    const value = editedValue ?? scenarioDatasetValues.get(scenarioId)?.[valueKey];
    if (value === undefined) return;

    const recordingId = session.recordingId;
    const scenarioPersisted = session.persistedScenarioIds?.has(scenarioId) ?? false;
    const decision = decideDatasetSaveAction({
      sensitive: sensitiveDatasetKeys.has(valueKey),
      allowSensitiveMaterialization,
      // PER-SCENARIO authority: THIS scenarioId specifically must be in the backend's own
      // persisted store -- a different scenario being persisted must never enable this one.
      scenarioPersisted,
    });
    // TEMPORARY diagnostic instrumentation -- no dataset values logged, remove after root-cause
    // is confirmed on the next real run (see task: PASO 4).
    console.info('[scenario-value-authority]', {
      recordingId,
      scenarioId,
      persistedIds: [...(session.persistedScenarioIds ?? [])],
      scenarioPersisted,
      scenariosReady: session.lifecycle?.scenariosReady ?? false,
      decision,
      source: 'blur',
    });

    if (decision === 'skip_sensitive') return;

    if (decision === 'queue_not_ready') {
      // The backend has not materialized this scenario yet (still mid-recording, before
      // derive()/persist) -- attempting the PUT now would only reproduce the known
      // SCENARIO_NOT_READY race. Queue it; the effect below retries it ONCE, as soon as
      // `persistedScenarioIds` confirms this exact scenarioId under this exact recordingId.
      setPendingScenarioSaves((prev) => ({ ...prev, [`${scenarioId}:${valueKey}`]: { recordingId, scenarioId, valueKey, value } }));
      return;
    }

    const flush = await flushScenarioValueWrites(recordingId);
    const outcome = flush.persistFailedCount === 0 ? 'saved' : 'failed';
    if (outcome === 'saved') setPublishResult(null);
    else if (outcome === 'not_ready') {
      setPendingScenarioSaves((prev) => ({ ...prev, [`${scenarioId}:${valueKey}`]: { recordingId, scenarioId, valueKey, value } }));
    }
  }

  // Retries a pending dataset save EXACTLY once as soon as the backend confirms THIS scenarioId
  // specifically is persisted (never a global "some scenario is ready" flag, and never a loop):
  // only entries whose own `recordingId` still matches the CURRENT recording and whose
  // `scenarioId` is actually in `persistedScenarioIds` are retried and cleared; anything else is
  // left queued (same recording, still not persisted) or simply dropped (a stale recording that
  // is no longer current -- the user's next edit there would queue a fresh attempt anyway).
  const persistedScenarioIdsKey = [...(session.persistedScenarioIds ?? [])].sort().join(',');
  useEffect(() => {
    const recordingId = session.recordingId;
    if (!recordingId) return;
    const persistedIds = session.persistedScenarioIds;
    const readyEntries = Object.entries(pendingScenarioSaves).filter(
      ([, pending]) => pending.recordingId === recordingId && persistedIds?.has(pending.scenarioId),
    );
    if (readyEntries.length === 0) return;
    // TEMPORARY diagnostic instrumentation -- no dataset values logged, remove after root-cause
    // is confirmed on the next real run (see task: PASO 4).
    for (const [, pending] of readyEntries) {
      console.info('[scenario-value-authority]', {
        recordingId,
        scenarioId: pending.scenarioId,
        persistedIds: [...(persistedIds ?? [])],
        scenarioPersisted: true,
        scenariosReady: session.lifecycle?.scenariosReady ?? false,
        decision: 'attempt',
        source: 'retry',
      });
    }
    setPendingScenarioSaves((prev) => {
      const next = { ...prev };
      for (const [key] of readyEntries) delete next[key];
      return next;
    });
    void (async () => {
      await flushScenarioValueWrites(recordingId, [...new Set(readyEntries.map(([, pending]) => pending.scenarioId))]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedScenarioIdsKey, session.recordingId]);

  if (testRailUpload && session.recordingId) {
    return (
      <TestRailUploadScreen
        recordingId={session.recordingId}
        projectSlug={projectSlug}
        projectDetail={projectDetail}
        scenarios={testRailUpload.scenarios}
        dataOverrides={testRailUpload.dataOverrides}
        datasetValues={testRailUpload.datasetValues}
        onBack={() => setTestRailUpload(null)}
        onLaunch={onLaunch}
      />
    );
  }

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
              disabled={!projectSlug || busy || label.trim().length === 0}
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
        {!isRecording && label.trim().length === 0 && projectSlug && (
          <p className="mt-2 text-[11px] text-[#B4463C]">Define el objetivo de la grabación para poder iniciar y generar escenarios.</p>
        )}

        {session.phase === 'recording' && (
          <div className="mt-4 rounded-xl border border-[#48A157]/30 bg-[#F3F9F4] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#48A157] animate-pulse" />
              <span className="text-[12px] font-semibold text-[#1a1f2e]">
                Grabando — {project?.type === 'mobile' ? 'usa la app en el emulador' : 'usa el navegador que se abrió'}
              </span>
            </div>
            <div className="flex gap-4">
              <Stat label="Eventos capturados" value={session.live?.events ?? 0} />
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
            {session.semanticModel && (
              <div className="mt-3 rounded-lg border border-[#E3EAF2] bg-white/70 p-3">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[#104B99] font-semibold">Objetivo</div>
                <div className="text-[12px] font-medium text-[#1a1f2e] mt-1">
                  {session.semanticModel.recordingGoal?.declaredGoal ?? session.summary?.recordingGoal ?? 'No declarado'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-[#104B99] font-semibold mt-3">Escenario principal · observado · en progreso</div>
                <div className="text-[12px] text-[#1a1f2e] mt-1">{session.scenarios[0]?.title ?? session.semanticModel.primaryScenario?.title ?? 'Recorrido observado'}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#58646D]">
                  <span>{session.scenarios[0]?.testRailSteps.length ?? session.semanticModel.semanticEvents.length} pasos capturados</span>
                  <span>{session.semanticModel.datasets.length} datos confirmados</span>
                  <span>{session.semanticModel.technicalObservations.length} observaciones técnicas</span>
                  <span>Sugerencias relevantes: {session.semanticModel.scenarioSuggestions.length}</span>
                </div>
                {session.scenarios.slice(1).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[#58646D] font-semibold">Sugerencias durante el recorrido</div>
                    {session.scenarios.slice(1).map((suggestion) => (
                      <div key={suggestion.scenarioId} className="rounded border border-[#E3EAF2] bg-white px-2 py-1.5 text-[11px] text-[#1a1f2e]">
                        <div className="font-medium">{suggestion.title}</div>
                        <div className="text-[10px] text-[#58646D]">{suggestion.suggestionCategory ?? 'DERIVED_ALTERNATIVE'} · relevancia {Math.round((suggestion.goalRelevanceScore ?? 0) * 100)}% · {suggestion.testRailSteps.length} pasos</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {canShowScenarioGenerationPanel(session.phase) && (
          <div className="mt-4 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] p-4">
            {session.summary && (
              <div className="flex gap-4 mb-3">
                  <Stat label="Acciones funcionales" value={primaryScenario ? scenarioMetrics(primaryScenario).functionalActionCount : session.summary.actionCount} />
                <Stat label="Pantallas" value={session.summary.screenCount} />
                <Stat label="Duración" value={formatDuration(session.summary.durationMs)} />
              </div>
            )}
            <button
              onClick={() => session.derive(label.trim() || undefined)}
              disabled={busy || !session.recordingId}
              className="bg-[#104B99] hover:bg-[#0d3d7d] text-white text-[12px] font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition"
            >
              <Sparkles size={13} />
              {session.phase === 'derived' ? 'Generar escenarios nuevamente' : 'Generar escenarios'}
            </button>
            {session.phase === 'derived' && session.derivation && (
              <div aria-live="polite" data-testid="scenario-generation-result" className="mt-3 rounded-lg border border-[#CFE7D2] bg-[#F3F9F4] px-3 py-2 text-[11px] text-[#34773D]">
                {derivationFeedback(session.derivation)} · versión {session.derivation.version}
              </div>
            )}
          </div>
        )}

        {session.phase === 'deriving' && (
          <div aria-live="polite" data-testid="scenario-generation-loading" className="mt-4 flex items-center gap-2 text-[12px] text-[#58646D]">
            <Loader2 size={14} className="animate-spin" />
            Generando escenarios…
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
      {session.scenarios.length > 0 && session.phase !== 'recording' && (
        <section className="bg-white rounded-2xl border border-[#E8EBEC] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#1a1f2e] text-white text-[10px] font-semibold flex items-center justify-center">
                3
              </span>
              <h2 className="text-[13px] font-semibold text-[#1a1f2e]">
                Escenarios
              </h2>
            </div>
            <div className="hidden text-[10px] text-[#58646D]">
              TestRail: seleccionados={selectedScenarios.length} · listos={selectedReadiness.filter(({ readiness }) => readiness.publicationReadiness).length} · bloqueados={selectedReadiness.filter(({ readiness }) => !readiness.publicationReadiness).length}
            </div>
            <div className="text-[10px] text-[#58646D]">
              TestRail: seleccionados={selectedScenarios.length} · listos={readySelectedReadiness.length} · requieren datos={dataBlockedSelectedCount} · requieren revisión={reviewSelectedCount}
            </div>
            <div className="text-[10px] text-[#58646D]">
              Ejecución: seleccionados={executionScenarios.length} · listos={executionReadyCount} · bloqueados={executionScenarios.length - executionReadyCount}
            </div>
            {selectedScenarios.length > 0 && readySelectedReadiness.length === 0 && (
              <div className="text-[10px] text-[#B4463C]">Sin publicación disponible: {blockedSelectedReadiness.map(({ scenario, readiness }) => `${scenario.title}: ${readiness.missingInputs.length > 0 ? `faltan ${readiness.missingInputs.length} datos` : 'contenido pendiente'}`).join(' · ')}</div>
            )}
            <div className="flex items-center gap-2">
              {projectDetail?.type === 'mobile' && (
                <button
                  onClick={handleExecute}
                  disabled={execution.running || executionScenarios.length === 0 || executionBlockedWithLifecycle}
                  title={
                    executionBlockedWithLifecycle
                      ? 'Completa los requisitos de ejecución antes de ejecutar'
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
                  disabled={executionScenarios.length === 0 || executionBlockedWithLifecycle}
                  title={
                    executionBlockedWithLifecycle
                      ? 'Completa los requisitos de ejecución antes de reproducir'
                      : 'Elige el destino en TestRail y ejecuta el recorrido'
                  }
                  className="bg-[#1a1f2e] hover:bg-black disabled:opacity-40 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition"
                >
                  <Play size={13} />
                  Reproducir y subir a TestRail
                </button>
              )}
            </div>
          </div>

          {projectDetail?.type === 'web' && executionBlockedWithLifecycle && executionScenarios.length > 0 && (
            <div role="status" className="mb-3 rounded-lg border border-[#F0C7C3] bg-[#FDF0EF] px-3 py-2 text-[11px] text-[#8E332C]">
              <div className="font-semibold">Reproducción no disponible</div>
              <ul className="mt-1 list-disc pl-4">
                {executionBlockReasonsWithLifecycle.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}

          {session.semanticModel && (
            <div className="mb-3 rounded-lg bg-[#F6F9FC] border border-[#E3EAF2] px-3 py-2 text-[11px] text-[#58646D]">
              <div className="flex items-center gap-2 font-medium text-[#1a1f2e]">
                <CheckCircle2 size={13} className="text-[#48A157]" />
                Base semántica lista para revisión
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>Objetivo: {session.semanticModel.recordingGoal?.declaredGoal ?? session.summary?.recordingGoal ?? 'no declarado'}</span>
                <span>{session.semanticModel.datasets.length} datos confirmados</span>
                <span>{session.semanticModel.semanticComponents.length} componentes</span>
                <span>{session.semanticModel.technicalObservations.length} observaciones técnicas</span>
              </div>
            </div>
          )}

          {false && blockedSelectedReadiness.length > 0 && (
            <div role="status" className="mb-3 rounded-lg border border-[#E8D9B5] bg-[#FFF9E9] px-3 py-2 text-[11px] text-[#765D22]">
              MCP puede ejecutarse exploratoriamente cuando esté listo, pero TestRail permanece bloqueado hasta resolver la política de oracle/revisión.
            </div>
          )}

          {session.semanticModel && (
            <TechnicalInspector model={session.semanticModel} />
          )}

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

          {primaryScenario && (
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#104B99] font-semibold mb-2">Escenario principal · observado</div>
              <ScenarioCard
                key={primaryScenario.scenarioId}
                scenario={primaryScenario}
                checked={Boolean(selected[primaryScenario.scenarioId])}
                onToggle={() => setSelected((prev) => ({ ...prev, [primaryScenario.scenarioId]: !prev[primaryScenario.scenarioId] }))}
                executionChecked={Boolean(executionSelected[primaryScenario.scenarioId])}
                onExecutionToggle={() => setExecutionSelected((prev) => ({ ...prev, [primaryScenario.scenarioId]: !prev[primaryScenario.scenarioId] }))}
                active={activeScenario?.scenarioId === primaryScenario.scenarioId}
                onActivate={() => setActiveScenarioId(primaryScenario.scenarioId)}
                expanded={Boolean(expandedScenarioIds[primaryScenario.scenarioId])}
                onToggleExpanded={() => setExpandedScenarioIds((prev) => ({ ...prev, [primaryScenario.scenarioId]: !prev[primaryScenario.scenarioId] }))}
                datasetValues={scenarioDatasetValues.get(primaryScenario.scenarioId) ?? sharedDatasetValues}
                onDatasetValueChange={(valueKey, value) => handleDatasetValueChange(primaryScenario.scenarioId, valueKey, value)}
                onDatasetBlur={(valueKey, value) => void handleDatasetBlur(primaryScenario.scenarioId, valueKey, value)}
                sensitiveDatasetKeys={sensitiveDatasetKeys}
                allowSensitiveMaterialization={allowSensitiveMaterialization}
              />
            </div>
          )}
          {suggestionScenarios.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#58646D] font-semibold">Sugerencias</div>
              {suggestionScenarios.map((s) => (
                <ScenarioCard
                  key={s.scenarioId}
                  scenario={s}
                  checked={Boolean(selected[s.scenarioId])}
                  onToggle={() => setSelected((prev) => ({ ...prev, [s.scenarioId]: !prev[s.scenarioId] }))}
                  executionChecked={Boolean(executionSelected[s.scenarioId])}
                  onExecutionToggle={() => setExecutionSelected((prev) => ({ ...prev, [s.scenarioId]: !prev[s.scenarioId] }))}
                  active={activeScenario?.scenarioId === s.scenarioId}
                  onActivate={() => setActiveScenarioId(s.scenarioId)}
                  expanded={Boolean(expandedScenarioIds[s.scenarioId])}
                  onToggleExpanded={() => setExpandedScenarioIds((prev) => ({ ...prev, [s.scenarioId]: !prev[s.scenarioId] }))}
                  datasetValues={scenarioDatasetValues.get(s.scenarioId) ?? sharedDatasetValues}
                  onDatasetValueChange={(valueKey, value) => handleDatasetValueChange(s.scenarioId, valueKey, value)}
                  onDatasetBlur={(valueKey, value) => void handleDatasetBlur(s.scenarioId, valueKey, value)}
                  sensitiveDatasetKeys={sensitiveDatasetKeys}
                  allowSensitiveMaterialization={allowSensitiveMaterialization}
                />
              ))}
            </div>
          )}

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

function scenarioMetrics(scenario: RecordedScenario) {
  const steps = scenario.testRailSteps;
  const setupIndexes = new Set(
    steps.map((step, index) => step.isSetup || (index === 0 && /^(abrir|navegar|launch)/i.test(step.content.trim())) ? index : -1)
      .filter((index) => index >= 0),
  );
  return {
    scenarioStepCount: scenario.scenarioStepCount ?? steps.length,
    functionalActionCount: scenario.functionalActionCount ?? steps.filter((step, index) => step.classification === 'FUNCTIONAL_ACTION' && !setupIndexes.has(index)).length,
    nonUserSetupSteps: scenario.nonUserSetupSteps ?? setupIndexes.size,
  };
}

function TechnicalInspector({ model }: { model: NonNullable<ReturnType<typeof useRecordingSession>['semanticModel']> }) {
  const editingSessions = model.editingSessions ?? [];
  const groupedTechnicalComponents = (() => {
    const observationsById = new Map(model.technicalObservations.map((observation) => [observation.observationId, observation]));
    const groups = new Map<string, { componentId: string; label: string; componentType: string; observations: typeof model.technicalObservations[number][] }>();
    const assignedObservationIds = new Set<string>();
    const components = model.semanticComponents.filter((component) => {
      // Generic role buckets are raw evidence, not StableComponentIdentity. Showing them as
      // cards re-mixes sibling controls that already have a field/container association.
      return !/:control:(?:input|button|textbox|control)$/i.test(component.componentId);
    }).sort((left, right) => {
      const score = (component: typeof left) => (component.compoundField ? 4 : 0)
        + (component.componentType === 'control' ? 0 : 2)
        + (component.componentId.includes(':control:') ? 0 : 1);
      return score(right) - score(left);
    });
    for (const component of components) {
      const observations = (component.observationRefs ?? [])
        .map((ref) => observationsById.get(ref))
        .filter((observation): observation is typeof model.technicalObservations[number] => Boolean(observation))
        .filter((observation) => !assignedObservationIds.has(observation.observationId));
      observations.forEach((observation) => assignedObservationIds.add(observation.observationId));
      if (observations.length === 0) continue;
      const anchor = observations[0];
      // Prefer the recorder's structural identity. This also repairs a stale semantic model
      // where selection/amount components were persisted separately before grouping existed.
      const stableIdentity = anchor?.gridRef && anchor.rowIdentity && anchor.cellRef
        ? `${anchor.gridRef}|${anchor.rowIdentity}|${anchor.cellRef}`
        : anchor?.rowIdentity && anchor.semanticField
          ? `${anchor.rowIdentity}|field:${anchor.semanticField}`
          : `component:${component.componentId}`;
      const existing = groups.get(stableIdentity);
      if (existing) {
        existing.observations = [...existing.observations, ...observations.filter((observation) => !existing.observations.some((item) => item.observationId === observation.observationId))];
        if (component.componentType.includes('compound') || component.compoundField) existing.componentType = 'compound_field';
      } else {
        groups.set(stableIdentity, {
          componentId: stableIdentity,
          label: component.label ?? anchor?.semanticField ?? component.componentId,
          componentType: component.compoundField ? 'compound_field' : component.componentType,
          observations,
        });
      }
    }
    const grouped = [...groups.values()];
    const groupedIds = new Set(grouped.flatMap((group) => group.observations.map((observation) => observation.observationId)));
    const ungrouped = model.technicalObservations.filter((observation) => !groupedIds.has(observation.observationId));
    if (ungrouped.length > 0) grouped.push({ componentId: 'unmatched-observations', label: 'Observaciones sin componente estable', componentType: 'OBSERVED_ONLY', observations: ungrouped });
    return grouped;
  })();
  const safeLabel = (observation: NonNullable<typeof model.technicalObservations>[number]) => {
    const sensitive = /password|clave|contrasena|contraseña|otp|token|pin|secret/i.test(
      `${observation.semanticField ?? ''} ${observation.label ?? ''} ${observation.role ?? ''}`,
    );
    return sensitive ? '[campo sensible]' : observation.semanticField ?? observation.label ?? 'campo pendiente';
  };
  const isSensitive = (observation: NonNullable<typeof model.technicalObservations>[number]) => /password|clave|contrasena|contraseña|otp|token|pin|secret/i.test(
    `${observation.semanticField ?? ''} ${observation.label ?? ''} ${observation.role ?? ''}`,
  );
  return (
    <details className="mb-3 rounded-lg border border-[#D9E2EC] bg-white text-[11px]">
      <summary className="cursor-pointer select-none px-3 py-2.5 font-medium text-[#1a1f2e]">
        Elementos técnicos detectados ({model.semanticComponents.length} componentes · {model.technicalObservations.length} observaciones)
      </summary>
      <div className="border-t border-[#E3EAF2] px-3 py-2.5">
        <p className="mb-2 text-[10px] text-[#58646D]">
          Panel de diagnóstico: conserva múltiples candidatos y confianza; no selecciona locators ni los convierte en autoridad de ejecución.
        </p>
        {model.gridMetadata && (
          <div className="mb-2 rounded border border-[#E3EAF2] bg-[#F6F9FC] px-2 py-1.5 text-[10px] text-[#58646D]">
            Grid runtime: {model.gridMetadata.detected ? 'detectado' : 'no detectado'} · {model.gridMetadata.grids ?? 0} grids · {model.gridMetadata.rows} filas · {model.gridMetadata.cells} celdas · {model.gridMetadata.headers.length} headers
          </div>
        )}
        {editingSessions.length > 0 && (
          <details className="mb-2 rounded border border-[#E3EAF2] bg-[#F6F9FC]">
            <summary className="cursor-pointer px-2 py-1.5 text-[#1a1f2e]">
              Sesiones de edición ({editingSessions.length})
            </summary>
            <div className="space-y-1 border-t border-[#E3EAF2] px-2 py-1.5">
              {editingSessions.map((session) => {
                const sensitive = /password|clave|contrasena|contraseña|otp|token|pin|secret/i.test(
                  `${session.semanticField ?? ''} ${session.controlIdentity}`,
                );
                const safeValue = (value?: string) => sensitive ? '[valor sensible]' : value ?? '—';
                return (
                  <div key={session.editingSessionId} className="rounded border border-[#E3EAF2] bg-white px-2 py-1.5">
                    <div className="font-medium text-[#1a1f2e]">
                      {sensitive ? '[campo sensible]' : session.semanticField ?? 'campo pendiente'} · {session.commitReason}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#58646D]">
                      raw: {session.rawEventRefs.length} eventos · intermedios: {session.intermediateValues.length} · inicial: {safeValue(session.initialValue)} · final: {safeValue(session.finalValue ?? session.committedValue ?? session.inputValue)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#58646D]">
                      input: {safeValue(session.inputValue)} · committed: {safeValue(session.committedValue)} · display: {safeValue(session.displayValue)}
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[10px] text-[#8B999D]">
                      control: {session.controlIdentity} · refs: {session.technicalTargetRefs.join(' · ') || '—'}
                    </div>
                    {session.needsReview && (
                      <div className="mt-0.5 text-[10px] text-[#B4463C]">revisión: {session.reviewReason ?? 'evidencia técnica incompleta'}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}
        <div className="space-y-1.5">
          {groupedTechnicalComponents.map((group) => (
            <details key={group.componentId} className="rounded border border-[#D9E2EC] bg-[#F6F9FC]">
              <summary className="cursor-pointer px-2 py-1.5 text-[#1a1f2e]">
                <span className="font-medium">{group.label}</span>
                <span className="ml-2 text-[10px] text-[#58646D]">{group.componentType} · {group.observations.length} observaciones</span>
              </summary>
               <div className="space-y-1 border-t border-[#E3EAF2] px-2 py-1.5">
               {(() => {
                 const sessionIds = [...new Set(group.observations.map((observation) => observation.editingSessionRef).filter(Boolean))] as string[];
                 const candidateTargets = [...new Set(group.observations.flatMap((observation) => observation.locatorCandidates.map((candidate) => `${candidate.strategy}=${candidate.value}`)))];
                 const lifecycle = [...new Set(group.observations.flatMap((observation) => [observation.editorLifecycle, ...(observation.stateTransitions ?? [])].filter(Boolean)))];
                 return (
                   <div className="mb-1 rounded border border-[#E3EAF2] bg-white px-2 py-1.5 text-[10px] text-[#58646D]">
                     <div>StableComponentIdentity: <span className="font-mono text-[#1a1f2e]">{group.componentId}</span></div>
                     <div>editingSessions[]: {sessionIds.length > 0 ? sessionIds.join(', ') : 'ninguna'}</div>
                     <div>candidateTargets[]: {candidateTargets.length > 0 ? candidateTargets.join(' · ') : 'ninguno'}</div>
                     <div>lifecycle[]: {lifecycle.length > 0 ? lifecycle.join(' · ') : 'ninguno'}</div>
                   </div>
                 );
               })()}
               {group.observations.map((observation) => (
            <details key={observation.observationId} className="rounded border border-[#E3EAF2] bg-[#FAFAF7]">
              <summary className="cursor-pointer px-2 py-1.5 text-[#1a1f2e]">
                <span className="font-medium">{safeLabel(observation)}</span>
                <span className="ml-2 text-[10px] text-[#58646D]">
                  {observation.componentType} · {observation.role ?? 'sin role'} · {observation.locatorCandidates.length} candidates · confianza {Math.round((observation.confidence ?? observation.locatorCandidates[0]?.confidence ?? 0) * 100)}%
                </span>
              </summary>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-[#E3EAF2] px-2 py-1.5 text-[10px] text-[#58646D] sm:grid-cols-2">
                {(() => {
                  const safeEvidence = (value?: string) => isSensitive(observation) ? '[valor sensible]' : value ?? '—';
                  return (
                    <>
                      <span>editing session: {observation.editingSessionRef ?? '—'}</span>
                      <span>input/committed/display: {safeEvidence(observation.inputValue)} · {safeEvidence(observation.committedValue)} · {safeEvidence(observation.displayValue)}</span>
                    </>
                  );
                })()}
                <span>status: {observation.status}</span>
                <span>raw label: {isSensitive(observation) ? '[campo sensible]' : observation.label ?? '—'}</span>
                <span>placeholder/format: {isSensitive(observation) ? '[campo sensible]' : [observation.placeholder, observation.formatHint].filter(Boolean).join(' · ') || '—'}</span>
                <span>needsReview: {observation.needsReview ? 'sí' : 'no'}</span>
                <span>container: {observation.containerContext ?? '—'}</span>
                <span>container identity: {observation.containerIdentity ?? '—'}</span>
                <span>grid: {observation.gridRef ?? '—'}</span>
                <span>row: {observation.rowIdentity ?? '—'}</span>
                <span>cell: {observation.cellRef ?? '—'}</span>
                <span>column: {observation.columnIdentity ?? '—'}</span>
                <span>header: {observation.headerRef ?? observation.headerContext ?? '—'}</span>
                <span>validatedByInteraction: {observation.validatedByInteraction ? 'sí' : 'no'}</span>
                <span>lifecycle: {observation.editorLifecycle ?? 'estático/no observado'}</span>
                <span>before/after: {observation.beforeValue !== undefined || observation.afterValue !== undefined ? 'disponible' : 'no disponible'}</span>
                <span>options: {observation.observedOptions?.length ?? 0}</span>
                <span>technical ref: {observation.technicalTargetRef}</span>
                <div className="sm:col-span-2">
                  candidates: {observation.locatorCandidates.map((candidate) => `${candidate.strategy}=${candidate.value}`).join(' · ') || 'ninguno'}
                </div>
                <div className="sm:col-span-2">
                  attributes: {isSensitive(observation) ? '[campo sensible]' : Object.entries(observation.attributes ?? {}).map(([key, value]) => `${key}=${value}`).join(' · ') || 'ninguno'}
                </div>
                {observation.stateTransitions && observation.stateTransitions.length > 0 && (
                  <div className="sm:col-span-2">transiciones: {observation.stateTransitions.join(' · ')}</div>
                )}
                {observation.dynamicLifecycle && (
                  <div className="sm:col-span-2">
                    ciclo dinámico: {observation.dynamicLifecycle.options?.length ?? 0} opciones · ventana {observation.dynamicLifecycle.observationWindowMs ?? '—'}ms
                    {observation.dynamicLifecycle.selectedOption ? ` · selección: ${observation.dynamicLifecycle.selectedOption}` : ''}
                    {observation.dynamicLifecycle.mutationSummary?.length ? ` · mutaciones: ${observation.dynamicLifecycle.mutationSummary.join(', ')}` : ''}
                  </div>
                )}
              </div>
            </details>
          ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </details>
  );
}

function humanEntityScopeLabel(scope: string): string {
  const ordinal = scope.match(/(?:entity|entidad)[_-]?(\d+)$/i)?.[1];
  return ordinal ? `Entidad ${ordinal}` : scope.replace(/[_-]+/g, ' ');
}

function humanRequirementLabel(requirement: { semanticField: string | null; valueKey: string; valueRoleLabel?: string; humanLabel?: string }): string {
  if (requirement.humanLabel?.trim()) return requirement.humanLabel.trim();
  const field = requirement.semanticField?.trim();
  if (field) {
    if (requirement.valueRoleLabel?.trim()) return `${field} · ${requirement.valueRoleLabel.trim()}`;
    if (/_seleccion$/i.test(requirement.valueKey)) return `${field} · Selección`;
    if (/_valor$/i.test(requirement.valueKey)) return `${field} · Valor`;
    return field;
  }
  const fallback = requirement.valueKey.split('.').at(-1) ?? requirement.valueKey;
  return fallback.replace(/_(seleccion|valor)$/i, '').replace(/[_-]+/g, ' ');
}

function requirementConstraintDescription(requirement: { constraints?: Array<{ type: string; uniqueWithinCollection?: boolean }> }): string | undefined {
  const unique = (requirement.constraints ?? []).some((constraint) => {
    const normalized = String(constraint.type ?? '').trim().toLocaleLowerCase().replace(/[\s-]/g, '_');
    return constraint.uniqueWithinCollection === true || normalized === 'unique_within_collection' || normalized === 'uniquewithincollection' || normalized === 'distinct_within_collection';
  });
  return unique ? 'Debe ser diferente a los valores ya utilizados.' : undefined;
}

export function ScenarioCard({
  scenario,
  checked,
  onToggle,
  executionChecked,
  onExecutionToggle,
  active,
  onActivate,
  expanded,
  onToggleExpanded,
  datasetValues,
  onDatasetValueChange,
  onDatasetBlur,
  sensitiveDatasetKeys,
  allowSensitiveMaterialization,
}: {
  scenario: RecordedScenario;
  checked: boolean;
  onToggle: () => void;
  executionChecked: boolean;
  onExecutionToggle: () => void;
  active: boolean;
  onActivate: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  datasetValues: Record<string, string | undefined>;
  onDatasetValueChange: (valueKey: string, value: string) => void;
  onDatasetBlur: (valueKey: string, value: string) => void;
  sensitiveDatasetKeys: Set<string>;
  allowSensitiveMaterialization: boolean;
}) {
  const reviewDraft = '';
  const setReviewDraft = (_value: string) => undefined;
  const onReviewChange = (_status: 'PENDING' | 'APPROVED' | 'REJECTED', _expected: string) => undefined;
  const readiness = resolveScenarioReadiness(scenario, datasetValues);
  const renderStep = (step: RecordedScenarioStep) => {
    const value = step.valueKey ? datasetValues[step.valueKey] : undefined;
    const sensitive = step.sensitive === true || Boolean(step.valueKey && sensitiveDatasetKeys.has(step.valueKey));
    if (sensitive && !allowSensitiveMaterialization) return step.stepTemplate ?? step.content;
    if (step.valueKey && value !== undefined) {
      const template = step.stepTemplate ?? step.content;
      const rendered = template.split(`[${step.valueKey}]`).join(JSON.stringify(value));
      return step.stepNumber !== undefined ? rendered.replace(/^\s*\d+[.)]\s*/, '') : rendered;
    }
    const rendered = step.renderedStep ?? step.content;
    return step.stepNumber !== undefined ? rendered.replace(/^\s*\d+[.)]\s*/, '') : rendered;
  };
  const mutationType = undefined;
  const mutationDiagnostics = scenario.mutationDiagnostics;
  const metrics = scenarioMetrics(scenario);
  const datasetRequirements = runtimeRequirementsForScenario(scenario).filter((requirement) => requirement.valueRole !== 'runtime_derived_oracle');
  const datasetGroups = new Map<string, typeof datasetRequirements>();
  for (const requirement of datasetRequirements) {
    const group = requirement.entityScope ?? '__shared__';
    datasetGroups.set(group, [...(datasetGroups.get(group) ?? []), requirement]);
  }
  return (
    <div className={cn('rounded-xl border transition', active ? 'border-[#104B99] bg-[#FBFCFE]' : checked ? 'border-[#104B99]/40 bg-[#FBFCFE]' : 'border-[#E8EBEC]')}>
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5 flex flex-col gap-1 text-[9px] text-[#58646D]">
          <label className="flex items-center gap-1"><input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-[#104B99] cursor-pointer" /> TestRail</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={executionChecked} onChange={onExecutionToggle} className="w-3.5 h-3.5 accent-[#48A157] cursor-pointer" /> Ejecutar</label>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={onActivate} className="text-[13px] font-medium text-[#1a1f2e] text-left">{scenario.title}</button>
            {scenario.provenance === 'observed' && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EAF5FF] text-[#2877A8]">
                OBSERVADO
              </span>
            )}
            {scenario.provenance === 'derived' && scenario.suggestionCategory !== 'AI_PROPOSED' && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#F4F1EA] text-[#8A7B5C]">
                DERIVADO
              </span>
            )}
            {scenario.suggestionCategory === 'AI_PROPOSED' && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#F3EEFF] text-[#7656A6]">
                IA
              </span>
            )}
            {scenario.testRailCaseId && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#104B99]">
                TR C{scenario.testRailCaseId}
              </span>
            )}
            {scenario.scope === 'segment' && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#58646D]">
                Bloque
              </span>
            )}
            {scenario.hasUncertainSteps && (
              <span
                title={scenario.requiredData.find((field) => field.needsReview)?.reviewReason ?? 'technicalTargetLowConfidence'}
                className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FDF0EF] text-[#B4463C]"
              >
                REQUIERE REVISIÓN
              </span>
            )}
            <span className={cn(
              'text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded',
              readiness.executionReadiness ? 'bg-[#EAF5ED] text-[#34773D]' : 'bg-[#FDF0EF] text-[#B4463C]',
            )}>
              {readinessBadge(readiness)}
            </span>
          </div>
          <p className="text-[11.5px] text-[#58646D] mt-1 leading-snug">{scenario.description}</p>
          {scenario.provenance === 'derived' && scenario.rationale && (
            <div className="mt-2 rounded border border-[#E3D9F7] bg-[#FBF9FF] px-2 py-1.5 text-[10px] text-[#58646D]"><span className="font-semibold text-[#7656A6]">Objetivo de esta variante:</span> {scenario.rationale}</div>
          )}
          {(
            <div className="mt-1 text-[10px] text-[#58646D]">
              {metrics.scenarioStepCount} pasos · {metrics.functionalActionCount} acciones funcionales · {metrics.nonUserSetupSteps} setup/no usuario
              {scenario.reasonForDifference ? ` · ${scenario.reasonForDifference}` : ''}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-[#E3EAF2] bg-[#F8FAFC] px-2.5 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[#104B99] font-semibold">Datos de este escenario</div>
            {datasetRequirements.length === 0 ? (
              <div className="mt-1 text-[10.5px] text-[#58646D]">No requiere inputs de runtime propios.</div>
            ) : (
              <div className="mt-2 space-y-2.5">
                {[...datasetGroups.entries()].map(([scope, requirements]) => (
                  <div key={scope}>
                    <div className="text-[10px] font-semibold text-[#1a1f2e]">{scope === '__shared__' ? 'Datos comunes' : humanEntityScopeLabel(scope)}</div>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {requirements.map((requirement) => {
                        const value = datasetValues[requirement.valueKey] ?? '';
                        const disabled = !isQaOverridableRuntimeInput(requirement) || requirement.editable === false;
                        const constraintDescription = requirementConstraintDescription(requirement);
                        return (
                          <label key={requirement.valueKey} className="block">
                            <span className={cn('text-[10px]', !value.trim() ? 'text-[#B4463C]' : 'text-[#58646D]')}>
                              {humanRequirementLabel(requirement)}{requirement.required ? ' · Requerido' : ''}{requirement.sensitive ? ' · QA sensible' : ''}
                            </span>
                            {constraintDescription && <div className="mt-0.5 text-[9px] text-[#58646D]">{constraintDescription}</div>}
                            <div className="mt-0.5 font-mono break-all text-[9px] text-[#8B999D]" title={requirement.valueKey}>valueKey: {requirement.valueKey}</div>
                            {requirement.allowedValues && requirement.allowedValues.length > 0 ? (
                              <select
                                aria-label={humanRequirementLabel(requirement)}
                                value={value}
                                onChange={(event) => onDatasetValueChange(requirement.valueKey, event.target.value)}
                                onBlur={(event) => onDatasetBlur(requirement.valueKey, event.currentTarget.value)}
                                disabled={disabled}
                                className="mt-0.5 w-full px-2 py-1 rounded border border-[#D9E2EC] bg-white text-[11px] outline-none focus:border-[#104B99] disabled:bg-[#F3F4F6] disabled:text-[#8B999D]"
                              >
                                <option value="">Selecciona un valor observado</option>
                                {requirement.allowedValues.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            ) : (
                              <input
                                aria-label={humanRequirementLabel(requirement)}
                                type={requirement.sensitive || requirement.masked ? 'password' : 'text'}
                                value={value}
                                onChange={(event) => onDatasetValueChange(requirement.valueKey, event.target.value)}
                                onBlur={(event) => onDatasetBlur(requirement.valueKey, event.currentTarget.value)}
                                disabled={disabled}
                                placeholder={requirement.sensitive ? 'Valor seguro requerido' : 'Sin valor confirmado'}
                                className="mt-0.5 w-full px-2 py-1 rounded border border-[#D9E2EC] bg-white text-[11px] outline-none focus:border-[#104B99] disabled:bg-[#F3F4F6] disabled:text-[#8B999D]"
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {readiness.missingInputs.length > 0 && (
              <div className="mt-2 text-[10px] text-[#B4463C]">Faltan {readiness.missingInputs.length} datos; completa los campos marcados en esta card.</div>
            )}
          </div>
          {!readiness.dataReadiness && (
            <div className="mt-2 rounded border border-[#F0C7C3] bg-[#FDF0EF] px-2 py-1.5 text-[10px] text-[#8E332C]">
              Faltan: {readiness.missingInputs.map(missingInputLabel).join(', ')}
            </div>
          )}
          {mutationType && (
            <div className="mt-2 rounded border border-[#E3D9F7] bg-[#FBF9FF] px-2 py-1.5 text-[10px] text-[#58646D] space-y-0.5">
              <div><span className="font-semibold text-[#7656A6]">Objetivo de esta variante:</span> {mutationType} · {scenario.rationale ?? scenario.description}</div>
              {mutationDiagnostics && (
                <div><span className="font-semibold text-[#7656A6]">Cambios respecto al principal:</span> +{mutationDiagnostics.stepsAdded} acciones · -{mutationDiagnostics.stepsRemoved} acciones · {mutationDiagnostics.stepsReplaced} reemplazos · {mutationDiagnostics.valueKeysAdded.length} campos nuevos</div>
              )}
            </div>
          )}
          {scenario.suggestionCategory === 'AI_PROPOSED' && (
            <div className="mt-2 rounded border border-[#E3D9F7] bg-[#FBF9FF] px-2 py-1.5 text-[10px] text-[#58646D] space-y-0.5">
              <div><span className="font-semibold text-[#7656A6]">Tipo:</span> {scenario.kind === 'negative' ? 'validación / negativo' : 'alternativa de flujo'}</div>
              <div><span className="font-semibold text-[#7656A6]">Setup común:</span> {scenario.sharedSetupRef ?? 'no materializado'}</div>
              <div><span className="font-semibold text-[#7656A6]">Evidencia:</span> {scenario.sourceEventRefs?.join(', ') ?? 'no declarada'}</div>
              <div><span className="font-semibold text-[#7656A6]">Oráculo:</span> {scenario.oracleAuthority === 'review_required' ? 'requiere revisión' : 'observado'}</div>
              {scenario.quality && (
                <div className="text-[#B4463C]">Calidad: {scenario.quality.finalDecision === 'accepted' ? 'aceptada con revisión' : `rechazada · ${scenario.quality.rejectionReason ?? 'gate de evidencia'}`}</div>
              )}
            </div>
          )}
          {scenario.provenance === 'derived' && mutationDiagnostics && (
            <div className="mt-2 text-[10px] text-[#7656A6]">Cambios respecto al principal: +{mutationDiagnostics.stepsAdded} acciones · -{mutationDiagnostics.stepsRemoved} acciones · {mutationDiagnostics.valueKeysAdded.length} campos nuevos</div>
          )}
          {false && scenario.oracleAuthority === 'review_required' && (
            <div className="mt-2 rounded border border-[#E8D9B5] bg-[#FFF9E9] px-2 py-1.5 text-[10px] text-[#765D22]">
              <div className="font-semibold">Revisión del resultado esperado</div>
              <textarea aria-label="Resultado esperado revisado" value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} onBlur={() => onReviewChange('PENDING', reviewDraft)} className="mt-1 w-full rounded border border-[#D9E2EC] bg-white p-1.5 text-[11px]" placeholder="Resultado esperado o hipótesis a confirmar" />
              <button type="button" onClick={() => onReviewChange('APPROVED', reviewDraft)} className="mt-1 rounded-full bg-[#1a1f2e] px-2.5 py-1 text-[10px] font-semibold text-white">Aprobar revisión</button>
            </div>
          )}
          <button
            onClick={onToggleExpanded}
            className="text-[11px] font-medium text-[#104B99] mt-2"
          >
            {expanded ? 'Ocultar pasos' : `Ver ${scenario.testRailSteps.length} pasos`}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5">
          <div className="space-y-1.5 border-l-2 border-[#E8EBEC] pl-3 ml-1">
            {scenario.testRailSteps.map((step, i) => (
              <li key={`${scenario.scenarioId}-${step.stepNumber ?? i}`} className="text-[11.5px]">
                <div className="text-[#1a1f2e]">
                  <span className="text-[#8B999D] mr-1.5">{step.stepNumber ?? i + 1}.</span>
                  {renderStep(step)}
                </div>
                {step.expected.trim() && (
                  <div className="text-[#48A157] mt-0.5">→ {step.expected}</div>
                )}
              </li>
            ))}
          </div>
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
