import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Cloud,
  CloudOff,
  Database,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { useAuth } from '../../auth/AuthContext';
import { testDesignApi, type TestDesignDraftStory, type TestDesignScenario } from '../../services/test-design';
import { projectsRefApi, type ProjectRef } from '../../services/identity';
import { useTestRailDestination } from '../Recording/useTestRailDestination';
import { TestRailDestinationPicker } from '../Recording/TestRailDestinationPicker';
import { ScenarioEditor } from './ScenarioEditor';
import { StoryDataPanel } from './StoryDataPanel';
import { StoryMultiPicker, type PickedStory } from './StoryMultiPicker';
import { MAX_STORIES } from './NewDraftForm';
import { useDraftEditor, type SaveState } from './useDraftEditor';
import { PublishDialog, type PublishDestination } from './PublishDialog';
import {
  countSelection,
  duplicateScenario,
  moveItem,
  newScenario,
  pendingData,
  JIRA_PUBLISH_ENABLED,
  setSelection,
  sumCounts,
  type Destination,
} from './scenario-utils';

interface DraftWorkspaceProps {
  draftId: string;
  onBack: () => void;
}

function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'idle') return null;
  const map = {
    pending: { icon: Cloud, text: 'Cambios sin guardar', color: 'text-[#8B999D]' },
    saving: { icon: Loader2, text: 'Guardando…', color: 'text-[#8B999D]' },
    saved: { icon: CheckCircle2, text: 'Guardado', color: 'text-[#48A157]' },
    error: { icon: CloudOff, text: error ?? 'No se pudo guardar', color: 'text-[#B4463C]' },
  } as const;
  const { icon: Icon, text, color } = map[state];
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', color)} title={text}>
      <Icon size={12} className={state === 'saving' ? 'animate-spin' : undefined} />
      <span className="max-w-[260px] truncate">{text}</span>
    </span>
  );
}

function StoryStatus({ story }: { story: TestDesignDraftStory }) {
  switch (story.generationStatus) {
    case 'generating':
      return <Loader2 size={13} className="animate-spin text-[#104B99]" />;
    case 'failed':
      return <XCircle size={13} className="text-[#B4463C]" />;
    case 'ready':
      return <CheckCircle2 size={13} className="text-[#48A157]" />;
    default:
      return <CircleDashed size={13} className="text-[#8B999D]" />;
  }
}

