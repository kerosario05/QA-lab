import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, FileText, Loader2, Sparkles } from 'lucide-react';
import { C } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { jiraProjectsProxy } from '../../services/jira/projects';
import type { JiraProject } from '../../services/jira/types';
import { projectsRefApi, type ProjectRef } from '../../services/identity';
import { testDesignApi, type TestDesignDraftWithStories } from '../../services/test-design';
import { useTestRailDestination } from '../Recording/useTestRailDestination';
import { TestRailDestinationPicker } from '../Recording/TestRailDestinationPicker';
import { StoryMultiPicker, type PickedStory } from './StoryMultiPicker';

/** The engine's default limit (TEST_DESIGN_MAX_STORIES); the engine enforces the real one. */
export const MAX_STORIES = 10;

interface NewDraftFormProps {
  onCancel: () => void;
  onCreated: (draft: TestDesignDraftWithStories) => void;
}

const optionalNumber = (value?: string) => (value ? Number(value) : null);

export function NewDraftForm({ onCancel, onCreated }: NewDraftFormProps) {
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [stories, setStories] = useState<PickedStory[]>([]);
  const [automationProjects, setAutomationProjects] = useState<ProjectRef[]>([]);
  const [projectSlug, setProjectSlug] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testRail = useTestRailDestination(null);

  useEffect(() => {
    jiraProjectsProxy
      .getAll()
      .then(setJiraProjects)
      .catch((err) => setJiraError(err instanceof Error ? err.message : String(err)));
    projectsRefApi
      .list()
      .then((list) => setAutomationProjects(list.filter((p) => p.enabled)))
      .catch(() => setAutomationProjects([]));
  }, []);

  function chooseJiraProject(key: string) {
    if (key === jiraProjectKey) return;
    setJiraProjectKey(key);
    setStories([]);
  }

  const blockedReason = !jiraProjectKey
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
        projectSlug: projectSlug || null,
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
      <div className="max-w-5xl mx-auto">
        <BentoCard className="!p-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Nuevo diseño · Origen y destino</div>
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
              <TestRailDestinationPicker testRail={testRail} />

              <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">
                    Proyecto de automatización (opcional)
                  </span>
                  <select
                    value={projectSlug}
                    onChange={(e) => setProjectSlug(e.target.value)}
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E8EBEC] bg-white text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99]"
                  >
                    <option value="">Ninguno: el borrador solo lo ves tú</option>
                    {automationProjects.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.name}</option>
                    ))}
                  </select>
                  <span className="block mt-1 text-[11px] text-[#8B999D]">
                    Con un proyecto, quienes tengan acceso a él también verán el borrador.
                  </span>
                </label>

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
            onClick={onCancel}
            className="text-[12px] font-medium px-4 py-2.5 rounded-full text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5"
          >
            <ChevronLeft size={13} /> Volver a los borradores
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
      </div>
    </div>
  );
}
