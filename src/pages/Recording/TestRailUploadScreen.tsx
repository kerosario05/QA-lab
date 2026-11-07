import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, Loader2, Rocket } from 'lucide-react';
import { C } from '../../constants/theme';
import { RecordingStepper } from './RecordingStepper';
import { BentoCard } from '../../components/ui/BentoCard';
import type { RecordedScenario } from '../../services/recordings/types';
import type { ActiveRun } from '../../types';
import type { JiraIssue } from '../../services/jira/types';
import type { useTestRailDestination } from './useTestRailDestination';
import { recordingsApi } from '../../services/recordings';
import { TestRailDestinationPicker } from './TestRailDestinationPicker';
import { JiraRequirementPicker } from './JiraRequirementPicker';
import { useWebRecordingReplay } from './useWebRecordingReplay';
import { useRecordingExecution, type RecordingProjectDetail } from './useRecordingExecution';
import { groupScenariosByRecording } from './groupScenariosByRecording';
import { testRailSelectionKey } from './testRailSelection';

/**
 * Dedicated destination screen for a recording, web or mobile.
 *
 * Mobile goes through the same screen: the chosen section receives the published cases, the
 * Test Run is created from them, and the run uses the device picked when recording.
 *
 * Recording's own screen answers "what did I record and which of it is ready to run?" — this
 * one answers a different question, "where in TestRail does it land?", and the two stop being
 * the same decision the moment a recording can be re-run against more than one destination.
 * It never re-derives the recording or its scenarios: everything here is read-only context
 * carried over from the selection made on the Recording screen.
 *
 * Visually this reuses the language of the "¿De dónde vienen los casos?" step in TestLaunch
 * (BentoCard, step indicator, source cards, TestRail panel, nav footer) instead of being an
 * isolated small dialog — Recording and TestLaunch are the same product.
 *
 * "Ejecutar Automatización" sends every selected recording/scenario pair in one batch. The
 * backend resolves per scenario whether to reuse a fresh promoted spec or run discovery and
 * Auto-POM, then reports the batch through one job id.
 */

export interface TestRailUploadScreenProps {
  recordingId: string;
  projectSlug: string;
  projectDetail: RecordingProjectDetail | null;
  scenarios: RecordedScenario[];
  scenarioRecordingIds?: string[];
  scenarioDatasetValues?: Record<string, Record<string, string | undefined>>;
  scenarioSpecDatasetValues?: Record<string, Record<string, string | undefined>>;
  testRail: ReturnType<typeof useTestRailDestination>;
  selectedIssue: JiraIssue | null;
  onSelectIssue: (issue: JiraIssue | null) => void;
  dataOverrides: Record<string, Record<number, string>>;
  datasetValues: Record<string, string | undefined>;
  onBack: () => void;
  onLaunch?: (run: ActiveRun) => void;
  /** Mobile only: emulator or phone of the user's PC; null = the server's emulator. */
  deviceSerial?: string | null;
}

const EMPTY_RECORDING_IDS: string[] = [];

/** This screen is always past project, recording and scenario selection, mid TestRail setup. */
function StepIndicator() {
  return <RecordingStepper current="fuentes" />;
}