export function DraftWorkspace({ draftId, onBack }: DraftWorkspaceProps) {
  const { can } = useAuth();
  const editor = useDraftEditor(draftId);
  const { draft, scenarios } = editor;
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddStories, setShowAddStories] = useState(false);
  const [newStories, setNewStories] = useState<PickedStory[]>([]);
  const [showDestination, setShowDestination] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [openScenarioId, setOpenScenarioId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<PublishDestination | null>(null);
  const [publishScenarioIds, setPublishScenarioIds] = useState<string[] | undefined>();
  const [automationProjects, setAutomationProjects] = useState<ProjectRef[]>([]);
  const [projectSlug, setProjectSlug] = useState('');

  useEffect(() => {
    if (draft?.projectSlug) return;
    projectsRefApi.list()
      .then((projects) => setAutomationProjects(projects.filter((project) => project.enabled)))
      .catch(() => setAutomationProjects([]));
  }, [draft?.projectSlug]);

  const editable =
    can('testdesign.generate') && !editor.forbidden && Boolean(draft) && draft!.status !== 'archived';
  const testRail = useTestRailDestination(
    draft
      ? {
          projectId: draft.testRail.projectId ? String(draft.testRail.projectId) : null,
          suiteId: draft.testRail.suiteId ? String(draft.testRail.suiteId) : null,
          sectionId: draft.testRail.sectionId ? String(draft.testRail.sectionId) : null,
        }
      : null,
  );

  // Falls back to the first story when none is chosen yet or the chosen one was removed.
  const story = draft?.stories.find((s) => s.id === activeStoryId) ?? draft?.stories[0] ?? null;
  const storyScenarios = story ? scenarios[story.id] ?? story.scenarios : [];

  const perStory = useMemo(
    () => Object.fromEntries((draft?.stories ?? []).map((s) => [s.id, countSelection(scenarios[s.id] ?? s.scenarios)])),
    [draft, scenarios],
  );
  const totals = sumCounts(Object.values(perStory));
  const hasPublishedTestRailCases = Boolean(draft?.stories.some(s => s.scenarios.some(sc => sc.testRailCaseId !== null)));
  const mayCheckTestRail = can('testdesign.publish_testrail');
  useEffect(() => {
    if (!hasPublishedTestRailCases || !mayCheckTestRail) return;
    let disposed = false;
    let checking = false;
    const reconcile = async () => {
      if (checking) return;
      checking = true;
      try {
        await editor.flush();
        const result = await testDesignApi.reconcileTestRail(draftId);
        if (!disposed) editor.applyServerDraft(result.draft);
      } catch (error) {
        if (!disposed) setActionError(`No se pudo comprobar el estado en TestRail: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        checking = false;
      }
    };
    void reconcile();
    window.addEventListener('focus', reconcile);
    return () => { disposed = true; window.removeEventListener('focus', reconcile); };
  }, [draftId, hasPublishedTestRailCases, mayCheckTestRail, editor.flush, editor.applyServerDraft]);
  const pendingDataCount = useMemo(
    () => (draft?.stories ?? []).reduce((n, s) => n + (scenarios[s.id] ?? s.scenarios).reduce((m, sc) => m + pendingData(sc).length, 0), 0),
    [draft, scenarios],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const setStoryScenarios = (next: TestDesignScenario[]) => {
    if (story) editor.updateScenarios(story.id, next);
  };

  const generatePending = () =>
    run(async () => {
      await editor.flush();
      editor.applyServerDraft(await testDesignApi.generate(draftId));
    });

  const retryStory = (storyId: string) =>
    run(async () => {
      editor.applyServerDraft(await testDesignApi.generate(draftId, { storyIds: [storyId] }));
    });

  const regenerate = () =>
    run(async () => {
      if (!story) return;
      await editor.flush();
      editor.applyServerDraft(await testDesignApi.regenerate(draftId, story.id, regenInstructions.trim() || undefined));
      setRegenOpen(false);
      setRegenInstructions('');
    });

  const addStories = () =>
    run(async () => {
      const updated = await testDesignApi.updateDraft(draftId, { addIssues: newStories });
      setNewStories([]);
      setShowAddStories(false);
      editor.applyServerDraft(await testDesignApi.generate(draftId).catch(() => updated));
    });

  const removeStory = (target: TestDesignDraftStory) =>
    run(async () => {
      if (!window.confirm(`¿Quitar ${target.issueKey} del borrador? Se pierden sus escenarios no publicados.`)) return;
      editor.applyServerDraft(await testDesignApi.updateDraft(draftId, { removeStoryIds: [target.id] }));
    });

  const saveDestination = () =>
    run(async () => {
      const toNumber = (v?: string) => (v ? Number(v) : null);
      editor.applyServerDraft(
        await testDesignApi.updateDraft(draftId, {
          testRail: {
            projectId: toNumber(testRail.destination.projectId),
            suiteId: toNumber(testRail.destination.suiteId),
            sectionId: toNumber(testRail.destination.sectionId),
          },
        }),
      );
      setShowDestination(false);
    });

  const linkKnowledgeProject = () =>
    run(async () => {
      if (!projectSlug) return;
      editor.applyServerDraft(await testDesignApi.updateDraft(draftId, { projectSlug }));
    });

  if (editor.loadError && !draft) {
    return (
      <div className="p-7">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-[#E8EBEC] p-6 text-[13px] text-[#B4463C] flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5" />
          <div>
            <div>{editor.loadError}</div>
            <button onClick={onBack} className="mt-3 text-[12px] font-semibold text-[#1a1f2e] underline">
              Volver a los borradores
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="p-7 flex items-center justify-center text-[13px] text-[#8B999D] gap-2">
        <Loader2 size={14} className="animate-spin" /> Cargando borrador…
      </div>
    );
  }

  const pendingCount = draft.stories.filter((s) => s.generationStatus === 'pending').length;
  const knowledgeProfileReady = Boolean(draft.projectSlug);
  const destinationLabel = draft.testRail.sectionId
    ? testRail.sectionName ?? `Sección ${draft.testRail.sectionId}`
    : 'Sin sección de TestRail';
  const counts = story ? perStory[story.id] : null;

  const commonBlock = !editable
    ? 'Solo lectura'
    : editor.anyGenerating
      ? 'Espera a que termine la generación'
      : undefined;
  const publishTestRailReason =
    commonBlock ??
    (!draft.testRail.sectionId
      ? 'Elige la sección de TestRail del borrador (cambiar destino)'
      : !Object.values(scenarios).flat().some(s => s.selectedForTestRail && (s.testRailCaseId === null || s.testRailDirty === true))
        ? 'No hay escenarios seleccionados para TestRail'
        : undefined);
  const publishJiraReason = commonBlock ?? (totals.jira === 0 ? 'No hay escenarios seleccionados para Jira' : undefined);

  const bulk = (destination: Destination, value: boolean) => setStoryScenarios(setSelection(storyScenarios, destination, value));

  return (
    <div className="p-7 space-y-5" style={{ background: C.canvas, minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={async () => {
              await editor.flush();
              onBack();
            }}
            className="text-[12px] font-medium text-[#58646D] hover:text-[#1a1f2e] flex items-center gap-1 mb-2"
          >
            <ChevronLeft size={13} /> Borradores
          </button>
          <h2 className="text-[24px] font-medium text-[#1a1f2e] leading-tight truncate" style={{ letterSpacing: '-0.02em' }}>
            {draft.title || draft.stories.map((s) => s.issueKey).join(', ')}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#58646D]">
            <span className="flex items-center gap-1.5">
              <FileText size={12} className="text-[#104B99]" /> Jira {draft.jiraProjectKey}
            </span>
            <span className="flex items-center gap-1.5">
              <Database size={12} className="text-[#48A157]" /> {destinationLabel}
              {editable && (
                <button onClick={() => setShowDestination((v) => !v)} className="text-[#104B99] font-semibold hover:underline">
                  cambiar
                </button>
              )}
            </span>
            {draft.createdByName && <span>Creado por {draft.createdByName}</span>}
            {draft.status === 'archived' && <span className="font-semibold text-[#B4463C]">Archivado</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 pt-7">
          <SaveIndicator state={editor.saveState} error={editor.saveError} />
          {editable && pendingCount > 0 && (
            <button
              onClick={generatePending}
              disabled={busy || !knowledgeProfileReady}
              title={!knowledgeProfileReady ? 'Vincula un proyecto para cargar su conocimiento' : undefined}
              className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5"
            >
              <Sparkles size={13} /> Generar {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {!editable && (
        <div className="rounded-xl bg-[#FFF8E6] border border-[#F1DFA8] px-4 py-2.5 text-[12px] text-[#7A5B00]">
          {draft.status === 'archived'
            ? 'Este borrador está archivado: solo lectura.'
            : 'Solo lectura: no tienes permiso para editar este borrador.'}
        </div>
      )}

      {!knowledgeProfileReady && editable && (
        <div className="rounded-xl bg-[#FFF8E6] border border-[#F1DFA8] px-4 py-3 text-[12px] text-[#7A5B00] flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="font-semibold">Vincula el perfil de conocimiento</div>
            <div className="mt-1">La generación de escenarios reutiliza las rutas Jira aprendidas en este proyecto.</div>
            <select
              aria-label="Proyecto de automatización para conocimiento"
              value={projectSlug}
              onChange={(event) => setProjectSlug(event.target.value)}
              className="mt-2 w-full max-w-md px-3 py-2 rounded-lg border border-[#E8EBEC] bg-white text-[12px] text-[#1a1f2e]"
            >
              <option value="">Selecciona un proyecto…</option>
              {automationProjects.map((project) => (
                <option key={project.slug} value={project.slug}>{project.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={linkKnowledgeProject}
            disabled={busy || !projectSlug}
            className="bg-[#1a1f2e] disabled:bg-[#BABEC3] text-white text-[12px] font-semibold px-4 py-2 rounded-full"
          >
            Vincular proyecto
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl bg-[#FBEDEB] border border-[#F0C9C3] px-4 py-2.5 text-[12px] text-[#B4463C] flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}

      {showDestination && editable && (
        <div className="max-w-xl space-y-3">
          <TestRailDestinationPicker testRail={testRail} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDestination(false)} className="text-[12px] px-4 py-2 rounded-full text-[#58646D] hover:bg-white">
              Cancelar
            </button>
            <button
              onClick={saveDestination}
              disabled={busy || !testRail.destination.sectionId}
              className="bg-[#1a1f2e] disabled:bg-[#BABEC3] text-white text-[12px] font-semibold px-4 py-2 rounded-full"
            >
              Guardar destino
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Stories */}
        <BentoCard className="!p-3">
          <div className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">
            Historias ({draft.stories.length})
          </div>
          <div className="space-y-1">
            {draft.stories.map((s) => {
              const c = perStory[s.id];
              const active = s.id === story?.id;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveStoryId(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveStoryId(s.id)}
                  className={cn(
                    'group rounded-xl px-3 py-2.5 cursor-pointer transition',
                    active ? 'bg-[#F4F1EA]' : 'hover:bg-[#FAFAF7]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StoryStatus story={s} />
                    <span className="text-[12px] font-semibold text-[#104B99]">{s.issueKey}</span>
                    {s.testRailPublishedAt && (
                      <span className="text-[10px] px-1.5 rounded bg-[#E9F5EB] text-[#2F7A3B]" title="Publicada en TestRail">
                        TR
                      </span>
                    )}
                    {s.jiraSubtaskKey && (
                      <span className="text-[10px] px-1.5 rounded bg-[#EEF3FA] text-[#104B99]" title="Sub-tarea en Jira">
                        {s.jiraSubtaskKey}
                      </span>
                    )}
                    {editable && !editor.anyGenerating && draft.stories.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeStory(s);
                        }}
                        title="Quitar historia"
                        className="ml-auto opacity-0 group-hover:opacity-100 text-[#8B999D] hover:text-[#B4463C]"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-[#58646D] truncate mt-0.5" title={s.issueSummary}>
                    {s.issueSummary || '—'}
                  </div>
                  {s.generationStatus === 'ready' && c && (
                    <div className="text-[10px] text-[#8B999D] mt-1">
                      {c.total} casos · {c.testrail} TestRail{JIRA_PUBLISH_ENABLED && ` · ${c.jira} Jira`}
                      {c.blocked > 0 && <span className="text-[#B4463C]"> · {c.blocked} incompletos</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {editable && (
            <div className="mt-2 border-t border-[#F0F1F2] pt-2">
              {showAddStories ? (
                <div className="space-y-2 p-1">
                  <StoryMultiPicker
                    projectKey={draft.jiraProjectKey}
                    selected={newStories}
                    onChange={setNewStories}
                    max={Math.max(0, MAX_STORIES - draft.stories.length)}
                    excludeKeys={draft.stories.map((s) => s.issueKey)}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddStories(false)} className="text-[11px] px-3 py-1.5 rounded-full text-[#58646D] hover:bg-[#FAFAF7]">
                      Cancelar
                    </button>
                    <button
                      onClick={addStories}
                      disabled={busy || !knowledgeProfileReady || newStories.length === 0}
                      className="bg-[#1a1f2e] disabled:bg-[#BABEC3] text-white text-[11px] font-semibold px-3 py-1.5 rounded-full"
                    >
                      Agregar y generar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddStories(true)}
                  disabled={draft.stories.length >= MAX_STORIES}
                  className="w-full px-3 py-2 rounded-xl text-[12px] font-semibold text-[#104B99] hover:bg-[#F4F7FB] disabled:text-[#BABEC3] flex items-center gap-1.5"
                >
                  <Plus size={13} /> Agregar historias
                </button>
              )}
            </div>
          )}
        </BentoCard>

        {/* Active story */}
        <div className="space-y-4 min-w-0">
          {story && (
            <BentoCard className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#104B99]">{story.issueKey}</div>
                  <div className="text-[16px] font-medium text-[#1a1f2e] leading-snug">{story.issueSummary || '—'}</div>
                </div>
                {editable && story.generationStatus === 'ready' && (
                  <button
                    onClick={() => setRegenOpen((v) => !v)}
                    disabled={busy || !knowledgeProfileReady}
                    className="text-[12px] font-semibold text-[#104B99] hover:bg-[#F4F7FB] px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw size={12} /> Regenerar
                  </button>
                )}
              </div>

              {regenOpen && editable && (
                <div className="mt-4 rounded-xl bg-[#FAFAF7] p-4 space-y-3">
                  <p className="text-[12px] text-[#58646D]">
                    Se reemplazan los escenarios de la IA que no editaste. Se conservan los que editaste, los que escribiste a mano y los ya subidos a TestRail.
                  </p>
                  <textarea
                    value={regenInstructions}
                    onChange={(e) => setRegenInstructions(e.target.value)}
                    rows={2}
                    placeholder="Indicaciones para esta regeneración (opcional)"
                    className="w-full px-3 py-2 rounded-lg border border-[#E8EBEC] bg-white text-[12px] outline-none focus:border-[#104B99] resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRegenOpen(false)} className="text-[12px] px-4 py-1.5 rounded-full text-[#58646D] hover:bg-white">
                      Cancelar
                    </button>
                    <button
                      onClick={regenerate}
                      disabled={busy || !knowledgeProfileReady}
                      className="bg-[#1a1f2e] disabled:bg-[#BABEC3] text-white text-[12px] font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5"
                    >
                      <Sparkles size={12} /> Regenerar
                    </button>
                  </div>
                </div>
              )}

              {story.generationStatus === 'generating' && (
                <div className="mt-6 mb-2 flex flex-col items-center gap-2 text-[13px] text-[#58646D]">
                  <Loader2 size={20} className="animate-spin text-[#104B99]" />
                  Generando escenarios con IA… suele tardar menos de un minuto.
                </div>
              )}

              {story.generationStatus === 'failed' && (
                <div className="mt-4 rounded-xl bg-[#FBEDEB] px-4 py-3 text-[12px] text-[#B4463C] flex items-start justify-between gap-3">
                  <span className="flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {story.generationError ?? 'La generación falló'}
                  </span>
                  {editable && (
                    <button onClick={() => retryStory(story.id)} disabled={busy || !knowledgeProfileReady} className="font-semibold underline shrink-0">
                      Reintentar
                    </button>
                  )}
                </div>
              )}

              {story.generationStatus === 'pending' && (
                <div className="mt-4 text-[12px] text-[#8B999D]">Esta historia aún no se generó.</div>
              )}

              {story.generationStatus !== 'generating' && counts && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-[#58646D] font-medium mr-2">
                    {counts.total} casos · {counts.testrail} a TestRail{JIRA_PUBLISH_ENABLED && ` · ${counts.jira} a Jira`}
                  </span>
                  {editable && storyScenarios.length > 0 && (
                    <>
                      <span className="text-[#8B999D]">TestRail:</span>
                      <button onClick={() => bulk('testrail', true)} className="font-semibold text-[#104B99] hover:underline">todos</button>
                      <button onClick={() => bulk('testrail', false)} className="font-semibold text-[#104B99] hover:underline">ninguno</button>
                      {JIRA_PUBLISH_ENABLED && (
                        <>
                          <span className="text-[#8B999D] ml-2">Jira:</span>
                          <button onClick={() => bulk('jira', true)} className="font-semibold text-[#104B99] hover:underline">todos</button>
                          <button onClick={() => bulk('jira', false)} className="font-semibold text-[#104B99] hover:underline">ninguno</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </BentoCard>
          )}

          {story && story.generationStatus !== 'generating' && (
            <div className="space-y-2.5">
              <StoryDataPanel scenarios={storyScenarios} readOnly={!editable} onChange={setStoryScenarios} />
              {storyScenarios.map((scenario, index) => (
                <ScenarioEditor
                  key={scenario.id}
                  scenario={scenario}
                  index={index}
                  count={storyScenarios.length}
                  readOnly={!editable}
                  publishDisabledReason={commonBlock ?? (!can('testdesign.publish_testrail') ? 'Sin permiso para publicar' : !draft.testRail.sectionId ? 'Elige una sección de TestRail' : undefined)}
                  onPublishTestRail={() => { setPublishScenarioIds([scenario.id]); setPublishing('testrail'); }}
                  defaultOpen={scenario.id === openScenarioId}
                  onChange={(next) => setStoryScenarios(storyScenarios.map((s) => (s.id === next.id ? next : s)))}
                  onMove={(delta) => setStoryScenarios(moveItem(storyScenarios, index, delta))}
                  onDuplicate={() => {
                    const copy = duplicateScenario(scenario);
                    setOpenScenarioId(copy.id);
                    setStoryScenarios([...storyScenarios.slice(0, index + 1), copy, ...storyScenarios.slice(index + 1)]);
                  }}
                  onDelete={() => {
                    const note = scenario.testRailCaseId !== null ? ' El caso seguirá existiendo en TestRail.' : '';
                    if (window.confirm(`¿Eliminar "${scenario.title || 'escenario sin título'}" del borrador?${note}`)) {
                      setStoryScenarios(storyScenarios.filter((s) => s.id !== scenario.id));
                    }
                  }}
                />
              ))}
              {editable && (
                <button
                  onClick={() => {
                    const created = newScenario();
                    setOpenScenarioId(created.id);
                    setStoryScenarios([...storyScenarios, created]);
                  }}
                  className="w-full rounded-2xl border border-dashed border-[#BABEC3] py-3 text-[12px] font-semibold text-[#104B99] hover:bg-white flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} /> Agregar escenario manual
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Publish bar */}
      <div className="sticky bottom-0 -mx-7 px-7 py-3 bg-white/95 backdrop-blur border-t border-[#E8EBEC] flex items-center justify-between gap-4">
        <div className="text-[12px] text-[#58646D]">
          <span className="font-semibold text-[#1a1f2e]">{totals.total}</span> casos ·{' '}
          <span className="font-semibold text-[#1a1f2e]">{totals.testrail}</span> a TestRail
          {JIRA_PUBLISH_ENABLED && (
            <>
              {' · '}
              <span className="font-semibold text-[#1a1f2e]">{totals.jira}</span> a Jira
            </>
          )}
          {totals.blocked > 0 && <span className="text-[#B4463C]"> · {totals.blocked} seleccionados incompletos</span>}
          {pendingDataCount > 0 && (
            <span className="text-[#B7791F]"> · {pendingDataCount} {pendingDataCount === 1 ? "dato de prueba por completar" : "datos de prueba por completar"}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {can('testdesign.publish_testrail') && (
            <button
              onClick={() => { setPublishScenarioIds(undefined); setPublishing('testrail'); }}
              disabled={Boolean(publishTestRailReason)}
              title={publishTestRailReason}
              className="bg-[#48A157] hover:bg-[#3d8b4a] disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5"
            >
              <Send size={12} /> Subir seleccionados a TestRail
            </button>
          )}
          {JIRA_PUBLISH_ENABLED && can('testdesign.publish_jira') && (
            <button
              onClick={() => setPublishing('jira')}
              disabled={Boolean(publishJiraReason)}
              title={publishJiraReason}
              className="bg-[#104B99] hover:bg-[#0a3a78] disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5"
            >
              <Send size={12} /> Publicar en Jira
            </button>
          )}
        </div>
      </div>

      {publishing && (
        <PublishDialog
          destination={publishing}
          scenarioIds={publishScenarioIds}
          draft={draft}
          scenarios={scenarios}
          sectionLabel={destinationLabel}
          beforePublish={editor.flush}
          onPublished={editor.applyServerDraft}
          onClose={() => { setPublishing(null); setPublishScenarioIds(undefined); }}
        />
      )}
    </div>
  );
}
