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
import type { RecordingProjectDetail } from './useRecordingExecution';
import { groupScenariosByRecording } from './groupScenariosByRecording';
import { testRailSelectionKey } from './testRailSelection';

/**
 * Dedicated destination screen for a web recording.
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
  testRail: ReturnType<typeof useTestRailDestination>;
  selectedIssue: JiraIssue | null;
  onSelectIssue: (issue: JiraIssue | null) => void;
  dataOverrides: Record<string, Record<number, string>>;
  datasetValues: Record<string, string | undefined>;
  onBack: () => void;
  onLaunch?: (run: ActiveRun) => void;
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
  testRail,
  selectedIssue,
  onSelectIssue,
  dataOverrides,
  datasetValues,
  recordingId,
  onBack,
  onLaunch,
}: TestRailUploadScreenProps) {
  const replay = useWebRecordingReplay();
  const [traceReadiness, setTraceReadiness] = useState<{ checking: boolean; error: string | null }>({ checking: true, error: null });

  const destinationReady = Boolean(testRail.destination.projectId && testRail.destination.suiteId && testRail.destination.sectionId);
  const recordingGroups = useMemo(
    () => groupScenariosByRecording(scenarios, scenarioRecordingIds, recordingId),
    [scenarios, scenarioRecordingIds, recordingId],
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
  const running = replay.starting;

  async function handleExecuteAutomation() {
    if (!canExecute || running) return;
    const selections = recordingGroups.flatMap((group) => group.scenarios.map((scenario) => {
      const overrides = dataOverrides[testRailSelectionKey(group.recordingId, scenario.scenarioId)]
        ?? dataOverrides[scenario.scenarioId];
      const values = scenarioDatasetValues[testRailSelectionKey(group.recordingId, scenario.scenarioId)]
        ?? scenarioDatasetValues[scenario.scenarioId]
        ?? {};
      return {
        recordingId: group.recordingId,
        scenarioId: scenario.scenarioId,
        ...(overrides ? { dataOverrides: overrides } : {}),
        datasetValues: { ...datasetValues, ...values },
      };
    }));
    const launch = await replay.replayBatch(
      projectSlug,
      selections,
      testRail.destination,
      selectedIssue ? { key: selectedIssue.key, summary: selectedIssue.summary } : undefined,
    );
    if (!launch?.jobId) {
      if (!replay.error) replay.setError('No se recibió un job de ejecución del backend.');
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
                  {scenarios.length === 1 ? '1 escenario seleccionado' : `${scenarios.length} escenarios seleccionados`}
                </div>
                {scenarios.map((scenario, index) => (
                  <div
                    key={testRailSelectionKey(scenarioRecordingIds[index] ?? recordingId, scenario.scenarioId)}
                    title={`Grabación ${scenarioRecordingIds[index] ?? recordingId}`}
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
          {replay.error && (
            <div className="mt-5 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{replay.error}</span>
            </div>
          )}
        </BentoCard>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-[12px] font-medium px-4 py-2.5 rounded-full text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5"
          >
            <ChevronLeft size={13} /> Volver a la grabación
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