export function TestRailUploadScreen({
  projectSlug,
  projectDetail,
  scenarios,
  scenarioRecordingIds = EMPTY_RECORDING_IDS,
  scenarioDatasetValues = {},
  scenarioSpecDatasetValues = {},
  testRail,
  selectedIssue,
  onSelectIssue,
  dataOverrides,
  datasetValues,
  recordingId,
  onBack,
  onLaunch,
  deviceSerial = null,
}: TestRailUploadScreenProps) {
  const replay = useWebRecordingReplay();
  const mobileExecution = useRecordingExecution();
  const isMobile = projectDetail?.type === 'mobile';
  const [traceReadiness, setTraceReadiness] = useState<{ checking: boolean; error: string | null }>({ checking: true, error: null });

  const destinationReady = Boolean(testRail.destination.projectId && testRail.destination.suiteId && testRail.destination.sectionId);
  const recordingGroups = useMemo(
    () => groupScenariosByRecording(scenarios, scenarioRecordingIds, recordingId),
    [scenarios, scenarioRecordingIds, recordingId],
  );
  const selectedScenarios = useMemo(
    () => recordingGroups.flatMap((group) => group.scenarios.map((scenario) => ({ recordingId: group.recordingId, scenario }))),
    [recordingGroups],
  );
  const recordingSelectionKey = recordingGroups
    .map((group) => `${group.recordingId}:${group.scenarios.map((scenario) => scenario.scenarioId).sort().join(',')}`)
    .sort()
    .join('|');

  useEffect(() => {
    let current = true;
    setTraceReadiness({ checking: true, error: null });
    const checks = recordingGroups.map(async (group) => {
      const response = await recordingsApi.scenarios(group.recordingId, projectSlug);
      const lifecycle = response.lifecycle;
      if (!lifecycle?.recordingExists) return `La grabación ${group.recordingId} ya no existe en QA Lab. Vuelve a cargar una grabación disponible.`;
      if (!lifecycle.traceReady) return `La grabación ${group.recordingId} no tiene un trace detenido. Detén la grabación o vuelve a cargar los escenarios.`;
      if (!lifecycle.semanticReady) return `La base semántica de la grabación ${group.recordingId} todavía no está lista.`;
      if (!lifecycle.scenariosReady) return `La grabación ${group.recordingId} ya no tiene escenarios guardados.`;
      const persistedIds = new Set(response.scenarios.map((scenario) => scenario.scenarioId));
      const missingIds = group.scenarios.map((scenario) => scenario.scenarioId).filter((scenarioId) => !persistedIds.has(scenarioId));
      if (missingIds.length > 0) return `La grabación ${group.recordingId} ya no contiene todos los escenarios seleccionados. Vuelve a cargarlos.`;
      return null;
    });

    void Promise.allSettled(checks).then((results) => {
      if (!current) return;
      const error = results.map((result) => result.status === 'rejected'
        ? `No se pudo validar una de las grabaciones seleccionadas: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : result.value).find((message): message is string => Boolean(message)) ?? null;
      setTraceReadiness({ checking: false, error });
    });

    return () => { current = false; };
  }, [projectSlug, recordingSelectionKey, recordingGroups]);

  const canExecute = Boolean(recordingId) && recordingGroups.length > 0 && destinationReady && Boolean(selectedIssue?.key) && !traceReadiness.checking && !traceReadiness.error;
  const executionBlockedReason = !selectedIssue?.key
    ? 'Selecciona un caso o requerimiento de Jira'
    : !destinationReady
      ? 'Completa Proyecto y Sección de TestRail'
      : traceReadiness.checking
        ? 'Validando las grabaciones seleccionadas'
        : traceReadiness.error ?? undefined;
  const running = isMobile ? mobileExecution.running : replay.starting;
  const executionError = isMobile ? mobileExecution.error : replay.error;

  async function handleExecuteMobile() {
    if (!projectDetail) return;
    // Same keys as web: per recording/scenario first, then the bare scenario id.
    const overrides: Record<string, Record<number, string>> = {};
    recordingGroups.forEach((group) => group.scenarios.forEach((scenario) => {
      const selectionKey = testRailSelectionKey(group.recordingId, scenario.scenarioId);
      const byStep: Record<number, string> = { ...(dataOverrides[selectionKey] ?? dataOverrides[scenario.scenarioId] ?? {}) };
      // The "Datos de este escenario" panel edits values by field (valueKey), like web; the
      // mobile run applies them by step. Every step that types that field gets the value.
      const values = { ...datasetValues, ...(scenarioDatasetValues[selectionKey] ?? scenarioDatasetValues[scenario.scenarioId] ?? {}) };
      for (const field of scenario.requiredData ?? []) {
        const value = values[field.key];
        if (typeof value === 'string' && value.trim() !== '') byStep[field.stepIndex] = value;
      }
      if (Object.keys(byStep).length > 0) overrides[scenario.scenarioId] = byStep;
    }));
    const selected = recordingGroups.flatMap((group) => group.scenarios);
    const launch = await mobileExecution.execute(
      {
        ...projectDetail,
        testRail: {
          projectIdTr: testRail.destination.projectId,
          suiteId: testRail.destination.suiteId,
          sectionId: testRail.destination.sectionId,
        },
      },
      selected,
      overrides,
      deviceSerial,
      selectedIssue?.key,
    );
    if (!launch) return;
    onLaunch?.({
      id: launch.jobId,
      jobId: launch.jobId,
      recordingId,
      scenarioIds: selected.map((scenario) => scenario.scenarioId),
      project: projectDetail.name,
      triggered: 'Grabación móvil',
      startedAt: new Date().toISOString(),
      progress: 0,
      total: launch.scenarioCount,
      completed: 0,
      passed: 0,
      failed: 0,
      currentTest: '',
      eta: '—',
      status: 'running',
      activeScenarios: selected.map((scenario, index) => ({
        id: scenario.scenarioId,
        title: scenario.title,
        index: index + 1,
        total: selected.length,
        steps: (scenario.testRailSteps ?? []).map((step) => step.content).filter((step): step is string => typeof step === 'string' && step.trim().length > 0),
      })),
      issueKey: launch.issueKey ?? selectedIssue?.key,
      checklistUrl: launch.checklistUrl,
    });
  }

  async function handleExecuteAutomation() {
    if (!canExecute || running) return;
    if (isMobile) {
      await handleExecuteMobile();
      return;
    }
    const selections = recordingGroups.flatMap((group) => group.scenarios.map((scenario) => {
      const overrides = dataOverrides[testRailSelectionKey(group.recordingId, scenario.scenarioId)]
        ?? dataOverrides[scenario.scenarioId];
      const values = scenarioDatasetValues[testRailSelectionKey(group.recordingId, scenario.scenarioId)]
        ?? scenarioDatasetValues[scenario.scenarioId]
        ?? {};
      const specValues = scenarioSpecDatasetValues[testRailSelectionKey(group.recordingId, scenario.scenarioId)]
        ?? scenarioSpecDatasetValues[scenario.scenarioId]
        ?? {};
      return {
        recordingId: group.recordingId,
        scenarioId: scenario.scenarioId,
        ...(overrides ? { dataOverrides: overrides } : {}),
        datasetValues: { ...datasetValues, ...values },
        ...(Object.keys(specValues).length > 0 ? { specDatasetValues: specValues } : {}),
      };
    }));
    const launch = await replay.replayBatch(
      projectSlug,
      selections,
      testRail.destination,
      selectedIssue ? { key: selectedIssue.key, summary: selectedIssue.summary } : undefined,
    );
    // `replayBatch` returns null after it has already stored the backend's own error; only a launch that
    // succeeded without a job needs the generic message. (`replay.error` here is a stale render value.)
    if (!launch) return;
    if (!launch.jobId) {
      replay.setError('No se recibió un job de ejecución del backend.');
      return;
    }
    onLaunch?.({
      id: launch.jobId,
      jobId: launch.jobId,
      recordingId,
      scenarioIds: selections.map(({ scenarioId }) => scenarioId),
      project: projectDetail?.name ?? projectSlug,
      triggered: 'Grabación web',
      startedAt: new Date().toISOString(),
      progress: 0,
      total: launch.scenarioCount ?? selections.length,
      completed: 0,
      passed: 0,
      failed: 0,
      currentTest: '',
      eta: '—',
      status: 'running',
      activeScenarios: recordingGroups.flatMap((group) => group.scenarios).map((scenario, index, all) => ({
        id: scenario.scenarioId,
        title: scenario.title,
        index: index + 1,
        total: all.length,
        steps: (scenario.testRailSteps ?? []).map((step) => step.content).filter((step): step is string => typeof step === 'string' && step.trim().length > 0),
      })),
    });
  }

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      <StepIndicator />

      <div className="max-w-5xl mx-auto">
        <BentoCard className="!p-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso dos · TestRail</div>
          <h2
            className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight"
            style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}
          >
            Subir escenarios a TestRail
          </h2>
          <p className="text-[13px] text-[#58646D] mb-7">
            Configura el destino de TestRail y prepara la ejecución de los escenarios seleccionados.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <TestRailDestinationPicker testRail={testRail} />
            <JiraRequirementPicker selectedIssue={selectedIssue} onSelectIssue={onSelectIssue} />
          </div>

          {/* Scenario summary follows the two source panels and sizes to its actual contents. */}
          <div className="mt-5 self-start bg-[#FAFAF7] rounded-2xl p-5">
              <span className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Escenarios seleccionados</span>
              <div className="mt-3 rounded-xl border border-[#E8EBEC] divide-y divide-[#E8EBEC] bg-white overflow-hidden">
                <div className="px-3 py-2.5 text-[12px] font-semibold text-[#1a1f2e] bg-[#FAFAF7]">
                  {selectedScenarios.length === 1 ? '1 escenario seleccionado' : `${selectedScenarios.length} escenarios seleccionados`}
                </div>
                {selectedScenarios.map(({ recordingId: selectedRecordingId, scenario }) => (
                  <div
                    key={testRailSelectionKey(selectedRecordingId, scenario.scenarioId)}
                    title={`Grabación ${selectedRecordingId}`}
                    className="px-3 py-2.5 flex items-center justify-between text-[12px]"
                  >
                    <span className="text-[#1a1f2e] font-medium truncate">{scenario.title}</span>
                    <span className="text-[#8B999D] flex-shrink-0 ml-2">
                      {typeof scenario.functionalActionCount === 'number'
                        ? `${scenario.functionalActionCount} acciones funcionales`
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
          </div>

          {traceReadiness.checking && (
            <div className="mt-5 text-[12px] text-[#58646D]">Validando que las grabaciones seleccionadas sigan disponibles…</div>
          )}
          {traceReadiness.error && (
            <div className="mt-5 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{traceReadiness.error}</span>
            </div>
          )}
          {executionError && (
            <div className="mt-5 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{executionError}</span>
            </div>
          )}
          {isMobile && mobileExecution.notice && (
            <div className="mt-5 text-[12px] text-[#58646D]">{mobileExecution.notice}</div>
          )}
          {isMobile && (
            <div className="mt-5 text-[12px] text-[#58646D]" data-testid="testrail-upload-device">
              {deviceSerial ? `Se ejecuta en ${deviceSerial} de tu equipo.` : 'Se ejecuta en el emulador del servidor.'}
            </div>
          )}
        </BentoCard>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#48A157]/25 bg-[#48A157] px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:border-[#347F43] hover:bg-[#347F43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#48A157]/35 focus-visible:ring-offset-2"
          >
            <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>Volver a la grabación</span>
          </button>
          <button
            onClick={handleExecuteAutomation}
            disabled={!canExecute || running}
            title={executionBlockedReason}
            className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
            Ejecutar Automatización
          </button>
        </div>
      </div>
    </div>
  );
}
