import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileText, Layers, Loader2, Sparkles } from 'lucide-react';
import { C } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import type { JiraProject } from '../../services/jira/types';
import { projectsRefApi, type ProjectRef } from '../../services/identity';
import { testDesignApi, type TestDesignDraftWithStories } from '../../services/test-design';
import { useTestDesignTestRailDestination } from './useTestDesignTestRailDestination';
import { TestRailDestinationPicker } from '../Recording/TestRailDestinationPicker';
import { StoryMultiPicker, type PickedStory } from './StoryMultiPicker';

/** The engine's default limit (TEST_DESIGN_MAX_STORIES); the engine enforces the real one. */
export const MAX_STORIES = 10;

interface NewDraftFormProps {
  onCancel: () => void;
  onCreated: (draft: TestDesignDraftWithStories) => void;
}

const optionalNumber = (value?: string) => (value ? Number(value) : null);

/** Same label the launch screen shows on a project card. */
const projectStack = (project: ProjectRef) => (project.projectType === 2 ? 'Mobile · Android' : 'Web · Playwright');

const STEPS = [
  { n: 1, label: 'Proyecto', icon: Layers },
  { n: 2, label: 'Historias', icon: FileText },
] as const;

export function NewDraftForm({ onCancel, onCreated }: NewDraftFormProps) {
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [stories, setStories] = useState<PickedStory[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [automationProjects, setAutomationProjects] = useState<ProjectRef[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectSlug, setProjectSlug] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testRail = useTestDesignTestRailDestination(null);

  useEffect(() => {
    testDesignApi
      .listJiraProjects()
      .then(setJiraProjects)
      .catch((err) => setJiraError(err instanceof Error ? err.message : String(err)));
    projectsRefApi
      .list()
      .then((list) => { setAutomationProjects(list.filter((p) => p.enabled)); setProjectsError(null); })
      .catch((err) => {
        setAutomationProjects([]);
        setProjectsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setProjectsLoading(false));
  }, []);

  function chooseJiraProject(key: string) {
    if (key === jiraProjectKey) return;
    setJiraProjectKey(key);
    setStories([]);
  }

  const selectedProject = automationProjects.find((p) => p.slug === projectSlug);

  // The project is chosen in step 1 and is mandatory: it loads the knowledge the generation uses.
  const blockedReason = !projectSlug
    ? 'Selecciona el proyecto de automatización'
    : !jiraProjectKey
      ? 'Selecciona un proyecto de Jira'
      : stories.length === 0
        ? 'Selecciona al menos una historia'
        : undefined;

  async function submit() {
    if (blockedReason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const draft = await testDesignApi.createDraft({
        jiraProjectKey,
        projectSlug,
        instructions: instructions.trim() || null,
        testRail: {
          projectId: optionalNumber(testRail.destination.projectId),
          suiteId: optionalNumber(testRail.destination.suiteId),
          sectionId: optionalNumber(testRail.destination.sectionId),
        },
        issues: stories,
      });
      // Generation starts right away: creating a draft is only ever a step towards it.
      const started = await testDesignApi.generate(draft.id).catch(() => draft);
      onCreated(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      <div className="mb-5 flex items-center justify-center">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.n;
            const isCompleted = step > s.n;
            return (
              <Fragment key={s.n}>
                <button
                  onClick={() => isCompleted && setStep(s.n)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    isActive
                      ? 'bg-[#1a1f2e] text-white'
                      : isCompleted
                        ? 'bg-[#48A157] text-white cursor-pointer hover:bg-[#357a42]'
                        : 'bg-white border border-[#E8EBEC] text-[#8B999D]'
                  }`}
                >
                  {isCompleted ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                  <span className="text-[11px] font-semibold uppercase tracking-wider">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px transition-all ${isCompleted ? 'bg-[#48A157]' : 'bg-[#E8EBEC]'}`} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {step === 1 && (
          <>
            <BentoCard className="!p-8">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso uno · Elige tu proyecto</div>
              <h2
                className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight"
                style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}
              >
                ¿Para qué proyecto diseñamos las pruebas?
              </h2>
              <p className="text-[13px] text-[#58646D] mb-7">
                La generación usará las rutas aprendidas y el conocimiento de este proyecto. Quienes tengan acceso al proyecto también podrán ver el borrador.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
                {projectsLoading && [0, 1].map((i) => (
                  <div key={i} className="h-[120px] rounded-2xl bg-white border border-[#E8EBEC] animate-pulse" />
                ))}
                {!projectsLoading && projectsError && (
                  <div className="col-span-2 rounded-xl border border-[#E63946]/30 bg-[#E63946]/5 px-4 py-3 text-[12px] text-[#E63946] flex items-center gap-2">
                    <AlertTriangle size={14} /> No se pudieron cargar los proyectos ({projectsError})
                  </div>
                )}
                {!projectsLoading && !projectsError && automationProjects.length === 0 && (
                  <div className="col-span-2 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] px-4 py-6 text-center text-[12px] text-[#8B999D]">
                    No hay proyectos disponibles.
                  </div>
                )}
                {!projectsLoading && !projectsError && automationProjects.map((p) => {
                  const selected = projectSlug === p.slug;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProjectSlug(p.slug)}
                      className={`text-left p-6 rounded-2xl border-2 transition-all relative overflow-hidden ${
                        selected ? 'border-[#1a1f2e] bg-[#1a1f2e] text-white' : 'border-[#E8EBEC] hover:border-[#1a1f2e]/40 bg-white'
                      }`}
                    >
                      {selected && <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20" style={{ background: C.green }} />}
                      <div className="flex items-start justify-between mb-3 relative">
                        <div className={`text-[10px] uppercase tracking-wider font-semibold ${selected ? 'text-white/50' : 'text-[#8B999D]'}`}>
                          {p.projectType === 2 ? 'Mobile · Android' : 'Web · Playwright'}
                        </div>
                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-[#48A157] flex items-center justify-center">
                            <Check size={12} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-[22px] font-medium leading-tight ${selected ? 'text-white' : 'text-[#1a1f2e]'}`}
                        style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}
                      >
                        {p.name || p.slug}
                      </div>
                      <div className={`text-[12px] mt-1.5 ${selected ? 'text-white/60' : 'text-[#8B999D]'}`}>{projectStack(p)}</div>
                    </button>
                  );
                })}
              </div>
            </BentoCard>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={onCancel}
                className="text-[12px] font-medium px-4 py-2.5 rounded-full text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5"
              >
                <ChevronLeft size={13} /> Volver a los borradores
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!projectSlug}
                title={projectSlug ? undefined : 'Selecciona el proyecto de automatización'}
                className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5"
              >
                Continuar <ChevronRight size={13} />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
        <BentoCard className="!p-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">
            Nuevo diseño · Origen y destino{selectedProject ? ` · ${selectedProject.name || selectedProject.slug}` : ''}
          </div>
          <h2
            className="text-[30px] font-medium text-[#1a1f2e] mb-1 leading-tight"
            style={{ letterSpacing: '-0.03em' }}
          >
            ¿De qué historias generamos los casos?
          </h2>
          <p className="text-[13px] text-[#58646D] mb-7">
            Elige una o varias historias de Jira y la sección de TestRail donde quedarán los casos. Podrás editarlos antes de publicar.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#104B99] flex items-center justify-center">
                  <FileText size={15} className="text-white" />
                </div>
                <div className="text-[14px] font-semibold text-[#1a1f2e]">Jira</div>
              </div>
              <SearchableSelect
                label="Proyecto"
                placeholder="Selecciona un proyecto…"
                searchPlaceholder="Buscar proyecto..."
                itemsNounPlural="proyectos"
                items={jiraProjects}
                selectedId={jiraProjectKey || undefined}
                onSelect={(p) => chooseJiraProject(p.key)}
                getId={(p) => p.key}
                getLabel={(p) => `${p.key} · ${p.name}`}
                errorText={jiraError ?? undefined}
              />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-2">Historias</div>
                <StoryMultiPicker projectKey={jiraProjectKey} selected={stories} onChange={setStories} max={MAX_STORIES} />
              </div>
            </div>

            <div className="space-y-5">
              <TestRailDestinationPicker testRail={testRail} showCaseCount={false} />

              <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">
                    Indicaciones para la IA (opcional)
                  </span>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                    placeholder="Ej.: prioriza validaciones de montos y mensajes de error"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E8EBEC] bg-white text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99] resize-y"
                  />
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 text-[12px] text-[#B4463C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </BentoCard>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => setStep(1)}
            className="text-[12px] font-medium px-4 py-2.5 rounded-full text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5"
          >
            <ChevronLeft size={13} /> Cambiar proyecto
          </button>
          <button
            onClick={submit}
            disabled={Boolean(blockedReason) || submitting}
            title={blockedReason}
            className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Generar escenarios
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
