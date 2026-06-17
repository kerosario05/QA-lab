import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, Check, Boxes, GitBranch, Database,
  Layers, Search, Rocket, Loader2, ScanLine, AlertCircle, X, Sparkles,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { projects } from '../../data/mockData';
import { trProjectsProxy, trSectionsProxy, fetchProjectSuites, fetchProjectCaseCount } from '../../services/testrail';
import type { TRSection, TRCase } from '../../services/testrail';
import { jiraProjectsProxy } from '../../services/jira';
import { scenariosProxy, normalizeScenarioPreviewResponse } from '../../services/scenarios';
import type { Story, BlockedScenario } from '../../services/scenarios';
import { runsProxy } from '../../services/runs';
import type { RunPayload } from '../../services/runs';
import type { ActiveRun, TestRailProject, JiraProject, JiraSprint } from '../../types';
import { canContinueFromStep3 } from './step3-launch-gate';

interface TestLaunchProps {
  onLaunch: (run: ActiveRun) => void;
}

interface LaunchConfig {
  automationProject: string;
  source: string;
  jiraProject: string;
  sprint: string;
  status: string;
  testRailProject: string;
  selectedCases: string[];
  runAll: boolean;
}

export function TestLaunch({ onLaunch }: TestLaunchProps) {
  // Normalize TestRail project name to appSlug for automation framework
  const normalizeAppSlug = (name: string): string =>
    name
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<LaunchConfig>({
    automationProject: '', source: 'both', jiraProject: '', sprint: '',
    status: 'Desestimado', testRailProject: '', selectedCases: [], runAll: false,
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // ── TestRail project state ───────────────────────────────────
  const [trProjects, setTrProjects] = useState<TestRailProject[]>([]);
  const [trLoading, setTrLoading] = useState(false);
  const [trError, setTrError] = useState<string | null>(null);
  const [trDropdownOpen, setTrDropdownOpen] = useState(false);
  const [trSearch, setTrSearch] = useState('');
  const [trDropdownPos, setTrDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const trTriggerRef = useRef<HTMLButtonElement>(null);
  const trPanelRef = useRef<HTMLDivElement>(null);

  // ── TestRail sections state ──────────────────────────────────
  const [trSections, setTrSections] = useState<TRSection[]>([]);
  const [trSectionsLoading, setTrSectionsLoading] = useState(false);
  const [trSectionsError, setTrSectionsError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<TRSection | null>(null);
  const [trSectionDropdownOpen, setTrSectionDropdownOpen] = useState(false);
  const [trSectionSearch, setTrSectionSearch] = useState('');
  const [trSectionDropdownPos, setTrSectionDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const trSectionTriggerRef = useRef<HTMLButtonElement>(null);
  const trSectionPanelRef = useRef<HTMLDivElement>(null);

  // ── Resolve first suite ID for selected TR project ───────────
  const [trSuiteId, setTrSuiteId] = useState<number | null>(null);
  useEffect(() => {
    if (!config.testRailProject) {
      setTrSuiteId(null);
      setTrTotalCaseCount(0);
      return;
    }
    const project = trProjects.find(p => String(p.id) === config.testRailProject);
    const first = project?.suites?.[0];
    if (first) {
      setTrSuiteId(first.id);
      return;
    }
    const projectId = Number(config.testRailProject);
    fetchProjectSuites(projectId)
      .then(suites => {
        const s = suites[0];
        if (s) setTrSuiteId(s.id);
        else setTrSuiteId(null);
      })
      .catch(() => setTrSuiteId(null));
  }, [config.testRailProject, trProjects]);

  // ── Fetch total case count for selected TR project+suite ─────
  useEffect(() => {
    if (!config.testRailProject || !trSuiteId) {
      setTrTotalCaseCount(0);
      return;
    }
    const projectId = Number(config.testRailProject);
    const suiteId = trSuiteId;
    fetchProjectCaseCount(projectId, suiteId)
      .then(count => setTrTotalCaseCount(count))
      .catch(() => {
        console.warn('[testrail-count] failed to load case count', { projectId, suiteId });
      });
  }, [config.testRailProject, trSuiteId]);

  // ── TestRail cases state (tab 2) ─────────────────────────────
  const [trCases, setTrCases] = useState<TRCase[]>([]);
  const [trCasesLoading, setTrCasesLoading] = useState(false);
  const [trCasesError, setTrCasesError] = useState<string | null>(null);
  const [selectedTrCaseIds, setSelectedTrCaseIds] = useState<number[]>([]);
  const [expandedCaseId, setExpandedCaseId] = useState<number | null>(null);
  const [trTotalCaseCount, setTrTotalCaseCount] = useState(0);

  // ── Step 3 tab ───────────────────────────────────────────────
  const [step3Tab, setStep3Tab] = useState<'scenarios' | 'cases'>('scenarios');

  // ── Jira state ───────────────────────────────────────────────
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraDropdownOpen, setJiraDropdownOpen] = useState(false);
  const [jiraSearch, setJiraSearch] = useState('');
  const [jiraDropdownPos, setJiraDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const jiraTriggerRef = useRef<HTMLButtonElement>(null);
  const jiraPanelRef = useRef<HTMLDivElement>(null);
  const [activeSprint, setActiveSprint] = useState<JiraSprint | null>(null);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintError, setSprintError] = useState<string | null>(null);

  // ── Stories state (step 3) ───────────────────────────────────
  const [stories, setStories] = useState<Story[]>([]);
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [sprintMeta, setSprintMeta] = useState<{ id: number; name: string } | null>(null);
  const [blockedScenarios, setBlockedScenarios] = useState<BlockedScenario[]>([]);
  // expanded story jiraKeys (story-level accordion)
  const [expandedStories, setExpandedStories] = useState<string[]>([]);
  // expanded scenario step panel: "jiraKey::scenarioIndex"
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  // ── Fetch TestRail projects on mount ─────────────────────────
  useEffect(() => {
    setTrLoading(true);
    trProjectsProxy.getAll()
      .then(data => { setTrProjects(data); setTrError(null); })
      .catch(e => setTrError(e.message))
      .finally(() => setTrLoading(false));
  }, []);

  // ── Fetch Jira projects on mount ─────────────────────────────
  useEffect(() => {
    setJiraLoading(true);
    jiraProjectsProxy.getAll()
      .then(data => { setJiraProjects(data); setJiraError(null); })
      .catch(e => setJiraError(e.message))
      .finally(() => setJiraLoading(false));
  }, []);

  // ── Fetch active sprint when Jira project changes ────────────
  useEffect(() => {
    if (!config.jiraProject) {
      setActiveSprint(null);
      setConfig(c => ({ ...c, sprint: '' }));
      return;
    }
    setSprintLoading(true);
    setSprintError(null);
    jiraProjectsProxy.getActiveSprint(config.jiraProject)
      .then(sprint => {
        setActiveSprint(sprint);
        setConfig(c => ({ ...c, sprint: sprint?.name ?? '' }));
      })
      .catch(e => setSprintError(e.message))
      .finally(() => setSprintLoading(false));
  }, [config.jiraProject]);

  // ── Fetch sections when TR project+suiteId known (cache + 60s silent refresh) ──
  const lastSectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!config.testRailProject || !trSuiteId) {
      if (!config.testRailProject) {
        setTrSections([]);
        setSelectedSection(null);
      }
      return;
    }
    const projectId = Number(config.testRailProject);
    const sectionKey = `${projectId}:${trSuiteId}`;

    if (lastSectionKeyRef.current === sectionKey && trSections.length > 0) {
      return;
    }
    lastSectionKeyRef.current = sectionKey;

    // Initial load — cache hit = instant, miss = network call
    setTrSectionsLoading(true);
    setTrSectionsError(null);
    setSelectedSection(null);
    trSectionsProxy.getSections(projectId, trSuiteId)
      .then(data => { setTrSections(data); setTrSectionsError(null); })
      .catch(e => setTrSectionsError(e.message))
      .finally(() => setTrSectionsLoading(false));

    // Background refresh every 60s — silent, no spinner
    const interval = setInterval(() => {
      if (trSuiteId) {
        trSectionsProxy.getSections(projectId, trSuiteId)
          .then(data => setTrSections(data))
          .catch(() => {});
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [config.testRailProject, trSuiteId]);

  // ── Fetch stories when entering Step 3 ──────────────────────
  useEffect(() => {
    if (step !== 3 || !config.jiraProject || !activeSprint) return;
    setConfig(c => ({ ...c, selectedCases: [] }));
    const sprintId = activeSprint.id;
    console.log('[scenario-preview] request', { projectKey: config.jiraProject, sprintId, activeSprint: !sprintId });
    setStoriesLoading(true);
    setStoriesError(null);
    scenariosProxy.post({
      projectKey: config.jiraProject,
      status: config.status,
      maxResults: 50,
      ...(sprintId ? { sprintId } : { activeSprint: true }),
    })
      .then(data => {
        const normalized = normalizeScenarioPreviewResponse(data);
        setStories(normalized.stories);
        setTotalScenarios(normalized.totalScenarios);
        setSprintMeta(normalized.sprint);
        setBlockedScenarios(normalized.blockedScenarios);
        setExpandedStories(normalized.stories.map(s => s.jiraKey));
      })
      .catch(e => setStoriesError(e.message))
      .finally(() => setStoriesLoading(false));
  }, [step, config.jiraProject, config.status, activeSprint]);

  // ── Fetch TR cases when entering Step 3 ─────────────────────
  useEffect(() => {
    if (step !== 3 || !config.testRailProject || !selectedSection || !trSuiteId) return;
    setSelectedTrCaseIds([]);
    setTrCasesLoading(true);
    setTrCasesError(null);
    trSectionsProxy.getCases(selectedSection.id, Number(config.testRailProject), trSuiteId)
      .then(response => { setTrCases(response.cases ?? []); setTrCasesError(null); })
      .catch(e => setTrCasesError(e.message))
      .finally(() => setTrCasesLoading(false));
  }, [step, config.testRailProject, selectedSection, trSuiteId]);

  // ── Click-outside: close all dropdowns ───────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!trTriggerRef.current?.contains(target) && !trPanelRef.current?.contains(target))
        setTrDropdownOpen(false);
      if (!jiraTriggerRef.current?.contains(target) && !jiraPanelRef.current?.contains(target))
        setJiraDropdownOpen(false);
      if (!trSectionTriggerRef.current?.contains(target) && !trSectionPanelRef.current?.contains(target))
        setTrSectionDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStep2Advance = () => {
    setStep3Tab(config.source === 'testrail' ? 'cases' : 'scenarios');
    setStep(3);
  };

  // ── Helpers for scenario selection keys ──────────────────────
  const scenarioKey = (jiraKey: string, i: number) => `${jiraKey}::${i}`;

  const allScenarioKeys = useMemo(
    () => Array.isArray(stories) ? stories.flatMap(st => st.scenarios.map((_, i) => scenarioKey(st.jiraKey, i))) : [],
    [stories],
  );

  const storyKeys = (story: Story) => story.scenarios.map((_, i) => scenarioKey(story.jiraKey, i));

  const storySelectionState = (story: Story): 'all' | 'partial' | 'none' => {
    const keys = storyKeys(story);
    const count = keys.filter(k => config.selectedCases.includes(k)).length;
    if (count === 0) return 'none';
    if (count === keys.length) return 'all';
    return 'partial';
  };

  const toggleStorySelection = (story: Story) => {
    const keys = storyKeys(story);
    const state = storySelectionState(story);
    setConfig(c => ({
      ...c,
      selectedCases: state === 'all'
        ? c.selectedCases.filter(k => !keys.includes(k))
        : [...c.selectedCases.filter(k => !keys.includes(k)), ...keys],
    }));
  };

  const translateReasonCode = (code: string): string => {
    const translations: Record<string, string> = {
      needs_route_profile: "Falta routeProfile. Configura el perfil de rutas en app.config.json o ejecuta discovery.",
      missing_parent_route: "La ruta padre (listado) no está definida. Agrega visibleControls al routeProfile.",
      missing_intermediate_step: "Faltan pasos intermedios. Agrega intermediates al routeProfile.",
      missing_detail_selection_step: "Falta domainTerm para selección. Agrega domainTerms al routeProfile.",
      unsupported_route_target: "Objetivo de ruta no soportado.",
      ambiguous_route_target: "Objetivo de ruta ambiguo.",
    };
    return translations[code] || "Ruta no respaldada.";
  };

  const openTrDropdown = () => {
    if (trLoading) return;
    if (!trDropdownOpen && trTriggerRef.current) {
      const r = trTriggerRef.current.getBoundingClientRect();
      setTrDropdownPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setTrDropdownOpen(o => !o);
  };

  const openJiraDropdown = () => {
    if (jiraLoading) return;
    if (!jiraDropdownOpen && jiraTriggerRef.current) {
      const r = jiraTriggerRef.current.getBoundingClientRect();
      setJiraDropdownPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setJiraDropdownOpen(o => !o);
  };

  const openTrSectionDropdown = () => {
    if (!trSectionDropdownOpen && trSectionTriggerRef.current) {
      const r = trSectionTriggerRef.current.getBoundingClientRect();
      setTrSectionDropdownPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setTrSectionDropdownOpen(o => !o);
  };

  const currentJira = jiraProjects.find(j => j.key === config.jiraProject);
  const currentTR = trProjects.find(t => String(t.id) === config.testRailProject);

  const filteredTrProjects = useMemo(() => {
    if (!trSearch) return trProjects;
    const s = trSearch.toLowerCase();
    return trProjects.filter(p => p.name.toLowerCase().includes(s));
  }, [trProjects, trSearch]);

  const filteredJiraProjects = useMemo(() => {
    if (!jiraSearch) return jiraProjects;
    const s = jiraSearch.toLowerCase();
    return jiraProjects.filter(p => p.name.toLowerCase().includes(s) || p.key.toLowerCase().includes(s));
  }, [jiraProjects, jiraSearch]);

  const filteredSections = useMemo(() => {
    const sections = Array.isArray(trSections) ? trSections : [];
    if (!trSectionSearch) return sections;
    const s = trSectionSearch.toLowerCase();
    return sections.filter(sec => sec.name.toLowerCase().includes(s));
  }, [trSections, trSectionSearch]);

  const canAdvance = () => {
    if (step === 1) return config.automationProject;
    if (step === 2) {
      if (config.source === 'jira') return config.jiraProject && config.sprint;
      if (config.source === 'testrail') return config.testRailProject;
      return config.jiraProject && config.sprint && config.testRailProject;
    }
    if (step === 3) {
      return canContinueFromStep3({
        storiesLoading,
        storiesError,
        totalScenarios,
        trCasesLoading,
        trCasesError,
        trCasesCount: trCases.length,
        selectedScenarioKeys: config.selectedCases,
        selectedTestRailCaseIds: selectedTrCaseIds,
        source: config.source,
      });
    }
    return true;
  };

  const handleLaunch = async () => {
    const proj = projects.find(p => p.id === config.automationProject);
    const suiteId = trSuiteId ?? undefined;
    const totalSelected = config.selectedCases.length + selectedTrCaseIds.length;
    const runAll = config.runAll || totalSelected === 0;

    // Filtra solo los escenarios seleccionados (o todos si runAll)
    const selectedStories = runAll
      ? stories
      : stories
          .map(st => ({
            ...st,
            scenarios: st.scenarios.filter((_, i) =>
              config.selectedCases.includes(`${st.jiraKey}::${i}`)
            ),
          }))
          .filter(st => st.scenarios.length > 0);

    const existingIds = runAll
      ? trCases.map(c => c.id)
      : selectedTrCaseIds;

    const normalizeSectionSlug = (name: string): string =>
      name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    const sectionNameValue = selectedSection?.name;
    const sectionSlugValue = sectionNameValue ? normalizeSectionSlug(sectionNameValue) : undefined;
    const projectIdValue = Number(config.testRailProject) || 0;

    // ── Client-side validation ──
    if (!projectIdValue) {
      setLaunchError('Selecciona un proyecto TestRail antes de lanzar.');
      return;
    }
    if (!selectedSection?.id) {
      setLaunchError('Selecciona una sección TestRail antes de lanzar.');
      return;
    }
    if (!config.automationProject) {
      setLaunchError('Selecciona un proyecto de automatización (appSlug) antes de lanzar.');
      return;
    }
    if (selectedStories.length === 0 || selectedStories.every((s: any) => !s.scenarios?.length)) {
      setLaunchError('No hay escenarios seleccionados para lanzar.');
      return;
    }

    console.log(`[launch] selectedSection id=${selectedSection.id} name="${sectionNameValue}" slug=${sectionSlugValue}`);
    console.log(`[launch] payload projectId=${projectIdValue} sectionId=${selectedSection.id} appSlug=${config.automationProject} scenarios=${selectedStories.length}`);
    console.log(`[launch] scenarioIds=${selectedStories.map((s: any) => s.jiraKey).join(",")}`);
    console.log(`[launch] firstScenarioSteps=${selectedStories[0]?.scenarios?.[0]?.custom_steps_separated?.length ?? "?"} expectedResultPresent=${Boolean(selectedStories[0]?.scenarios?.[0]?.custom_expected)}`);

    // Construir escenarios seleccionados desde selectedStories con IDs únicos
    let scenarioIndex = 0;
    const selectedScenarios = selectedStories.flatMap((st: any) =>
      (st.scenarios ?? []).map((sc: any) => {
        scenarioIndex++;
        const sid = `LAUNCH-${String(scenarioIndex).padStart(3, "0")}`;
        return {
          scenarioId: sid,
          title: sc.title || `${st.jiraKey} Scenario ${scenarioIndex}`,
          steps: Array.isArray(sc.custom_steps_separated)
            ? sc.custom_steps_separated.map((s: any) => `${s.content}`)
            : (Array.isArray(sc.steps) ? sc.steps : []),
          expectedResult: sc.custom_expected || '',
          preconditions: sc.custom_preconds ? [sc.custom_preconds] : [],
          sourceIssueKey: st.jiraKey,
        };
      })
    );
    console.log(`[launch] scenarioIds=${selectedScenarios.map((s: any) => s.scenarioId).join(",")}`);
    console.log(`[launch] sourceScenarioIds=${selectedScenarios.map((s: any) => s.sourceIssueKey).join(",")}`);

    const launchPayload = {
      appSlug: config.automationProject || '',
      projectId: projectIdValue,
      suiteId: suiteId ?? undefined,
      sectionId: selectedSection.id,
      sectionName: sectionNameValue,
      sectionSlug: sectionSlugValue,
      jiraKey: stories[0]?.jiraKey,
      sprintName: undefined as string | undefined,
      selectedScenarios,
      publishStrategy: 'always_create' as const,
    };

    setIsLaunching(true);
    setLaunchError(null);

    // Fase 1: Publish + TestRun (launch-execution endpoint)
    try {
      const launchResult = await runsProxy.launchExecution(launchPayload);
      if (!launchResult.ok) {
        setLaunchError(launchResult.message || launchResult.error || 'Error al publicar escenarios en TestRail');
        setIsLaunching(false);
        return;
      }
      console.log(`[launch] launch successful launchId=${launchResult.launchId} testRunId=${launchResult.testRunId} cases=${launchResult.publishedCases?.length}`);

      // Fase 2: (futura) discovery job — por ahora solo creamos el job para mantener compatibilidad
      try {
        const runJiraKey = launchPayload.jiraKey || stories[0]?.jiraKey;
        const runPayload: RunPayload = {
          projectId: projectIdValue,
          suiteId: suiteId ?? 0,
          sectionId: selectedSection.id,
          sectionName: sectionNameValue,
          sectionSlug: sectionSlugValue,
          stories: selectedStories,
          existingCaseIds: existingIds,
          launchId: launchResult.launchId,
          testRunId: launchResult.testRunId,
          publishedCases: launchResult.publishedCases?.map(pc => ({
            scenarioId: pc.scenarioId,
            caseId: pc.caseId,
            title: pc.title,
          })),
          jiraKey: runJiraKey,
        };
        console.log(`[launch] create discovery job jiraKey=${runJiraKey} launchId=${launchResult.launchId} testRunId=${launchResult.testRunId}`);
        const { jobId, status } = await runsProxy.create(runPayload);
        const newRun: ActiveRun = {
          id: jobId,
          jobId,
          project: proj?.name || 'Proyecto',
          triggered: 'Carlos M.',
          startedAt: 'Hace 0m',
          progress: 0,
          total: runAll ? (trTotalCaseCount || totalSelected) : totalSelected,
          completed: 0, passed: 0, failed: 0,
          currentTest: '',
          eta: '—',
          status,
        };
        onLaunch(newRun);
      } catch (jobErr: any) {
        // Job creation failed but publish succeeded — still show success
        console.log(`[launch] job creation failed but publish succeeded: ${jobErr.message}`);
        onLaunch({
          id: `launch-${launchResult.launchId}`,
          jobId: `launch-${launchResult.launchId}`,
          project: proj?.name || 'Proyecto',
          triggered: 'Carlos M.',
          startedAt: 'Hace 0m',
          progress: 0,
          total: launchResult.publishedCases?.length || totalSelected,
          completed: launchResult.publishedCases?.length || 0,
          passed: 0, failed: 0,
          currentTest: '',
          eta: '—',
          status: 'test_run_created',
        });
      }
    } catch (e: any) {
      setLaunchError(e.message ?? 'Error al crear la ejecución');
    } finally {
      setIsLaunching(false);
    }
  };

  const steps = [
    { n: 1, label: 'Proyecto', icon: Boxes },
    { n: 2, label: 'Fuentes', icon: GitBranch },
    { n: 3, label: 'Casos', icon: ScanLine },
    { n: 4, label: 'Lanzar', icon: Rocket },
  ];

  const showTrCasesTab = (config.source === 'testrail' || config.source === 'both') && !!selectedSection;
  const showScenariosTab = config.source === 'jira' || config.source === 'both';

  const retryStories = () => {
    if (!activeSprint) return;
    const sprintId = activeSprint.id;
    setStoriesLoading(true);
    setStoriesError(null);
    scenariosProxy.post({
      projectKey: config.jiraProject,
      status: config.status,
      maxResults: 50,
      ...(sprintId ? { sprintId } : { activeSprint: true }),
    })
      .then(data => {
        const normalized = normalizeScenarioPreviewResponse(data);
        setStories(normalized.stories);
        setTotalScenarios(normalized.totalScenarios);
        setSprintMeta(normalized.sprint);
        setBlockedScenarios(normalized.blockedScenarios);
        setExpandedStories(normalized.stories.map(s => s.jiraKey));
      })
      .catch(e => setStoriesError(e.message))
      .finally(() => setStoriesLoading(false));
  };

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      {/* ── Step indicator ── */}
      <div className="mb-5 flex items-center justify-center">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.n;
            const isCompleted = step > s.n;
            return (
              <React.Fragment key={s.n}>
                <button
                  onClick={() => isCompleted && setStep(s.n)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full transition-all',
                    isActive && 'bg-[#1a1f2e] text-white',
                    isCompleted && 'bg-[#48A157] text-white cursor-pointer hover:bg-[#357a42]',
                    !isActive && !isCompleted && 'bg-white border border-[#E8EBEC] text-[#8B999D]'
                  )}
                >
                  {isCompleted ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                  <span className="text-[11px] font-semibold uppercase tracking-wider">{s.label}</span>
                </button>
                {i < steps.length - 1 && (
                  <div className={cn('w-6 h-px transition-all', isCompleted ? 'bg-[#48A157]' : 'bg-[#E8EBEC]')} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">

        {/* ════════════════ STEP 1 ════════════════ */}
        {step === 1 && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso uno · Elige tu lanzadera</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>¿Qué proyecto vamos a correr?</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Selecciona el framework de automatización.</p>
            <div className="grid grid-cols-3 gap-3">
              {projects.map(p => {
                const selected = config.automationProject === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setConfig({ ...config, automationProject: p.id })}
                    className={cn(
                      'text-left p-5 rounded-2xl border-2 transition-all relative overflow-hidden',
                      selected ? 'border-[#1a1f2e] bg-[#1a1f2e] text-white' : 'border-[#E8EBEC] hover:border-[#1a1f2e]/40 bg-white'
                    )}
                  >
                    {selected && <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-20" style={{ background: C.green }} />}
                    <div className="flex items-start justify-between mb-3 relative">
                      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{p.team}</div>
                      {selected && (
                        <div className="w-5 h-5 rounded-full bg-[#48A157] flex items-center justify-center">
                          <Check size={12} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className={cn('text-[18px] font-medium leading-tight', selected ? 'text-white' : 'text-[#1a1f2e]')} style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{p.name}</div>
                    <div className={cn('text-[11px] mt-1', selected ? 'text-white/60' : 'text-[#8B999D]')}>{p.stack}</div>
                    <div className={cn('flex items-center gap-3 mt-4 pt-3 border-t text-[10px]', selected ? 'border-white/15' : 'border-[#E8EBEC]')}>
                      <span className={selected ? 'text-white/70' : 'text-[#58646D]'}>{p.automated} TCs</span>
                      <span className={selected ? 'text-white/30' : 'text-[#BABEC3]'}>·</span>
                      <span className={selected ? 'text-white/70' : 'text-[#58646D]'}>{p.passRate}% pass</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </BentoCard>
        )}

        {/* ════════════════ STEP 2 ════════════════ */}
        {step === 2 && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso dos · Conecta las fuentes</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>¿De dónde vienen los casos?</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Configura las herramientas que alimentarán la ejecución.</p>

            <div className="mb-7">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { v: 'jira', label: 'Solo Jira', desc: 'Tests del sprint activo', icon: GitBranch },
                  { v: 'testrail', label: 'Solo TestRail', desc: 'Suite completa', icon: Database },
                  { v: 'both', label: 'Ambos combinados', desc: 'Máxima cobertura', icon: Layers },
                ].map(opt => {
                  const Ic = opt.icon;
                  const active = config.source === opt.v;
                  return (
                    <button key={opt.v} onClick={() => setConfig({ ...config, source: opt.v })}
                      className={cn('text-left p-4 rounded-2xl border-2 transition-all', active ? 'border-[#48A157] bg-[#48A157]/5' : 'border-[#E8EBEC] hover:border-[#BABEC3]')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Ic size={18} className={active ? 'text-[#48A157]' : 'text-[#58646D]'} />
                        {active && <div className="w-2 h-2 rounded-full bg-[#48A157] animate-pulse" />}
                      </div>
                      <div className="text-[13px] font-semibold text-[#1a1f2e]">{opt.label}</div>
                      <div className="text-[11px] text-[#8B999D] mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">

              {/* ── Jira panel ── */}
              {(config.source === 'jira' || config.source === 'both') && (
                <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0052CC] flex items-center justify-center"><GitBranch size={15} className="text-white" /></div>
                    <div className="text-[14px] font-semibold text-[#1a1f2e]">Jira</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Proyecto</label>
                    <div className="relative">
                      <button ref={jiraTriggerRef} type="button" onClick={openJiraDropdown} disabled={jiraLoading}
                        className={cn('w-full flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 text-left transition-all',
                          jiraDropdownOpen ? 'border-[#104B99] ring-4 ring-[#104B99]/10' : 'border-[#E8EBEC] hover:border-[#BABEC3]',
                          jiraLoading && 'opacity-60 cursor-wait')}
                      >
                        <span className={cn('text-[13px] truncate', currentJira ? 'font-medium text-[#1a1f2e]' : 'text-[#8B999D]')}>
                          {jiraLoading ? 'Cargando proyectos...' : (currentJira ? `${currentJira.key} · ${currentJira.name}` : 'Selecciona un proyecto...')}
                        </span>
                        <div className="flex-shrink-0 ml-2">
                          {jiraLoading ? <Loader2 size={14} className="text-[#104B99] animate-spin" /> : <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', jiraDropdownOpen && 'rotate-180')} />}
                        </div>
                      </button>
                      {jiraDropdownOpen && jiraDropdownPos && createPortal(
                        <div ref={jiraPanelRef} style={{ position: 'fixed', top: jiraDropdownPos.top, left: jiraDropdownPos.left, width: jiraDropdownPos.width }}
                          className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(16,75,153,0.22)] z-[9999] overflow-hidden">
                          <div className="p-2 border-b border-[#F4F1EA]">
                            <div className="relative">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                              <input autoFocus placeholder="Buscar proyecto o clave..." value={jiraSearch} onChange={e => setJiraSearch(e.target.value)}
                                className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]" />
                              {jiraSearch && <button onClick={() => setJiraSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]"><X size={12} /></button>}
                            </div>
                            <div className="text-[10px] text-[#8B999D] mt-1.5 px-0.5">{filteredJiraProjects.length} de {jiraProjects.length} proyectos</div>
                          </div>
                          <div className="max-h-[220px] overflow-y-auto">
                            {filteredJiraProjects.length === 0 ? (
                              <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">Sin resultados para "{jiraSearch}"</div>
                            ) : filteredJiraProjects.map(j => {
                              const isSel = j.key === config.jiraProject;
                              return (
                                <button key={j.key} type="button"
                                  onClick={() => { setConfig(c => ({ ...c, jiraProject: j.key, sprint: '' })); setJiraDropdownOpen(false); setJiraSearch(''); }}
                                  className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0', isSel ? 'bg-[#104B99]/5' : 'hover:bg-[#FAFAF7]')}
                                >
                                  <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#104B99] bg-[#104B99]' : 'border-[#E8EBEC]')}>
                                    {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-[#8B999D] w-10 flex-shrink-0">{j.key}</span>
                                  <span className={cn('text-[12px] truncate flex-1', isSel ? 'font-semibold text-[#104B99]' : 'font-medium text-[#1a1f2e]')}>{j.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>, document.body,
                      )}
                    </div>
                    {jiraError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> No se pudo conectar con Jira</div>}
                  </div>

                  {config.jiraProject && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Sprint activo</label>
                      {sprintLoading && (
                        <div className="flex items-center gap-2 text-[12px] text-[#8B999D] bg-white rounded-xl px-3 py-3 border border-[#E8EBEC]">
                          <Loader2 size={13} className="animate-spin text-[#104B99]" /> Cargando sprint...
                        </div>
                      )}
                      {!sprintLoading && activeSprint && (
                        <div className="bg-white rounded-xl border border-[#104B99]/20 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#48A157] animate-pulse flex-shrink-0" />
                            <span className="text-[13px] font-semibold text-[#1a1f2e] truncate">{activeSprint.name}</span>
                          </div>
                          {(activeSprint.startDate || activeSprint.endDate) && (
                            <div className="flex items-center gap-3 text-[10px] text-[#8B999D] font-mono">
                              {activeSprint.startDate && <span>Inicio: {activeSprint.startDate.slice(0, 10)}</span>}
                              {activeSprint.endDate && <span>Fin: {activeSprint.endDate.slice(0, 10)}</span>}
                            </div>
                          )}
                          {activeSprint.goal && <div className="text-[11px] text-[#58646D] leading-snug italic">"{activeSprint.goal}"</div>}
                        </div>
                      )}
                      {!sprintLoading && !activeSprint && !sprintError && (
                        <div className="text-[11px] text-[#8B999D] bg-white rounded-xl px-3 py-2.5 border border-[#E8EBEC]">Este proyecto no tiene un sprint activo</div>
                      )}
                      {sprintError && <div className="flex items-center gap-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> No se pudo obtener el sprint</div>}
                    </div>
                  )}

                  {config.jiraProject && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Filtro de estado</label>
                      <select value={config.status} onChange={e => setConfig(c => ({ ...c, status: e.target.value }))}
                        className="w-full bg-white border border-[#E8EBEC] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#104B99] focus:ring-4 focus:ring-[#104B99]/10">
                        {['Desestimado', 'To Do', 'In Progress', 'Done', 'QA', 'En revisión'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* ── TestRail panel ── */}
              {(config.source === 'testrail' || config.source === 'both') && (
                <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#48A157] flex items-center justify-center"><Database size={15} className="text-white" /></div>
                    <div className="text-[14px] font-semibold text-[#1a1f2e]">TestRail</div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Proyecto</label>
                    <div className="relative">
                      <button ref={trTriggerRef} type="button" onClick={openTrDropdown} disabled={trLoading}
                        className={cn('w-full flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 text-left transition-all',
                          trDropdownOpen ? 'border-[#48A157] ring-4 ring-[#48A157]/10' : 'border-[#E8EBEC] hover:border-[#BABEC3]',
                          trLoading && 'opacity-60 cursor-wait')}
                      >
                        <span className={cn('text-[13px] truncate', currentTR ? 'font-medium text-[#1a1f2e]' : 'text-[#8B999D]')}>
                          {trLoading ? 'Cargando proyectos...' : (currentTR?.name ?? 'Selecciona un proyecto...')}
                        </span>
                        <div className="flex-shrink-0 ml-2">
                          {trLoading ? <Loader2 size={14} className="text-[#48A157] animate-spin" /> : <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', trDropdownOpen && 'rotate-180')} />}
                        </div>
                      </button>
                      {trDropdownOpen && trDropdownPos && createPortal(
                        <div ref={trPanelRef} style={{ position: 'fixed', top: trDropdownPos.top, left: trDropdownPos.left, width: trDropdownPos.width }}
                          className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(16,75,153,0.22)] z-[9999] overflow-hidden">
                          <div className="p-2 border-b border-[#F4F1EA]">
                            <div className="relative">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                              <input autoFocus placeholder="Buscar proyecto..." value={trSearch} onChange={e => setTrSearch(e.target.value)}
                                className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]" />
                              {trSearch && <button onClick={() => setTrSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]"><X size={12} /></button>}
                            </div>
                            <div className="text-[10px] text-[#8B999D] mt-1.5 px-0.5">{filteredTrProjects.length} de {trProjects.length} proyectos</div>
                          </div>
                          <div className="max-h-[220px] overflow-y-auto">
                            {filteredTrProjects.length === 0 ? (
                              <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">Sin resultados para "{trSearch}"</div>
                            ) : filteredTrProjects.map(t => {
                              const isSel = String(t.id) === config.testRailProject;
                              return (
                                <button key={t.id} type="button"
                                  onClick={() => {
                                    const appSlug = normalizeAppSlug(t.name);
                                    console.log(`[testrail-select] projectId=${t.id} name="${t.name}" appSlug="${appSlug}"`);
                                    setConfig({ ...config, testRailProject: String(t.id), automationProject: appSlug });
                                    setTrDropdownOpen(false);
                                    setTrSearch('');
                                  }}
                                  className={cn('w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0', isSel ? 'bg-[#48A157]/5' : 'hover:bg-[#FAFAF7]')}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#48A157] bg-[#48A157]' : 'border-[#E8EBEC]')}>
                                      {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                                    </div>
                                    <span className={cn('text-[12px] truncate', isSel ? 'font-semibold text-[#48A157]' : 'font-medium text-[#1a1f2e]')}>{t.name}</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-1.5 py-0.5 rounded flex-shrink-0 ml-2">{t.totalCaseCount} TCs</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>, document.body,
                      )}
                    </div>
                    {trError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> No se pudo conectar con TestRail</div>}
                  </div>

                  {currentTR && (
                    <div className="bg-white rounded-xl p-4 border border-[#E8EBEC]">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Suite ID</div>
                          <div className="text-[24px] font-medium text-[#1a1f2e] mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{trSuiteId ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Test Cases</div>
                          <div className="text-[24px] font-medium text-[#1a1f2e] mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{trTotalCaseCount}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTR && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Sección</label>
                      {trSectionsLoading ? (
                        <div className="flex items-center gap-2 text-[12px] text-[#8B999D] bg-white rounded-xl px-3 py-3 border border-[#E8EBEC]">
                          <Loader2 size={13} className="animate-spin text-[#48A157]" /> Cargando secciones...
                        </div>
                      ) : trSections.length === 0 && !trSectionsError ? (
                        <div className="text-[11px] text-[#8B999D] bg-white rounded-xl px-3 py-2.5 border border-[#E8EBEC]">Este proyecto no tiene secciones disponibles</div>
                      ) : (
                        <div className="relative">
                          <button ref={trSectionTriggerRef} type="button" onClick={openTrSectionDropdown}
                            className={cn('w-full flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 text-left transition-all',
                              trSectionDropdownOpen ? 'border-[#48A157] ring-4 ring-[#48A157]/10' : 'border-[#E8EBEC] hover:border-[#BABEC3]')}
                          >
                            <span className={cn('text-[13px] truncate', selectedSection ? 'font-medium text-[#1a1f2e]' : 'text-[#8B999D]')}>
                              {selectedSection?.name ?? 'Selecciona una sección...'}
                            </span>
                            <ChevronDown size={14} className={cn('text-[#8B999D] flex-shrink-0 ml-2 transition-transform duration-200', trSectionDropdownOpen && 'rotate-180')} />
                          </button>
                          {trSectionDropdownOpen && trSectionDropdownPos && createPortal(
                            <div ref={trSectionPanelRef} style={{ position: 'fixed', top: trSectionDropdownPos.top, left: trSectionDropdownPos.left, width: trSectionDropdownPos.width }}
                              className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(72,161,87,0.22)] z-[9999] overflow-hidden">
                              <div className="p-2 border-b border-[#F4F1EA]">
                                <div className="relative">
                                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                                  <input autoFocus placeholder="Buscar sección..." value={trSectionSearch} onChange={e => setTrSectionSearch(e.target.value)}
                                    className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]" />
                                  {trSectionSearch && <button onClick={() => setTrSectionSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]"><X size={12} /></button>}
                                </div>
                                <div className="text-[10px] text-[#8B999D] mt-1.5 px-0.5">{filteredSections.length} de {trSections.length} secciones</div>
                              </div>
                              <div className="max-h-[220px] overflow-y-auto">
                                {filteredSections.length === 0 ? (
                                  <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">Sin resultados para "{trSectionSearch}"</div>
                                ) : filteredSections.map(sec => {
                                  const isSel = selectedSection?.id === sec.id;
                                  return (
                                    <button key={sec.id} type="button"
                                      onClick={() => { setSelectedSection(sec); setTrSectionDropdownOpen(false); setTrSectionSearch(''); }}
                                      className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0', isSel ? 'bg-[#48A157]/5' : 'hover:bg-[#FAFAF7]')}
                                    >
                                      <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#48A157] bg-[#48A157]' : 'border-[#E8EBEC]')}>
                                        {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                                      </div>
                                      <span className={cn('text-[12px] truncate flex-1', isSel ? 'font-semibold text-[#48A157]' : 'font-medium text-[#1a1f2e]')}>{sec.name}</span>
                                      {sec.depth > 0 && <span className="text-[10px] text-[#8B999D] font-mono bg-[#F4F1EA] px-1.5 py-0.5 rounded flex-shrink-0 ml-auto">niv. {sec.depth}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>, document.body,
                          )}
                        </div>
                      )}
                      {trSectionsError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> No se pudieron cargar las secciones</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </BentoCard>
        )}

        {/* ════════════════ STEP 3 ════════════════ */}
        {step === 3 && (
          <BentoCard className="!p-0 overflow-hidden">

            {/* ── Loading ── */}
            {storiesLoading && (
              <div className="bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 70% 30%, ${C.green}50 0%, transparent 50%)` }} />
                <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold mb-1">Paso tres · Generando escenarios</div>
                  <h2 className="text-[28px] font-medium leading-tight mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{config.jiraProject}</h2>
                  <div className="text-[12px] text-white/60 font-mono mb-6">{sprintMeta?.name ?? activeSprint?.name ?? 'Sprint activo'} · estado: {config.status}</div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-6">
                    <div className="h-full rounded-full relative overflow-hidden" style={{ width: '65%', background: `linear-gradient(90deg, ${C.green}, #5EC470)` }}>
                      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', animation: 'shimmer 1.6s linear infinite' }} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {['Consultando historias del sprint activo...', `Aplicando filtro de estado: ${config.status}`, 'Generando escenarios con IA...'].map((msg, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-[12px]">
                        <Loader2 size={13} className="text-[#5EC470] animate-spin flex-shrink-0" style={{ animationDelay: `${i * 200}ms` }} />
                        <span className="text-white/80">{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {!storiesLoading && storiesError && (
              <div className="p-8">
                <div className="flex items-center gap-3 text-[#E63946] mb-2">
                  <AlertCircle size={18} />
                  <span className="text-[14px] font-semibold">No se pudieron cargar los escenarios</span>
                </div>
                <p className="text-[12px] text-[#8B999D] mb-4">{storiesError}</p>
                <button onClick={retryStories} className="text-[12px] font-semibold text-[#104B99] hover:underline flex items-center gap-1.5">
                  <Loader2 size={12} /> Reintentar
                </button>
              </div>
            )}

            {/* ── Loaded ── */}
            {!storiesLoading && !storiesError && (
              <>
                {/* Header */}
                <div className="p-6 border-b border-[#E8EBEC]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-1">Paso tres · Selecciona los casos</div>

                  {/* Tabs */}
                  {showScenariosTab && showTrCasesTab && (
                    <div className="flex gap-1 mt-3 mb-4 bg-[#F4F1EA] rounded-xl p-1 w-fit">
                      <button onClick={() => setStep3Tab('scenarios')}
                        className={cn('px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all', step3Tab === 'scenarios' ? 'bg-white text-[#104B99] shadow-sm' : 'text-[#8B999D] hover:text-[#1a1f2e]')}>
                        Escenarios Jira
                        {totalScenarios > 0 && <span className="ml-1.5 text-[10px] font-mono bg-[#104B99]/10 text-[#104B99] px-1.5 py-0.5 rounded-full">{totalScenarios}</span>}
                      </button>
                      <button onClick={() => setStep3Tab('cases')}
                        className={cn('px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all', step3Tab === 'cases' ? 'bg-white text-[#48A157] shadow-sm' : 'text-[#8B999D] hover:text-[#1a1f2e]')}>
                        Casos TestRail
                        {trCases.length > 0 && <span className="ml-1.5 text-[10px] font-mono bg-[#48A157]/10 text-[#48A157] px-1.5 py-0.5 rounded-full">{trCases.length}</span>}
                      </button>
                    </div>
                  )}

                  {/* Title + select-all */}
                  <div className="flex items-center justify-between">
                    {(step3Tab === 'scenarios' || !showTrCasesTab) && showScenariosTab ? (
                      <>
                        <div>
                          <h2 className="text-[22px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                            {totalScenarios > 0
                              ? <><span className="text-[#104B99]">{totalScenarios}</span> escenarios · <span className="text-[#58646D] text-[18px]">{stories.length} historias</span></>
                              : blockedScenarios.length > 0
                                ? <><span className="text-[#DC2626]">{blockedScenarios.length}</span> {blockedScenarios.length === 1 ? 'historia bloqueada' : 'historias bloqueadas'}</>
                                : 'Sin escenarios para este filtro'
                            }
                          </h2>
                          {sprintMeta && (
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8B999D]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#48A157] animate-pulse" />
                              {sprintMeta.name} · {config.jiraProject} · estado: {config.status}
                            </div>
                          )}
                        </div>
                        {totalScenarios > 0 && (
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-[#8B999D]">
                              <span className="font-semibold text-[#104B99]">{config.selectedCases.length}</span> de {totalScenarios} seleccionados
                            </span>
                            <button
                              onClick={() => setConfig(c => ({
                                ...c,
                                selectedCases: c.selectedCases.length === allScenarioKeys.length ? [] : allScenarioKeys,
                              }))}
                              className="text-[11px] font-semibold text-[#104B99] hover:underline"
                            >
                              {config.selectedCases.length === allScenarioKeys.length ? 'Limpiar' : 'Seleccionar todos'}
                            </button>
                          </div>
                        )}
                      </>
                    ) : showTrCasesTab ? (
                      <>
                        <div>
                          <h2 className="text-[22px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                            {trCasesLoading ? 'Cargando casos...' : trCases.length > 0 ? <><span className="text-[#48A157]">{trCases.length}</span> casos encontrados</> : 'Sin casos en esta sección'}
                          </h2>
                          {selectedSection && (
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8B999D]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#48A157] animate-pulse" />
                              {currentTR?.name} · {selectedSection.name}
                            </div>
                          )}
                        </div>
                        {trCases.length > 0 && !trCasesLoading && (
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-[#8B999D]">
                              <span className="font-semibold text-[#48A157]">{selectedTrCaseIds.length}</span> de {trCases.length} seleccionados
                            </span>
                            <button onClick={() => setSelectedTrCaseIds(ids => ids.length === trCases.length ? [] : trCases.map(c => c.id))}
                              className="text-[11px] font-semibold text-[#48A157] hover:underline">
                              {selectedTrCaseIds.length === trCases.length ? 'Limpiar' : 'Seleccionar todos'}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <h2 className="text-[22px] font-medium text-[#1a1f2e] leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Selecciona una fuente</h2>
                    )}
                  </div>
                </div>

                {/* ── Tab: Escenarios Jira (historias agrupadas) ── */}
                {(step3Tab === 'scenarios' || !showTrCasesTab) && showScenariosTab && (
                  stories.length === 0 ? (
                    <div className="p-12">
                      {blockedScenarios.length > 0 ? (
                        <div>
                          <div className="text-center mb-6">
                            <div className="text-[13px] text-[#1a1f2e] font-semibold">Se encontraron historias, pero no se pudieron generar escenarios.</div>
                            <div className="text-[12px] text-[#8B999D] mt-1">Las siguientes historias fueron bloqueadas por falta de routeProfile o rutas incompletas:</div>
                          </div>
                          <div className="max-w-2xl mx-auto space-y-3">
                            {blockedScenarios.map(blocked => (
                              <div key={blocked.sourceIssueKey} className="bg-[#FEF2F2] border border-[#FCA5A5]/30 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                  <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[10px] font-mono font-bold text-[#DC2626] bg-[#DC2626]/10 px-2 py-0.5 rounded-full">{blocked.sourceIssueKey}</span>
                                      <span className="text-[12px] font-semibold text-[#1a1f2e] truncate">{blocked.title}</span>
                                    </div>
                                    <div className="text-[11px] text-[#7C2D12] leading-relaxed">{translateReasonCode(blocked.reasonCode)}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="text-[13px] text-[#8B999D]">No hay escenarios con estado "{config.status}" en el sprint activo.</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="max-h-[520px] overflow-y-auto divide-y divide-[#F4F1EA]">
                      {stories.map(story => {
                        const isStoryExpanded = expandedStories.includes(story.jiraKey);
                        const selState = storySelectionState(story);

                        return (
                          <div key={story.jiraKey}>
                            {/* ── Story header row ── */}
                            <div className={cn(
                              'flex items-center gap-3 px-6 py-3 bg-[#FAFAF9] border-b border-[#F4F1EA]',
                              selState !== 'none' && 'bg-[#104B99]/3',
                            )}>
                              {/* Story checkbox */}
                              <button
                                type="button"
                                onClick={() => toggleStorySelection(story)}
                                className={cn(
                                  'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                                  selState === 'all' ? 'border-[#104B99] bg-[#104B99]' :
                                  selState === 'partial' ? 'border-[#104B99]' :
                                  'border-[#BABEC3] hover:border-[#104B99]',
                                )}
                              >
                                {selState === 'all' && <Check size={10} className="text-white" strokeWidth={3} />}
                                {selState === 'partial' && <div className="w-1.5 h-0.5 bg-[#104B99] rounded-full" />}
                              </button>

                              {/* Jira key badge */}
                              <span className={cn(
                                'inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0',
                                selState !== 'none' ? 'bg-[#104B99] text-white' : 'bg-[#E8EBEC] text-[#58646D]',
                              )}>
                                {story.jiraKey}
                              </span>

                              {/* Story title */}
                              <span className="flex-1 text-[13px] font-semibold text-[#1a1f2e] truncate">{story.title}</span>

                              {/* Story type badge */}
                              {story.storyType && (
                                <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider text-[#0891B2] bg-[#0891B2]/8 px-2 py-0.5 rounded-full flex-shrink-0">
                                  {story.storyType}
                                </span>
                              )}

                              {/* AI badge */}
                              {story.generatedByAi && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[#7C3AED] bg-[#7C3AED]/8 px-2 py-0.5 rounded-full flex-shrink-0">
                                  <Sparkles size={9} /> IA
                                </span>
                              )}

                              {/* Scenario count */}
                              <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-2 py-0.5 rounded flex-shrink-0">
                                {story.scenarioCount} esc.
                              </span>

                              {/* Expand toggle */}
                              <button
                                type="button"
                                onClick={() => setExpandedStories(prev =>
                                  prev.includes(story.jiraKey) ? prev.filter(k => k !== story.jiraKey) : [...prev, story.jiraKey]
                                )}
                                className="p-1 rounded-full hover:bg-[#E8EBEC] transition-colors flex-shrink-0"
                              >
                                <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', isStoryExpanded && 'rotate-180')} />
                              </button>
                            </div>

                            {/* ── Scenario rows ── */}
                            {isStoryExpanded && story.scenarios.map((sc, i) => {
                              const key = scenarioKey(story.jiraKey, i);
                              const isSelected = config.selectedCases.includes(key);
                              const isExpanded = expandedScenario === key;
                              const hasDetail = !!(sc.custom_preconds || sc.custom_steps_separated?.length || sc.custom_expected);

                              return (
                                <div key={key} className={cn(isSelected ? 'bg-[#104B99]/4' : 'bg-white')}>
                                  <div className="flex items-center gap-3 pl-14 pr-6 py-3">
                                    {/* Scenario checkbox */}
                                    <button
                                      type="button"
                                      onClick={() => setConfig(c => ({
                                        ...c,
                                        selectedCases: isSelected ? c.selectedCases.filter(k => k !== key) : [...c.selectedCases, key],
                                      }))}
                                      className={cn(
                                        'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                                        isSelected ? 'border-[#104B99] bg-[#104B99]' : 'border-[#BABEC3] hover:border-[#104B99]',
                                      )}
                                    >
                                      {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                                    </button>

                                    {/* Scenario title */}
                                    <button
                                      type="button"
                                      onClick={() => hasDetail && setExpandedScenario(isExpanded ? null : key)}
                                      className="flex-1 text-left min-w-0"
                                    >
                                      <span className={cn('text-[12px] truncate block', isSelected ? 'font-semibold text-[#1a1f2e]' : 'font-medium text-[#1a1f2e]')}>
                                        {sc.title}
                                      </span>
                                    </button>

                                    {/* Step count + expand */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {sc.custom_steps_separated?.length > 0 && (
                                        <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-2 py-0.5 rounded">
                                          {sc.custom_steps_separated.length} pasos
                                        </span>
                                      )}
                                      {hasDetail && (
                                        <button type="button" onClick={() => setExpandedScenario(isExpanded ? null : key)} className="p-1 rounded-full hover:bg-[#E8EBEC] transition-colors">
                                          <ChevronDown size={13} className={cn('text-[#8B999D] transition-transform duration-200', isExpanded && 'rotate-180')} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* ── Expanded panel ── */}
                                  {isExpanded && hasDetail && (
                                    <div className="pl-14 pr-6 pb-4">
                                      <div className="bg-[#0d1119] rounded-xl overflow-hidden border border-[#1a1f2e]/20">
                                        {/* Panel header */}
                                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#5EC470]" />
                                          <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                                            {story.jiraKey} · {sc.custom_steps_separated?.length ?? 0} pasos
                                          </span>
                                          {sc.custom_preconds && <span className="ml-auto text-[10px] text-[#F4A261]/70 font-mono">con precondiciones</span>}
                                        </div>
                                        {/* Preconditions */}
                                        {sc.custom_preconds && (
                                          <div className="px-4 py-2.5 border-b border-white/10 bg-[#F4A261]/5">
                                            <div className="text-[9px] uppercase tracking-wider text-[#F4A261]/70 mb-1.5">Precondiciones</div>
                                            <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-wrap">{sc.custom_preconds}</p>
                                          </div>
                                        )}
                                        {/* Steps */}
                                        {sc.custom_steps_separated?.length > 0 && (
                                          <div className="p-4 max-h-[280px] overflow-y-auto space-y-2.5">
                                            {sc.custom_steps_separated.map((s, idx) => (
                                              <div key={idx} className="flex gap-3">
                                                <span className="text-[10px] font-mono text-white/30 flex-shrink-0 w-5 text-right mt-0.5">{idx + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                  <div className="text-[11px] font-mono text-white/75 leading-relaxed">{s.content}</div>
                                                  {s.expected && (
                                                    <div className="text-[10px] font-mono text-[#5EC470]/60 mt-0.5">→ {s.expected}</div>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* Resultado esperado */}
                                        {sc.custom_expected && (
                                          <div className="px-4 py-2.5 border-t border-white/10 bg-[#5EC470]/5">
                                            <div className="text-[9px] uppercase tracking-wider text-[#5EC470]/70 mb-1.5">Resultado esperado</div>
                                            <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-wrap">{sc.custom_expected}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* ── Tab: Casos TestRail ── */}
                {step3Tab === 'cases' && showTrCasesTab && (
                  trCasesLoading ? (
                    <div className="p-8 flex items-center gap-3 text-[#8B999D]">
                      <Loader2 size={16} className="animate-spin text-[#48A157]" />
                      <span className="text-[13px]">Cargando casos de TestRail...</span>
                    </div>
                  ) : trCasesError ? (
                    <div className="p-8">
                      <div className="flex items-center gap-3 text-[#E63946] mb-2"><AlertCircle size={18} /><span className="text-[14px] font-semibold">No se pudieron cargar los casos</span></div>
                      <p className="text-[12px] text-[#8B999D]">{trCasesError}</p>
                    </div>
                  ) : trCases.length === 0 ? (
                    <div className="p-12 text-center"><div className="text-[13px] text-[#8B999D]">No hay casos en la sección "{selectedSection?.name}".</div></div>
                  ) : (
                    <div className="max-h-[520px] overflow-y-auto divide-y divide-[#F4F1EA]">
                      {trCases.map(tc => {
                        const isSelected = selectedTrCaseIds.includes(tc.id);
                        const isExpanded = expandedCaseId === tc.id;
                        const hasDetail = !!(tc.custom_steps || tc.custom_preconds);
                        return (
                          <div key={tc.id} className={cn(isSelected ? 'bg-[#48A157]/4' : '')}>
                            <div className="flex items-center gap-3 px-6 py-3.5">
                              <button type="button" onClick={() => setSelectedTrCaseIds(ids => isSelected ? ids.filter(id => id !== tc.id) : [...ids, tc.id])}
                                className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors', isSelected ? 'border-[#48A157] bg-[#48A157]' : 'border-[#BABEC3] hover:border-[#48A157]')}>
                                {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                              </button>
                              <span className={cn('inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0', isSelected ? 'bg-[#48A157] text-white' : 'bg-[#F4F1EA] text-[#58646D]')}>C{tc.id}</span>
                              <button type="button" onClick={() => hasDetail && setExpandedCaseId(isExpanded ? null : tc.id)} className="flex-1 text-left min-w-0">
                                <span className={cn('text-[13px] truncate block', isSelected ? 'font-semibold text-[#1a1f2e]' : 'font-medium text-[#1a1f2e]')}>{tc.title}</span>
                              </button>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {tc.refs && <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-2 py-0.5 rounded">{tc.refs}</span>}
                                {hasDetail && (
                                  <button type="button" onClick={() => setExpandedCaseId(isExpanded ? null : tc.id)} className="p-1 rounded-full hover:bg-[#E8EBEC] transition-colors">
                                    <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', isExpanded && 'rotate-180')} />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isExpanded && hasDetail && (
                              <div className="px-6 pb-4">
                                <div className="bg-[#0d1119] rounded-xl overflow-hidden border border-[#1a1f2e]/20">
                                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#48A157]" />
                                    <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">C{tc.id} · {tc.title}</span>
                                    {tc.custom_preconds && <span className="ml-auto text-[10px] text-[#F4A261]/70 font-mono">con precondiciones</span>}
                                  </div>
                                  {tc.custom_preconds && (
                                    <div className="px-4 py-2.5 border-b border-white/10 bg-[#F4A261]/5">
                                      <div className="text-[9px] uppercase tracking-wider text-[#F4A261]/70 mb-1.5">Precondiciones</div>
                                      <p className="text-[11px] text-white/60 leading-relaxed font-mono whitespace-pre-wrap">{tc.custom_preconds}</p>
                                    </div>
                                  )}
                                  {tc.custom_steps && (
                                    <div className="p-4 max-h-[280px] overflow-y-auto font-mono text-[11px] text-white/75 leading-relaxed whitespace-pre-wrap">{tc.custom_steps}</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {!showScenariosTab && !showTrCasesTab && (
                  <div className="p-12 text-center">
                    <div className="text-[13px] text-[#8B999D]">Selecciona una sección de TestRail en el paso anterior para ver los casos.</div>
                  </div>
                )}
              </>
            )}
          </BentoCard>
        )}

        {/* ════════════════ STEP 4 ════════════════ */}
        {step === 4 && (
          <BentoCard className="!p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] text-white p-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 80% 20%, ${C.green}50 0%, transparent 50%), radial-gradient(circle at 20% 80%, #ffffff20 0%, transparent 50%)` }} />
              <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
              <div className="absolute right-16 top-16 w-16 h-16 rounded-full border border-white/10" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#5EC470] font-semibold mb-2">Listo para despegar</div>
                <h2 className="text-[40px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  {projects.find(p => p.id === config.automationProject)?.name}
                </h2>
                <div className="text-[12px] text-white/60 mt-2">{projects.find(p => p.id === config.automationProject)?.stack}</div>
                <div className="grid grid-cols-3 gap-6 mt-7 pt-6 border-t border-white/15">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Casos</div>
                    <div className="text-[28px] font-medium mt-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      {config.runAll || (config.selectedCases.length === 0 && selectedTrCaseIds.length === 0) ? 'Todos' : config.selectedCases.length + selectedTrCaseIds.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Tiempo estimado</div>
                    <div className="text-[28px] font-medium mt-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      ~{config.runAll || (config.selectedCases.length === 0 && selectedTrCaseIds.length === 0) ? 12 : Math.max(2, Math.floor((config.selectedCases.length + selectedTrCaseIds.length) * 1.2))}
                      <span className="text-[14px] text-white/60 ml-1">min</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Fuente</div>
                    <div className="text-[18px] font-medium mt-2.5">{config.source === 'jira' ? 'Jira' : config.source === 'testrail' ? 'TestRail' : 'Jira + TestRail'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 space-y-3">
              {config.sprint && (
                <div className="flex items-center justify-between py-3 border-b border-[#F4F1EA]">
                  <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Sprint Jira</span>
                  <span className="text-[13px] font-semibold text-[#1a1f2e]">{config.sprint}</span>
                </div>
              )}
              {currentTR && (
                <div className="flex items-center justify-between py-3 border-b border-[#F4F1EA]">
                  <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Suite TestRail</span>
                  <span className="text-[13px] font-semibold text-[#1a1f2e]">{currentTR.name}</span>
                </div>
              )}
              {selectedSection && (
                <div className="flex items-center justify-between py-3 border-b border-[#F4F1EA]">
                  <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Sección TestRail</span>
                  <span className="text-[13px] font-semibold text-[#1a1f2e]">{selectedSection.name}</span>
                </div>
              )}
              <div className="flex items-start gap-2.5 bg-[#F4F1EA] rounded-2xl p-4 mt-4">
                <div className="text-[11px] text-[#58646D] leading-relaxed">
                  Los resultados se reportarán automáticamente a <strong className="text-[#1a1f2e]">Jira</strong> y <strong className="text-[#1a1f2e]">TestRail</strong>.
                </div>
              </div>
            </div>
          </BentoCard>
        )}

        {/* ── Navigation ── */}
        <div className="mt-5 flex items-center justify-between">
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
            className="text-[12px] font-medium px-4 py-2.5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5">
            <ChevronLeft size={13} /> Atrás
          </button>
          {step < 4 ? (
            <button onClick={() => { if (step === 2) { handleStep2Advance(); return; } if (step === 3 && !canAdvance()) return; setStep(s => Math.min(4, s + 1)); }} disabled={!canAdvance()}
              className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5">
              {step === 2 ? 'Generar escenarios' : 'Continuar'} <ChevronRight size={13} />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              {launchError && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#E63946]">
                  <AlertCircle size={12} /> {launchError}
                </div>
              )}
              <button onClick={handleLaunch} disabled={isLaunching}
                className="bg-gradient-to-r from-[#48A157] to-[#357a42] hover:from-[#5EC470] hover:to-[#48A157] disabled:from-[#BABEC3] disabled:to-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5 shadow-lg shadow-[#48A157]/30 group">
                {isLaunching ? <><Loader2 size={13} className="animate-spin" /> Enviando a ejecución...</> : <><Rocket size={13} className="group-hover:rotate-12 transition" /> Lanzar ejecución</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
