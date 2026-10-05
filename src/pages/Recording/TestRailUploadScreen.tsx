import { useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, ChevronLeft, Database, GitBranch, Loader2, Rocket, ScanLine } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import type { RecordedScenario } from '../../services/recordings/types';
import type { ActiveRun } from '../../types';
import { useTestRailDestination } from './useTestRailDestination';
import { TestRailDestinationPicker } from './TestRailDestinationPicker';
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
  dataOverrides: Record<string, Record<number, string>>;
  datasetValues: Record<string, string | undefined>;
  onBack: () => void;
  onLaunch?: (run: ActiveRun) => void;
}

/** Fixed for this screen — Recording is always past project selection, mid TestRail setup. */
const STEPS = [
  { n: 1, label: 'Proyecto', icon: Boxes, status: 'completed' as const },
  { n: 2, label: 'Fuentes', icon: GitBranch, status: 'active' as const },
  { n: 3, label: 'Casos', icon: ScanLine, status: 'inactive' as const },
  { n: 4, label: 'Lanzar', icon: Rocket, status: 'inactive' as const },
];

function StepIndicator() {
  return (
    <div className="mb-5 flex items-center justify-center">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full transition-all',
                  s.status === 'active' && 'bg-[#1a1f2e] text-white',
                  s.status === 'completed' && 'bg-[#48A157] text-white',
                  s.status === 'inactive' && 'bg-white border border-[#E8EBEC] text-[#8B999D]',
                )}
              >
                {s.status === 'completed' ? <CheckCircle2 size={13} strokeWidth={3} /> : <Icon size={13} />}
                <span className="text-[11px] font-semibold uppercase tracking-wider">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('w-6 h-px transition-all', s.status === 'completed' ? 'bg-[#48A157]' : 'bg-[#E8EBEC]')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TestRailUploadScreen({
  projectSlug,
  projectDetail,
  scenarios,
  scenarioRecordingIds = [],
  scenarioDatasetValues = {},
  dataOverrides,
  datasetValues,
  recordingId,
  onBack,
  onLaunch,
}: TestRailUploadScreenProps) {
  const testRail = useTestRailDestination(projectDetail?.testRail);
  const replay = useWebRecordingReplay();
  const [fastPathSummary, setFastPathSummary] = useState<string | null>(null);

  const destinationReady = Boolean(testRail.destination.projectId && testRail.destination.suiteId && testRail.destination.sectionId);
  const recordingGroups = groupScenariosByRecording(scenarios, scenarioRecordingIds, recordingId);
  const canExecute = Boolean(recordingId) && recordingGroups.length > 0 && destinationReady;
  const running = replay.starting;

  async function handleExecuteAutomation() {
    if (!canExecute || running) return;
    setFastPathSummary(null);
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
    const launch = await replay.replayBatch(projectSlug, selections, testRail.destination);
    if (!launch?.jobId) {
      setFastPathSummary(replay.error ?? 'No se recibió un job de ejecución del backend.');
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

          {/* Origin — this recording's destination is already known; shown, not chosen. */}
          <div className="mb-7">
            <div className="grid grid-cols-1 gap-3">
              <div className="text-left p-4 rounded-2xl border-2 border-[#48A157] bg-[#48A157]/5 max-w-sm">
                <div className="flex items-center justify-between mb-2">
                  <Database size={18} className="text-[#48A157]" />
                  <div className="w-2 h-2 rounded-full bg-[#48A157] animate-pulse" />
                </div>
                <div className="text-[13px] font-semibold text-[#1a1f2e]">Solo TestRail</div>
                <div className="text-[11px] text-[#8B999D] mt-0.5">Publicación y ejecución automatizada</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <TestRailDestinationPicker testRail={testRail} />

            {/* Scenario summary — read-only context carried from Recording, never editable here. */}
            <div className="bg-[#FAFAF7] rounded-2xl p-5">
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
          </div>

          {fastPathSummary && (
            <div className="mt-5 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{fastPathSummary}</span>
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
            title={!destinationReady ? 'Completa Proyecto, Suite y Sección de TestRail' : undefined}
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
