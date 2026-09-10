import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, Check, Boxes, GitBranch, Database,
  Layers, Search, Rocket, Loader2, ScanLine, AlertCircle, X, Sparkles, Package,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { trProjectsProxy, trSectionsProxy, fetchProjectSuites, fetchProjectCaseCount } from '../../services/testrail';
import type { TRSection, TRCase } from '../../services/testrail';
import { jiraProjectsProxy } from '../../services/jira';
import { scenariosProxy, normalizeScenarioPreviewResponse } from '../../services/scenarios';
import type { Story, BlockedScenario } from '../../services/scenarios';
import { runsProxy } from '../../services/runs';
import type { RunPayload } from '../../services/runs';
import { newmanProxy } from '../../services/newman';
import type { NewmanRunPayload, NewmanCollection } from '../../services/newman';
import { mobileProxy } from '../../services/mobile';
import type {
  EmulatorStatus, AppiumStatus, MobileScenario, MobileRejectedScenario,
  MobileScenarioGenerationIssueProgress, MobileScenarioGenerationStatusResponse,
} from '../../services/mobile';
import type { ActiveRun, TestRailProject, JiraProject, JiraSprint } from '../../types';
import { canContinueFromStep3 } from './step3-launch-gate';
import { buildLaunchPayloadScenarios, computeLaunchSelectionSummary, normalizePublishedCasesForDiscovery } from './launch-selection';
import { MobileScenarioSelectionPanel } from './MobileScenarioSelectionPanel';

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
  newmanCollection: string;
}

interface LaunchProjectOption {
  id: string;
  name: string;
  stack: string;
  type: 'web' | 'api' | 'mobile';
}

interface LaunchProjectApiItem {
  slug: string;
  name: string;
  projectType: number;
  status: number;
  enabled: boolean;
}

const LAUNCH_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchLaunchProjects(): Promise<LaunchProjectOption[]> {
  const res = await fetch(`${LAUNCH_API_BASE}/api/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.statusText}`);
  const body = await res.json();
  const items = (Array.isArray(body?.projects) ? body.projects : []) as LaunchProjectApiItem[];
  return items
    .filter(p => p.status === 1 && p.enabled === true)
    .map(p => ({
      id: p.slug,
      name: p.name || p.slug,
      stack: p.projectType === 2 ? 'Mobile · Android' : 'Web · Playwright',
      type: (p.projectType === 2 ? 'mobile' : 'web') as LaunchProjectOption['type'],
    }));
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
    newmanCollection: '',
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchProjects, setLaunchProjects] = useState<LaunchProjectOption[]>([]);
  const [launchProjectsLoading, setLaunchProjectsLoading] = useState(true);
  const [launchProjectsError, setLaunchProjectsError] = useState<string | null>(null);
  const currentProjectType = launchProjects.find(p => p.id === config.automationProject)?.type;

  // ΓöÇΓöÇ TestRail project state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [trProjects, setTrProjects] = useState<TestRailProject[]>([]);
  const [trLoading, setTrLoading] = useState(false);
  const [trError, setTrError] = useState<string | null>(null);
  const [trDropdownOpen, setTrDropdownOpen] = useState(false);
  const [trSearch, setTrSearch] = useState('');
  const [trDropdownPos, setTrDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const trTriggerRef = useRef<HTMLButtonElement>(null);
  const trPanelRef = useRef<HTMLDivElement>(null);

  // ΓöÇΓöÇ TestRail sections state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [trSections, setTrSections] = useState<TRSection[]>([]);
  const [trSectionsLoading, setTrSectionsLoading] = useState(false);
  const [trSectionsError, setTrSectionsError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<TRSection | null>(null);
  const [trSectionDropdownOpen, setTrSectionDropdownOpen] = useState(false);
  const [trSectionSearch, setTrSectionSearch] = useState('');
  const [trSectionDropdownPos, setTrSectionDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const trSectionTriggerRef = useRef<HTMLButtonElement>(null);
  const trSectionPanelRef = useRef<HTMLDivElement>(null);

  // ΓöÇΓöÇ Resolve first suite ID for selected TR project ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

  // ΓöÇΓöÇ Fetch total case count for selected TR project+suite ΓöÇΓöÇΓöÇΓöÇΓöÇ
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

  // ΓöÇΓöÇ TestRail cases state (tab 2) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [trCases, setTrCases] = useState<TRCase[]>([]);
  const [trCasesLoading, setTrCasesLoading] = useState(false);
  const [trCasesError, setTrCasesError] = useState<string | null>(null);
  const [selectedTrCaseIds, setSelectedTrCaseIds] = useState<number[]>([]);
  const [expandedCaseId, setExpandedCaseId] = useState<number | null>(null);
  const [trTotalCaseCount, setTrTotalCaseCount] = useState(0);

  // ΓöÇΓöÇ Step 3 tab ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [step3Tab, setStep3Tab] = useState<'scenarios' | 'cases'>('scenarios');

  // ΓöÇΓöÇ Jira state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

  // ΓöÇΓöÇ Newman state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [newmanCollections, setNewmanCollections] = useState<NewmanCollection[]>([]);
  const [newmanCollLoading, setNewmanCollLoading] = useState(false);
  const [newmanCollError, setNewmanCollError] = useState<string | null>(null);
  const [newmanCollDropdownOpen, setNewmanCollDropdownOpen] = useState(false);
  const [newmanCollDropdownPos, setNewmanCollDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [newmanCollSearch, setNewmanCollSearch] = useState('');
  const newmanCollTriggerRef = useRef<HTMLButtonElement>(null);
  const newmanCollPanelRef = useRef<HTMLDivElement>(null);

  // ΓöÇΓöÇ Stories state (step 3) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [stories, setStories] = useState<Story[]>([]);
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [sprintMeta, setSprintMeta] = useState<{ id: number; name: string } | null>(null);
  const [blockedScenarios, setBlockedScenarios] = useState<BlockedScenario[]>([]);
  const [adaptiveScenarios, setAdaptiveScenarios] = useState<any[]>([]);
  // expanded story jiraKeys (story-level accordion)
  const [expandedStories, setExpandedStories] = useState<string[]>([]);
  // expanded scenario step panel: "jiraKey::scenarioIndex"
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  // ── Mobile state (Android nativo) ──────────────────────────────────────
  const [emulatorStatus, setEmulatorStatus] = useState<EmulatorStatus | null>(null);
  const [emulatorActionLoading, setEmulatorActionLoading] = useState(false);
  const [emulatorError, setEmulatorError] = useState<string | null>(null);
  const [emulatorBootLogs, setEmulatorBootLogs] = useState<{ time: string; msg: string }[]>([]);
  const [appiumStatus, setAppiumStatus] = useState<AppiumStatus | null>(null);

  // Authority for the mobile "Continuar" gate: BOTH infra must be truly ready.
  // emulator ready = running && bootCompleted; appium ready = ready flag.
  const infrastructureReady = !!(emulatorStatus?.running && emulatorStatus?.bootCompleted && appiumStatus?.ready);

  const [mobileScenarios, setMobileScenarios] = useState<MobileScenario[]>([]);
  const [mobileRejected, setMobileRejected] = useState<MobileRejectedScenario[]>([]);
  const [mobileScenariosLoading, setMobileScenariosLoading] = useState(false);
  const [mobileScenariosError, setMobileScenariosError] = useState<string | null>(null);
  const [mobileGenerationNotice, setMobileGenerationNotice] = useState<string | null>(null);
  const [mobileGenerationJobId, setMobileGenerationJobId] = useState<string | null>(null);
  const [mobileGenerationStatus, setMobileGenerationStatus] = useState<'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | null>(null);
  const [mobileGenerationIssueProgress, setMobileGenerationIssueProgress] = useState<MobileScenarioGenerationIssueProgress[]>([]);
  const [selectedMobileScenarioIds, setSelectedMobileScenarioIds] = useState<string[]>([]);
  const [expandedMobileIssueKeys, setExpandedMobileIssueKeys] = useState<string[]>([]);
  // User-edited data values, keyed by scenarioId -> { stepIndex: value }.
  const [mobileDataValues, setMobileDataValues] = useState<Record<string, Record<number, string>>>({});
  // Web: generic dataRequirements values keyed by scenarioKey -> { requirementKey: value }
  const [webDataValues, setWebDataValues] = useState<Record<string, Record<string, string | boolean>>>({});

  const [mobilePublishing, setMobilePublishing] = useState(false);
  const [mobilePublishError, setMobilePublishError] = useState<string | null>(null);
  const [mobileLaunchPhase, setMobileLaunchPhase] = useState<string | null>(null);
  const mobileGenerationPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileGenerationPollTokenRef = useRef(0);
  // Marks that mobile scenario state was restored from localStorage for the current
  // context, so the auto-generate effect does not kick off a new AI generation.
  const mobileHydratedRef = useRef(false);
  // True while rehydration is querying persisted batches; blocks the auto-generate effect
  // until rehydration decides whether new HUs need generation.
  const mobileRehydrationActiveRef = useRef(false);

  type GenerationBatch = { generationJobId: string; issueKeys: string[]; status?: string };
  const [mobileGenerationBatches, setMobileGenerationBatches] = useState<GenerationBatch[]>([]);
  const mobileGenerationBatchesRef = useRef<GenerationBatch[]>([]);
  mobileGenerationBatchesRef.current = mobileGenerationBatches;
  const selectedMobileScenarioIdsRef = useRef<string[]>([]);
  selectedMobileScenarioIdsRef.current = selectedMobileScenarioIds;

  // HUs actuales del sprint activo para proyectos Mobile, obtenidas de Jira de forma read-only
  // (endpoint /api/jira/projects/:key/sprint/:sprintId/issues). NO usa stories ni selectedCases.
  type MobileSprintIssue = { key: string; summary: string };
  const [mobileSprintIssues, setMobileSprintIssues] = useState<MobileSprintIssue[]>([]);
  const mobileSprintCtxRef = useRef<string | null>(null);

  // Autoridad exclusiva de HUs en FUENTES. Para Mobile: HUs actuales del sprint (Jira read-only).
  // Para Web: historias con al menos un escenario marcado en config.selectedCases.
  const currentMobileIssueKeys = useMemo(() => {
    if (currentProjectType === 'mobile') {
      return Array.from(new Set(mobileSprintIssues.map((i) => i.key))).sort();
    }
    const selected = new Set(config.selectedCases.map((k) => k.trim()).filter((k) => k.length > 0));
    const keys = new Set<string>();
    for (const story of stories) {
      const hasSelected = (story.scenarios ?? []).some((_, i) => selected.has(`${story.jiraKey}::${i}`));
      if (hasSelected) keys.add(story.jiraKey);
    }
    return Array.from(keys).sort();
  }, [mobileSprintIssues, currentProjectType, stories, config.selectedCases]);
  const currentMobileIssueKeysRef = useRef<string[]>([]);
  currentMobileIssueKeysRef.current = currentMobileIssueKeys;

  // Mapa key -> summary para resolver el título real de cada HU en el agrupado Mobile.
  const mobileIssueTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of mobileSprintIssues) {
      const s = (issue.summary ?? '').trim();
      if (s) map.set(issue.key, s);
    }
    return map;
  }, [mobileSprintIssues]);

  // HUs ya cubiertas por algún batch (completado, running, pending o failed). Incluye HUs
  // rechazadas o con 0 escenarios: cada batch las registra por su issueKeys.
  const processedMobileIssueKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const b of mobileGenerationBatches) {
      for (const k of b.issueKeys ?? []) keys.add(k);
    }
    return keys;
  }, [mobileGenerationBatches]);

  // HUs con generación en vuelo (batch aún no registrado): evita doble job para la misma HU.
  const [pendingMobileIssueKeys, setPendingMobileIssueKeys] = useState<string[]>([]);
  const pendingMobileIssueKeysSet = useMemo(() => new Set(pendingMobileIssueKeys), [pendingMobileIssueKeys]);

  const missingMobileIssueKeys = useMemo(
    () => currentMobileIssueKeys.filter((k) => !processedMobileIssueKeys.has(k) && !pendingMobileIssueKeysSet.has(k)),
    [currentMobileIssueKeys, processedMobileIssueKeys, pendingMobileIssueKeysSet],
  );

  // Escenarios visibles: solo los de HUs presentes en FUENTES.
  const visibleMobileScenarios = useMemo(() => {
    const current = new Set(currentMobileIssueKeys);
    return mobileScenarios.filter((s) => current.has(s.sourceIssueKey));
  }, [mobileScenarios, currentMobileIssueKeys]);

  // Escenarios para el panel Mobile con el título real de la HU (summary Jira) resuelto.
  const mobileDisplayScenarios = useMemo(
    () => visibleMobileScenarios.map((s) =>
      s.sourceIssueSummary ? s : { ...s, sourceIssueSummary: mobileIssueTitleMap.get(s.sourceIssueKey) ?? s.sourceIssueSummary }
    ),
    [visibleMobileScenarios, mobileIssueTitleMap],
  );

  const mobileStorageKey = config.automationProject ? `qa-lab:mobile:${config.automationProject}` : null;

  const readMobilePersistedState = () => {
    if (!mobileStorageKey) return null;
    try {
      const raw = localStorage.getItem(mobileStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return null;
      let generationBatches: GenerationBatch[] = [];
      if (Array.isArray(parsed.generationBatches)) {
        generationBatches = (parsed.generationBatches as Array<Record<string, unknown>>)
          .filter((b) => b && typeof b.generationJobId === 'string')
          .map((b) => ({
            generationJobId: b.generationJobId as string,
            issueKeys: Array.isArray(b.issueKeys) ? (b.issueKeys as unknown[]).map(String) : [],
            status: typeof b.status === 'string' ? (b.status as string) : undefined,
          }));
      } else if (typeof parsed.generationJobId === 'string') {
        // Legacy single-job: no asumir todas las HU actuales; las issueKeys se completan
        // al recuperar el job desde la metadata de su resultado (rehidratación).
        generationBatches = [{
          generationJobId: parsed.generationJobId as string,
          issueKeys: [],
          status: undefined,
        }];
      }
      const selectedScenarioIds = Array.isArray(parsed.selectedScenarioIds)
        ? (parsed.selectedScenarioIds as unknown[]).map(String)
        : [];
      return {
        appSlug: typeof parsed.appSlug === 'string' ? parsed.appSlug : undefined,
        projectKey: typeof parsed.projectKey === 'string' ? parsed.projectKey : undefined,
        sprintId: typeof parsed.sprintId === 'string' || typeof parsed.sprintId === 'number' ? String(parsed.sprintId) : null,
        generationBatches,
        selectedScenarioIds,
      };
    } catch {
      return null;
    }
  };

  const persistMobileState = (batches: GenerationBatch[], selectedIds: string[]) => {
    if (!mobileStorageKey) return;
    const payload = {
      appSlug: config.automationProject,
      projectKey: config.jiraProject,
      sprintId: activeSprint?.id ?? null,
      generationBatches: batches,
      selectedScenarioIds: selectedIds,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(mobileStorageKey, JSON.stringify(payload));
    } catch {
      /* storage unavailable: persistence is best-effort */
    }
  };

  // ΓöÇΓöÇ Fetch launch projects (GET /api/projects, status=READY && enabled) on mount ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    setLaunchProjectsLoading(true);
    fetchLaunchProjects()
      .then(data => { setLaunchProjects(data); setLaunchProjectsError(null); })
      .catch(e => setLaunchProjectsError(e.message))
      .finally(() => setLaunchProjectsLoading(false));
  }, []);

  // ΓöÇΓöÇ Fetch TestRail projects on mount ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    setTrLoading(true);
    trProjectsProxy.getAll()
      .then(data => { setTrProjects(data); setTrError(null); })
      .catch(e => setTrError(e.message))
      .finally(() => setTrLoading(false));
  }, []);

  // ΓöÇΓöÇ Fetch Jira projects on mount ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    setJiraLoading(true);
    jiraProjectsProxy.getAll()
      .then(data => { setJiraProjects(data); setJiraError(null); })
      .catch(e => setJiraError(e.message))
      .finally(() => setJiraLoading(false));
  }, []);

  // ΓöÇΓöÇ Fetch Newman collections when API project is selected ΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    const proj = launchProjects.find(p => p.id === config.automationProject);
    if (proj?.type !== 'api') return;
    setNewmanCollLoading(true);
    setNewmanCollError(null);
    newmanProxy.getCollections()
      .then(cols => setNewmanCollections(Array.isArray(cols) ? cols : []))
      .catch(e => setNewmanCollError(e.message))
      .finally(() => setNewmanCollLoading(false));
  }, [config.automationProject]);

  // ΓöÇΓöÇ Fetch active sprint when Jira project changes ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

  // ΓöÇΓöÇ Fetch sections when TR project+suiteId known (cache + 60s silent refresh) ΓöÇΓöÇ
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

    // Initial load ΓÇö cache hit = instant, miss = network call
    setTrSectionsLoading(true);
    setTrSectionsError(null);
    setSelectedSection(null);
    trSectionsProxy.getSections(projectId, trSuiteId)
      .then(data => { setTrSections(data); setTrSectionsError(null); })
      .catch(e => setTrSectionsError(e.message))
      .finally(() => setTrSectionsLoading(false));

    // Background refresh every 60s ΓÇö silent, no spinner
    const interval = setInterval(() => {
      if (trSuiteId) {
        trSectionsProxy.getSections(projectId, trSuiteId)
          .then(data => setTrSections(data))
          .catch(() => {});
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [config.testRailProject, trSuiteId]);

  // ΓöÇΓöÇ Fetch stories when entering Step 3 ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    if (step !== 3 || !config.jiraProject || !activeSprint || currentProjectType === 'mobile') return;
    setConfig(c => ({ ...c, selectedCases: [] }));
    const sprintId = activeSprint.id;
    console.log(`[scenario-preview-browser] automationProject=${config.automationProject} appSlug=${config.automationProject || 'undefined'}`);
    setStoriesLoading(true);
    setStoriesError(null);
    scenariosProxy.post({
      projectKey: config.jiraProject,
      status: config.status,
      maxResults: 50,
      appSlug: config.automationProject || undefined,
      ...(sprintId ? { sprintId } : { activeSprint: true }),
    })
      .then(data => {
        for (const _s of (data.stories ?? [])) { for (const _sc of (_s.scenarios ?? [])) { console.log('[scenario-id-trace] FRONTEND_RAW=' + JSON.stringify({ bucket: 'story-scenario', title: _sc?.title ?? '', scenarioId: _sc?.scenarioId ?? '', id: _sc?.id ?? '', sourceIssueKey: _sc?.sourceIssueKey ?? '' })); } }
        for (const _sc of (data.scenarios ?? [])) { console.log('[scenario-id-trace] FRONTEND_RAW=' + JSON.stringify({ bucket: 'flat-scenario', title: _sc?.title ?? '', scenarioId: _sc?.scenarioId ?? '', id: _sc?.id ?? '', sourceIssueKey: _sc?.sourceIssueKey ?? '' })); }
        const normalized = normalizeScenarioPreviewResponse(data);
        for (const _s of normalized.stories) { for (const _sc of (_s.scenarios ?? [])) { console.log('[scenario-id-trace] FRONTEND_NORMALIZED=' + JSON.stringify({ bucket: 'story-scenario', title: _sc?.title ?? '', scenarioId: _sc?.scenarioId ?? '', id: _sc?.id ?? '', sourceIssueKey: _sc?.sourceIssueKey ?? '' })); } }
        setStories(normalized.stories);
        setTotalScenarios(normalized.totalScenarios);
        setSprintMeta(normalized.sprint);
        setBlockedScenarios(normalized.blockedScenarios ?? []);
        setAdaptiveScenarios(normalized.adaptiveScenarios ?? []);
        setExpandedStories(normalized.stories.map(s => s.jiraKey));
      })
      .catch(e => setStoriesError(e.message))
      .finally(() => setStoriesLoading(false));
  }, [step, config.jiraProject, config.status, config.automationProject, activeSprint]);

  // ΓöÇΓöÇ Fetch TR cases when entering Step 3 ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    if (step !== 3 || !config.testRailProject || !selectedSection || !trSuiteId || currentProjectType === 'mobile') return;
    setSelectedTrCaseIds([]);
    setTrCasesLoading(true);
    setTrCasesError(null);
    trSectionsProxy.getCases(selectedSection.id, Number(config.testRailProject), trSuiteId)
      .then(response => { setTrCases(response.cases ?? []); setTrCasesError(null); })
      .catch(e => setTrCasesError(e.message))
      .finally(() => setTrCasesLoading(false));
  }, [step, config.testRailProject, selectedSection, trSuiteId]);

  // ΓöÇΓöÇ Click-outside: close all dropdowns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!trTriggerRef.current?.contains(target) && !trPanelRef.current?.contains(target))
        setTrDropdownOpen(false);
      if (!jiraTriggerRef.current?.contains(target) && !jiraPanelRef.current?.contains(target))
        setJiraDropdownOpen(false);
      if (!trSectionTriggerRef.current?.contains(target) && !trSectionPanelRef.current?.contains(target))
        setTrSectionDropdownOpen(false);
      if (!newmanCollTriggerRef.current?.contains(target) && !newmanCollPanelRef.current?.contains(target))
        setNewmanCollDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Poll emulator + Appium status while on the mobile Emulador step ─────
  useEffect(() => {
    if (step !== 2 || currentProjectType !== 'mobile') return;

    const refresh = () => {
      mobileProxy.getEmulatorStatus().then(setEmulatorStatus).catch(() => {});
      mobileProxy.getAppiumStatus().then(setAppiumStatus).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 4_000);
    return () => clearInterval(interval);
  }, [step, currentProjectType]);

  const handleStartEmulator = () => {
    setEmulatorActionLoading(true);
    setEmulatorError(null);
    setEmulatorBootLogs([]);
    mobileProxy.startEmulator()
      .then(result => {
        if (result.jobId) {
          runsProxy.streamLogs(result.jobId, {
            onLog: entry => setEmulatorBootLogs(prev => [...prev, { time: entry.timestamp ?? '', msg: entry.message }]),
            onStatus: () => {
              mobileProxy.getEmulatorStatus().then(setEmulatorStatus).catch(() => {});
            },
            onDone: () => {
              mobileProxy.getEmulatorStatus().then(setEmulatorStatus).catch(() => {});
            },
            onError: err => setEmulatorError(err.message),
          });
        }
      })
      .catch(e => setEmulatorError(e.message))
      .finally(() => setEmulatorActionLoading(false));
  };

  const handleStopEmulator = () => {
    setEmulatorActionLoading(true);
    setEmulatorError(null);
    mobileProxy.stopEmulator()
      .then(status => setEmulatorStatus(status))
      .catch(e => setEmulatorError(e.message))
      .finally(() => setEmulatorActionLoading(false));
  };

  const stopMobileGenerationPolling = () => {
    mobileGenerationPollTokenRef.current += 1;
    if (mobileGenerationPollTimerRef.current) {
      clearTimeout(mobileGenerationPollTimerRef.current);
      mobileGenerationPollTimerRef.current = null;
    }
  };

  const applyMobileScenarioGenerationResult = (statusResponse: MobileScenarioGenerationStatusResponse) => {
    const incoming = statusResponse.result?.scenarios ?? [];
    const incomingRejected = statusResponse.result?.rejected ?? [];
    // Merge (incremental): conservar escenarios ya generados por otros batches y añadir
    // los nuevos, deduplicando por scenarioId.
    setMobileScenarios(prev => {
      const seen = new Set(prev.map(s => s.scenarioId));
      const merged = [...prev];
      for (const sc of incoming) {
        if (!sc.scenarioId || seen.has(sc.scenarioId)) continue;
        seen.add(sc.scenarioId);
        merged.push(sc);
      }
      return merged;
    });
    setMobileRejected(prev => {
      const seen = new Set(prev.map(r => r.sourceIssueKey ?? r.reason));
      const merged = [...prev];
      for (const r of incomingRejected) {
        const k = r.sourceIssueKey ?? r.reason;
        if (!k || seen.has(k)) continue;
        seen.add(k);
        merged.push(r);
      }
      return merged;
    });
    setExpandedMobileIssueKeys(prev => Array.from(new Set([...prev, ...incoming.map(s => s.sourceIssueKey).filter(Boolean)])));
    setMobileDataValues(prev => {
      const next = { ...prev };
      for (const sc of incoming) {
        if (next[sc.scenarioId]) continue;
        const initial: Record<number, string> = {};
        for (const f of sc.requiredData ?? []) {
          initial[f.stepIndex] = f.kind === 'select'
            ? (f.defaultValue ?? f.options?.[0] ?? f.exampleValue ?? '')
            : (f.exampleValue ?? '');
        }
        next[sc.scenarioId] = initial;
      }
      return next;
    });
    setMobileGenerationIssueProgress(statusResponse.issueProgress ?? []);
  };

  const markMobileBatchStatus = (generationJobId: string, status: string, realIssueKeys?: string[]) => {
    const next = mobileGenerationBatchesRef.current.map(b => {
      if (b.generationJobId !== generationJobId) return b;
      if (status === 'completed' && realIssueKeys?.length) {
        return { ...b, status, issueKeys: realIssueKeys };
      }
      return { ...b, status };
    });
    setMobileGenerationBatches(next);
    persistMobileState(next, selectedMobileScenarioIdsRef.current);
  };

  const pollMobileScenarioGeneration = (generationJobId: string, pollStartedAtMs: number, token: number, consecutiveErrors = 0) => {
    mobileGenerationPollTimerRef.current = setTimeout(async () => {
      if (token !== mobileGenerationPollTokenRef.current) return;
      try {
        const statusResponse = await mobileProxy.getScenarioGenerationStatus(generationJobId);
        if (token !== mobileGenerationPollTokenRef.current) return;
        setMobileGenerationStatus(statusResponse.status);
        setMobileGenerationIssueProgress(statusResponse.issueProgress ?? []);
        setMobileGenerationNotice(null);
        if (statusResponse.status === 'completed') {
          if (!statusResponse.result) {
            setMobileScenariosError('La generación terminó sin resultado recuperable.');
          } else {
            applyMobileScenarioGenerationResult(statusResponse);
            setMobileScenariosError(null);
          }
          markMobileBatchStatus(generationJobId, 'completed', Array.from(new Set([
            ...(statusResponse.issueKeys ?? []),
            ...(statusResponse.result?.scenarios ?? []).map(s => s.sourceIssueKey).filter(Boolean),
            ...(statusResponse.result?.rejected ?? []).map(r => r.sourceIssueKey).filter(Boolean),
          ])));
          setMobileScenariosLoading(false);
          stopMobileGenerationPolling();
          return;
        }
        if (statusResponse.status === 'failed' || statusResponse.status === 'cancelled') {
          setMobileScenariosError(statusResponse.error?.message ?? `La generación terminó con estado ${statusResponse.status}.`);
          markMobileBatchStatus(generationJobId, statusResponse.status);
          setMobileScenariosLoading(false);
          stopMobileGenerationPolling();
          return;
        }
        if (Date.now() - pollStartedAtMs > 15 * 60 * 1000) {
          setMobileScenariosLoading(false);
          setMobileScenariosError('Se agotó el tiempo de seguimiento del job. La generación puede seguir corriendo; usa Reintentar para recuperar su estado.');
          stopMobileGenerationPolling();
          return;
        }
        pollMobileScenarioGeneration(generationJobId, pollStartedAtMs, token, 0);
      } catch (e: any) {
        if (token !== mobileGenerationPollTokenRef.current) return;
        const nextErrors = consecutiveErrors + 1;
        setMobileGenerationNotice(`Conexión temporalmente inestable (${nextErrors}). Reintentando estado del job...`);
        if (Date.now() - pollStartedAtMs > 15 * 60 * 1000) {
          setMobileScenariosLoading(false);
          setMobileScenariosError(`No se pudo seguir consultando el job: ${e?.message ?? 'error de conexión'}`);
          stopMobileGenerationPolling();
          return;
        }
        pollMobileScenarioGeneration(generationJobId, pollStartedAtMs, token, nextErrors);
      }
    }, 2000);
  };

  const handleGenerateMobileScenarios = (missingKeys: string[]) => {
    if (!config.jiraProject || !activeSprint) return;
    if (missingKeys.length === 0) return; // no llamar IA sin HUs pendientes
    const sprintId = activeSprint.id;
    stopMobileGenerationPolling();
    const token = mobileGenerationPollTokenRef.current;
    setMobileScenariosLoading(true);
    setMobileScenariosError(null);
    setMobileGenerationNotice(null);
    // Marcar en vuelo para evitar un segundo job de la misma HU mientras se registra el batch.
    setPendingMobileIssueKeys(prev => Array.from(new Set([...prev, ...missingKeys])));
    // Incremental: solo se generan las HUs nuevas; la selección previa se conserva.
    mobileProxy.startScenarioGeneration({
      projectKey: config.jiraProject,
      status: config.status,
      maxResults: 50,
      appSlug: config.automationProject,
      selectedIssueKeys: missingKeys,
      ...(sprintId ? { sprintId } : { activeSprint: true }),
    })
      .then(startResponse => {
        if (token !== mobileGenerationPollTokenRef.current) return;
        setMobileGenerationJobId(startResponse.generationJobId);
        setMobileGenerationStatus(startResponse.status);
        const newBatch: GenerationBatch = { generationJobId: startResponse.generationJobId, issueKeys: [...missingKeys], status: startResponse.status };
        const updatedBatches = [...mobileGenerationBatchesRef.current, newBatch];
        setMobileGenerationBatches(updatedBatches);
        setPendingMobileIssueKeys(prev => prev.filter(k => !missingKeys.includes(k)));
        persistMobileState(updatedBatches, selectedMobileScenarioIdsRef.current);
        if (startResponse.status === 'failed' || startResponse.status === 'cancelled') {
          setMobileScenariosError(`La generación terminó con estado ${startResponse.status}.`);
          setMobileScenariosLoading(false);
          stopMobileGenerationPolling();
          return undefined;
        }
        if (startResponse.status === 'completed') {
          return mobileProxy.getScenarioGenerationStatus(startResponse.generationJobId).then((statusResponse) => {
            if (token !== mobileGenerationPollTokenRef.current) return;
            applyMobileScenarioGenerationResult(statusResponse);
            markMobileBatchStatus(startResponse.generationJobId, 'completed', Array.from(new Set([
              ...(statusResponse.issueKeys ?? []),
              ...(statusResponse.result?.scenarios ?? []).map(s => s.sourceIssueKey).filter(Boolean),
              ...(statusResponse.result?.rejected ?? []).map(r => r.sourceIssueKey).filter(Boolean),
            ])));
            setMobileScenariosError(null);
            setMobileScenariosLoading(false);
            stopMobileGenerationPolling();
          });
        }
        pollMobileScenarioGeneration(startResponse.generationJobId, Date.now(), token, 0);
        return undefined;
      })
      .catch(e => {
        if (token !== mobileGenerationPollTokenRef.current) return;
        setPendingMobileIssueKeys(prev => prev.filter(k => !missingKeys.includes(k)));
        setMobileScenariosError(e.message);
        setMobileScenariosLoading(false);
      });
  };

  const setMobileFieldValue = (scenarioId: string, stepIndex: number, value: string) => {
    setMobileDataValues(prev => ({
      ...prev,
      [scenarioId]: { ...(prev[scenarioId] ?? {}), [stepIndex]: value },
    }));
  };

  const setWebFieldValue = (scenarioKey: string, requirementKey: string, value: string | boolean) => {
    setWebDataValues(prev => ({
      ...prev,
      [scenarioKey]: { ...(prev[scenarioKey] ?? {}), [requirementKey]: value },
    }));
  };

  // Initialize webDataValues when stories load (preload suggestedValue, keep isolation per scenario)
  useEffect(() => {
    if (stories.length === 0) return;
    setWebDataValues(prev => {
      const next = { ...prev };
      for (const story of stories) {
        for (let i = 0; i < story.scenarios.length; i++) {
          const sc: any = story.scenarios[i] as any;
          const key = scenarioKey(story.jiraKey, i);
          const reqs: any[] = Array.isArray(sc.dataRequirements) ? sc.dataRequirements : [];
          if (reqs.length === 0) continue;
          if (next[key]) continue; // already initialized, preserve user edits
          const init: Record<string, string | boolean> = {};
          for (const r of reqs) {
            if (r.source === 'project_config' || r.source === 'runtime_dynamic' || r.source === 'jit_secret') continue;
            const k = r.key ?? r.label;
            if (!k) continue;
            if (r.suggestedValue !== undefined && r.suggestedValue !== null && String(r.suggestedValue) !== '') {
              if (r.controlType === 'boolean') init[k] = Boolean(r.suggestedValue);
              else init[k] = String(r.suggestedValue);
            } else if (r.controlType === 'boolean') {
              // leave unchecked by default
            }
          }
          if (Object.keys(init).length > 0) next[key] = init;
        }
      }
      return next;
    });
  }, [stories]);

  // ── Cargar HUs del sprint (Jira read-only) para Mobile ──────────────────
  // Fuente de verdad de currentMobileIssueKeys para Mobile. No genera escenarios, no llama IA.
  // Consulta Jira de forma read-only, normaliza/deduplica por key, actualiza mobileSprintIssues
  // y devuelve la colección fresca.
  // Marca cuándo hubo un refresh Jira reciente para evitar doble consulta en step 3→4.
  const mobileSprintFreshRef = useRef<number>(0);
  const refreshMobileSprintIssues = async (): Promise<{ key: string; summary: string }[]> => {
    if (currentProjectType !== 'mobile' || !config.jiraProject || !activeSprint?.id) return [];
    const issues = await jiraProjectsProxy.getSprintIssues(config.jiraProject, activeSprint.id, config.status);
    const seen = new Set<string>();
    const norm: { key: string; summary: string }[] = [];
    for (const i of issues ?? []) {
      const key = String(i?.key ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      norm.push({ key, summary: String(i?.summary ?? '') });
    }
    setMobileSprintIssues(norm);
    mobileSprintCtxRef.current = `${config.jiraProject}:${activeSprint.id}`;
    mobileSprintFreshRef.current = Date.now();
    return norm;
  };

  // Se consulta al entrar al paso FUENTES (step 3) y al entrar a ESCENARIOS (step 4). Evita
  // re-consultar si Continuar acaba de refrescar (fresh < 2s), pero conserva recuperación en
  // step 4 para F5/rehidratación cuando no exista un refresh fresco.
  useEffect(() => {
    const ctxValid = currentProjectType === 'mobile' && !!config.jiraProject && !!activeSprint?.id;
    if (!ctxValid) {
      setMobileSprintIssues([]);
      mobileSprintCtxRef.current = null;
      return;
    }
    const isMobileStep = step === 3 || step === 4;
    if (!isMobileStep) return;
    const ctxKey = `${config.jiraProject}:${activeSprint.id}`;
    const firstForCtx = mobileSprintCtxRef.current !== ctxKey;
    if (firstForCtx) setMobileSprintIssues([]);
    if (!firstForCtx && Date.now() - mobileSprintFreshRef.current < 2000) return; // refresh fresco de Continuar
    let cancelled = false;
    refreshMobileSprintIssues().catch(() => { if (!cancelled) setMobileSprintIssues([]); });
    return () => { cancelled = true; };
  }, [currentProjectType, config.jiraProject, activeSprint?.id, step]);

  // ── Rehidratar estado Mobile persistido al entrar a la etapa de escenarios ──
  // Se ejecuta ANTES del efecto auto-generar: tras un F5 recupera todos los batches
  // persistidos, mergea resultados completados y reutiliza el polling de running/pending.
  useEffect(() => {
    if (step !== 4 || currentProjectType !== 'mobile' || !config.jiraProject || !activeSprint) return;
    if (mobileHydratedRef.current) return; // ya hidratado en esta sesión
    const persisted = readMobilePersistedState();
    if (!persisted || (persisted.generationBatches?.length ?? 0) === 0) return; // nada que recuperar
    // Compatibilidad: mismo app/proyecto y, si ambos conocen sprint, mismo sprint.
    if (persisted.appSlug !== config.automationProject || persisted.projectKey !== config.jiraProject) return;
    if (persisted.sprintId && activeSprint.id && persisted.sprintId !== activeSprint.id) return;
    mobileHydratedRef.current = true;
    mobileRehydrationActiveRef.current = true;
    stopMobileGenerationPolling();
    const token = mobileGenerationPollTokenRef.current;
    setMobileGenerationBatches(persisted.generationBatches);
    setMobileScenariosLoading(true);
    setMobileGenerationNotice(null);
    void (async () => {
      const merged: MobileScenario[] = [];
      const mergedRejected: MobileRejectedScenario[] = [];
      const mergedDataValues: Record<string, Record<number, string>> = {};
      const seenScenario = new Set<string>();
      const seenRejected = new Set<string>();
      const updatedBatches: GenerationBatch[] = [];
      let runningJobId: string | null = null;
      for (const batch of persisted.generationBatches) {
        if (token !== mobileGenerationPollTokenRef.current) return;
        let statusResponse;
        try {
          statusResponse = await mobileProxy.getScenarioGenerationStatus(batch.generationJobId);
        } catch {
          updatedBatches.push(batch); // job inaccesible: se mantiene registrado, sin auto-retry
          continue;
        }
        if (token !== mobileGenerationPollTokenRef.current) return;
        const scenarios = statusResponse.result?.scenarios ?? [];
        const rejected = statusResponse.result?.rejected ?? [];
        if (statusResponse.status === 'completed') {
          // IssueKeys REALES incluidas por el job: el status response las expone (issueKeys) y se
          // complementan con sourceIssueKey de scenarios/rejected. NO se mantienen como processed
          // claves solicitadas que el job realmente no incluyó (ej. filtradas por status Jira).
          const realKeys = Array.from(new Set([
            ...(statusResponse.issueKeys ?? []),
            ...scenarios.map(s => s.sourceIssueKey).filter(Boolean),
            ...rejected.map(r => r.sourceIssueKey).filter(Boolean),
          ]));
          const issueKeys = realKeys.length ? realKeys : batch.issueKeys;
          updatedBatches.push({ generationJobId: batch.generationJobId, issueKeys, status: 'completed' });
          for (const sc of scenarios) {
            if (!sc.scenarioId || seenScenario.has(sc.scenarioId)) continue;
            seenScenario.add(sc.scenarioId);
            merged.push(sc);
            const initial: Record<number, string> = {};
            for (const f of sc.requiredData ?? []) {
              initial[f.stepIndex] = f.kind === 'select'
                ? (f.defaultValue ?? f.options?.[0] ?? f.exampleValue ?? '')
                : (f.exampleValue ?? '');
            }
            mergedDataValues[sc.scenarioId] = initial;
          }
          for (const r of rejected) {
            const k = r.sourceIssueKey ?? r.reason;
            if (!k || seenRejected.has(k)) continue;
            seenRejected.add(k);
            mergedRejected.push(r);
          }
        } else if (statusResponse.status === 'running' || statusResponse.status === 'pending') {
          updatedBatches.push({ ...batch, status: statusResponse.status });
          runningJobId = runningJobId ?? batch.generationJobId;
        } else {
          // failed/cancelled: se mantiene registrado (retry manual en fase posterior).
          updatedBatches.push({ ...batch, status: statusResponse.status });
        }
      }
      if (token !== mobileGenerationPollTokenRef.current) return;
      setMobileScenarios(merged);
      setMobileRejected(mergedRejected);
      setMobileDataValues(mergedDataValues);
      setExpandedMobileIssueKeys(Array.from(new Set(merged.map(s => s.sourceIssueKey))));
      setMobileGenerationBatches(updatedBatches);
      mobileGenerationBatchesRef.current = updatedBatches;
      const existingIds = new Set(merged.map(s => s.scenarioId));
      const restored = (persisted.selectedScenarioIds ?? []).filter(id => existingIds.has(id));
      setSelectedMobileScenarioIds(restored);
      persistMobileState(updatedBatches, restored);
      setMobileScenariosLoading(false);
      // HUs nuevas en FUENTES aún no cubiertas por ningún batch: generarlas.
      const processed = new Set(updatedBatches.flatMap(b => b.issueKeys));
      const missing = currentMobileIssueKeysRef.current.filter(k => !processed.has(k));
      mobileRehydrationActiveRef.current = false;
      if (runningJobId) pollMobileScenarioGeneration(runningJobId, Date.now(), token, 0);
      if (missing.length > 0) handleGenerateMobileScenarios(missing);
    })();
  }, [step, config.jiraProject, config.status, activeSprint, currentProjectType]);

  // ── Auto-generar escenarios mobile al entrar al step "Escenarios" ────────
  useEffect(() => {
    if (step !== 4 || currentProjectType !== 'mobile' || !config.jiraProject || !activeSprint) return;
    if (mobileRehydrationActiveRef.current) return; // rehidratación en curso: ella decide si generar
    handleGenerateMobileScenarios(missingMobileIssueKeys);
  }, [step, config.jiraProject, config.status, activeSprint, currentProjectType, missingMobileIssueKeys]);

  useEffect(() => {
    if (step === 4 && currentProjectType === 'mobile') return;
    stopMobileGenerationPolling();
  }, [step, currentProjectType]);

  useEffect(() => () => stopMobileGenerationPolling(), []);

  const toggleMobileScenario = (scenarioId: string) => {
    setSelectedMobileScenarioIds(prev =>
      prev.includes(scenarioId) ? prev.filter(id => id !== scenarioId) : [...prev, scenarioId]
    );
  };

  // Persistir la selección cuando cambia (solo cuando existe contexto de generación).
  useEffect(() => {
    if (mobileGenerationBatches.length === 0) return;
    persistMobileState(mobileGenerationBatches, selectedMobileScenarioIds);
  }, [selectedMobileScenarioIds, mobileGenerationBatches]);

  // Podar la selección: solo scenarioIds que aún existen y pertenecen a FUENTES.
  useEffect(() => {
    const visibleIds = new Set(visibleMobileScenarios.map(s => s.scenarioId));
    setSelectedMobileScenarioIds(prev => {
      const next = prev.filter(id => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleMobileScenarios]);

  // Cambio de app/proyecto: invalidar hidratación/batches previos para no mezclar proyectos.
  useEffect(() => {
    mobileHydratedRef.current = false;
    mobileGenerationBatchesRef.current = [];
    setMobileGenerationBatches([]);
    setMobileScenarios([]);
    setMobileRejected([]);
    setSelectedMobileScenarioIds([]);
  }, [config.automationProject, config.jiraProject]);

  // Botón único "Ejecutar": publica → (si hace falta) aprende ruta → regenera → publica de
  // nuevo → ejecuta → navega a la pantalla de ejecución. Equivalente mobile del flujo web.
  const handleLaunchMobile = async () => {
    const initialSelected = visibleMobileScenarios.filter(s => selectedMobileScenarioIds.includes(s.scenarioId));
    if (initialSelected.length === 0 || !selectedSection || !config.testRailProject) {
      setMobilePublishError('Selecciona escenarios, sección y proyecto TestRail antes de ejecutar.');
      return;
    }
    const appSlug = config.automationProject;
    const section = selectedSection;
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const publishScenarios = (scs: typeof initialSelected) => mobileProxy.publishToTestRail({
      appSlug,
      projectId: Number(config.testRailProject),
      testrailSectionId: section.id,
      suiteId: trSuiteId ?? undefined,
      jiraKey: scs[0]?.sourceIssueKey,
      publishStrategy: 'always_create',
      scenarios: scs,
    });

    setMobilePublishing(true);
    setMobilePublishError(null);
    try {
      let scenariosToLaunch = initialSelected;

      // 1) Publicar
      setMobileLaunchPhase('Publicando en TestRail…');
      let publish = await publishScenarios(scenariosToLaunch);

      // 2) Si requieren aprendizaje de ruta → aprender → regenerar → re-publicar
      if (publish.status === 'requires_route_learning' || !publish.launchId) {
        setMobileLaunchPhase('Resolviendo configuración del proyecto…');
        const cfg = await mobileProxy.getProjectAppConfig(appSlug);
        const mc = cfg?.mobileConfig ?? null;
        const appPackage = mc?.packageName?.trim();
        const apkPath = mc?.apkPath?.trim();
        if (!appPackage && !apkPath) {
          throw new Error('El proyecto no tiene APK ni package configurado. Configúralo en Configuración.');
        }
        setMobileLaunchPhase('Aprendiendo ruta en el emulador…');
        // Contexto de la HU para la capa interpretativa (IA) del walk + flowId para persistir el flujo.
        const rlScenarios = publish.routeLearningScenarios ?? [];
        const primaryIssueKey = rlScenarios[0]?.sourceIssueKey ?? scenariosToLaunch[0]?.sourceIssueKey;
        const huSummary = scenariosToLaunch.find(s => s.sourceIssueKey === primaryIssueKey)?.sourceIssueSummary
          ?? scenariosToLaunch[0]?.sourceIssueSummary;
        const huIntent = rlScenarios.map(s => s.title).filter(Boolean).slice(0, 6).join('; ');
        const flowId = primaryIssueKey ? primaryIssueKey.toLowerCase() : undefined;
        // Datos que el usuario ingresó en el UI (o los valores de ejemplo) para que el walk
        // cruce los formularios con datos reales — ej. la cédula — en vez de que la IA los invente.
        const learnScreenData: Array<{ match: string; value?: string; selectFirst?: string }> = [];
        const seenFields = new Set<string>();
        for (const s of scenariosToLaunch) {
          for (const f of s.requiredData ?? []) {
            const label = (f.label ?? '').trim();
            if (!label || seenFields.has(label.toLowerCase())) continue;
            const v = mobileDataValues[s.scenarioId]?.[f.stepIndex] ?? f.defaultValue ?? f.exampleValue;
            if (!v) continue;
            seenFields.add(label.toLowerCase());
            learnScreenData.push(f.kind === 'select' ? { match: label, selectFirst: v } : { match: label, value: v });
          }
        }
        const learn = await mobileProxy.startRouteLearning({
          appSlug,
          ...(appPackage ? { appPackage } : { apkPath: apkPath! }),
          ...(flowId && primaryIssueKey ? { flowId, triggerKeywords: [primaryIssueKey] } : {}),
          ...(learnScreenData.length > 0 ? { screenData: learnScreenData } : {}),
          huContext: {
            issueKey: primaryIssueKey,
            summary: huSummary,
            intent: huIntent || huSummary,
          },
        });
        if (!learn.jobId) throw new Error('El aprendizaje de ruta no devolvió jobId.');
        let learnStatus = (learn.status ?? '').toLowerCase();
        while (!['done', 'failed', 'cancelled'].includes(learnStatus)) {
          await sleep(3000);
          const st = await mobileProxy.getRouteLearningStatus(learn.jobId);
          learnStatus = (st.status ?? '').toLowerCase();
          setMobileLaunchPhase(`Aprendiendo ruta… (${learnStatus || 'en curso'})`);
          if (learnStatus === 'failed' || learnStatus === 'cancelled') {
            throw new Error(st.error ?? st.message ?? `El aprendizaje de ruta terminó en ${learnStatus}.`);
          }
        }

        // Regenerar las HUs afectadas para que se materialicen con la ruta aprendida.
        if (!config.jiraProject) throw new Error('Falta el proyecto Jira para regenerar los escenarios.');
        const issueKeys = Array.from(new Set(
          (publish.routeLearningScenarios ?? scenariosToLaunch).map((s: any) => s.sourceIssueKey).filter(Boolean),
        )) as string[];
        setMobileLaunchPhase('Regenerando escenarios…');
        const sprintId = activeSprint?.id;
        const gen = await mobileProxy.startScenarioGeneration({
          projectKey: config.jiraProject,
          status: config.status,
          maxResults: 50,
          appSlug,
          selectedIssueKeys: issueKeys,
          ...(sprintId ? { sprintId } : { activeSprint: true }),
        });
        let genStatus = gen.status;
        while (!['completed', 'failed', 'cancelled'].includes(genStatus)) {
          await sleep(3000);
          const st = await mobileProxy.getScenarioGenerationStatus(gen.generationJobId);
          genStatus = st.status;
          setMobileLaunchPhase(`Regenerando escenarios… (${genStatus})`);
          if (st.status === 'failed' || st.status === 'cancelled') {
            throw new Error(st.error?.message ?? `La regeneración terminó en ${st.status}.`);
          }
        }
        const genResult = await mobileProxy.getScenarioGenerationStatus(gen.generationJobId);
        applyMobileScenarioGenerationResult(genResult);
        const regenerated = (genResult.result?.scenarios ?? []).filter(s => issueKeys.includes(s.sourceIssueKey));
        if (regenerated.length === 0) throw new Error('La regeneración no devolvió escenarios para las HUs.');
        scenariosToLaunch = regenerated;

        setMobileLaunchPhase('Publicando de nuevo…');
        publish = await publishScenarios(scenariosToLaunch);
        if (publish.status === 'requires_route_learning' || !publish.launchId) {
          throw new Error('Tras aprender la ruta y regenerar, los escenarios siguen requiriendo aprendizaje. El flujo puede necesitar más pasos (más pantallas o autenticación).');
        }
      }

      if (!publish.launchId || publish.testRunId == null) {
        throw new Error('La publicación no devolvió launchId/testRunId.');
      }

      // 3) Ejecutar
      setMobileLaunchPhase('Enviando a ejecución…');
      const dataOverrides: Record<string, Record<number, string>> = {};
      for (const s of scenariosToLaunch) {
        const edited = mobileDataValues[s.scenarioId];
        if (!edited) continue;
        for (const f of s.requiredData ?? []) {
          const val = edited[f.stepIndex];
          if (typeof val === 'string' && val.length > 0) {
            if (!dataOverrides[s.scenarioId]) dataOverrides[s.scenarioId] = {};
            dataOverrides[s.scenarioId][f.stepIndex] = val;
          }
        }
      }
      const result = await mobileProxy.executeRun({
        launchId: publish.launchId,
        testRunId: publish.testRunId,
        publishedCases: publish.publishedCases,
        appSlug,
        scenarios: scenariosToLaunch.map(s => ({ scenarioId: s.scenarioId, title: s.title, steps: s.steps, requiredData: s.requiredData })),
        ...(Object.keys(dataOverrides).length > 0 ? { dataOverrides } : {}),
      });

      // 4) Navegar a la pantalla de ejecución
      const newRun: ActiveRun = {
        id: result.jobId,
        jobId: result.jobId,
        project: 'App Conversacional',
        triggered: 'Carlos M.',
        startedAt: 'Hace 0m',
        progress: 0,
        total: scenariosToLaunch.length,
        completed: 0, passed: 0, failed: 0,
        currentTest: '',
        eta: '—',
        status: result.status,
        runType: 'mobile',
        issueKey: result.issueKey ?? scenariosToLaunch[0]?.sourceIssueKey,
        checklistUrl: result.checklistUrl,
      };
      onLaunch(newRun);
    } catch (e: any) {
      setMobilePublishError(e?.message ?? 'Error al ejecutar la prueba mobile.');
    } finally {
      setMobilePublishing(false);
      setMobileLaunchPhase(null);
    }
  };

  const handleStep2Advance = () => {
    const proj = launchProjects.find(p => p.id === config.automationProject);
    if (proj?.type === 'api') {
      setStep(4);
      return;
    }
    if (proj?.type === 'mobile' && !infrastructureReady) {
      return;
    }
    setStep3Tab(config.source === 'testrail' ? 'cases' : 'scenarios');
    setStep(3);
  };

  // Avance desde FUENTES (step 3) para Mobile: refresca Jira read-only ANTES de entrar a
  // ESCENARIOS (step 4), de modo que currentMobileIssueKeys corresponda a la respuesta fresca
  // y la lógica de missing calcule correctamente las HUs nuevas. No inicia IA aquí.
  const handleContinueAdvance = async () => {
    const proj = launchProjects.find(p => p.id === config.automationProject);
    if (step === 2) { handleStep2Advance(); return; }
    if ((step === 3 || step === 4) && !canAdvance()) return;
    if (proj?.type === 'mobile' && step === 3) {
      try {
        await refreshMobileSprintIssues();
      } catch {
        // Si el refresh falla, se conserva la lista previa; se avanza igualmente.
      }
    }
    setStep(s => Math.min(maxStep, s + 1));
  };

  // ΓöÇΓöÇ Helpers for scenario selection keys ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

  const launchSelection = useMemo(() => computeLaunchSelectionSummary({
    stories,
    selectedCaseKeys: config.selectedCases,
    selectedTestRailCaseIds: selectedTrCaseIds,
  }), [stories, config.selectedCases, selectedTrCaseIds]);

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

  // ── Panel Jira (mismo diseño para Kiosko y App Conversacional) ──────────
  const renderJiraPanel = () => (
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
  );

  // ── Panel TestRail (mismo diseño para Kiosko y App Conversacional) ──────
  // onSelectProject: qué pasa al elegir un proyecto TestRail. Kiosko además
  // deriva el appSlug del nombre; App Conversacional lo deja fijo.
  const renderTestRailPanel = (onSelectProject: (project: TestRailProject) => void) => (
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
                      onClick={() => { onSelectProject(t); setTrDropdownOpen(false); setTrSearch(''); }}
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
  );

  const canAdvance = () => {
    if (step === 1) return config.automationProject;
    const selectedProject = launchProjects.find(p => p.id === config.automationProject);
    const isApiProject = selectedProject?.type === 'api';
    const isMobileProject = selectedProject?.type === 'mobile';
    if (step === 2) {
      if (isApiProject) {
        return !!(config.newmanCollection && config.testRailProject && selectedSection);
      }
      if (isMobileProject) {
        return infrastructureReady;
      }
      if (config.source === 'jira') return config.jiraProject && config.sprint;
      if (config.source === 'testrail') return config.testRailProject;
      return config.jiraProject && config.sprint && config.testRailProject;
    }
    if (step === 3) {
      if (isMobileProject) {
        return !!(config.jiraProject && activeSprint && config.testRailProject && selectedSection);
      }
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
    if (step === 4 && isMobileProject) {
      return selectedMobileScenarioIds.length > 0;
    }
    return true;
  };

  const handleNewmanLaunch = async () => {
    const proj = launchProjects.find(p => p.id === config.automationProject);
    if (!config.newmanCollection) { setLaunchError('Selecciona una colección Newman.'); return; }
    if (!config.testRailProject) { setLaunchError('Selecciona un proyecto TestRail.'); return; }
    if (!selectedSection?.id) { setLaunchError('Selecciona una sección TestRail.'); return; }
    if (!trSuiteId) { setLaunchError('No se pudo obtener el suite de TestRail.'); return; }

    setIsLaunching(true);
    setLaunchError(null);

    try {
      const payload: NewmanRunPayload = {
        collection: config.newmanCollection,
        testrailProjectId: Number(config.testRailProject),
        testrailSuiteId: trSuiteId,
        testrailSectionId: selectedSection.id,
        testrailRunName: `Regresión API - ${config.newmanCollection}`,
      };
      const result = await newmanProxy.run(payload);
      if (!result.ok) {
        setLaunchError(result.error || 'Error al lanzar la colección Newman');
        return;
      }
      const collectionTotal = newmanCollections.find(c => c.name === config.newmanCollection)?.requestCount ?? 0;
      const newRun: ActiveRun = {
        id: result.jobId,
        jobId: result.jobId,
        project: proj?.name || 'Portal Cliente',
        runType: 'api',
        collectionName: config.newmanCollection,
        triggered: 'Manual',
        startedAt: new Date().toISOString(),
        progress: 0,
        total: collectionTotal,
        completed: 0, passed: 0, failed: 0,
        currentTest: '',
        eta: 'ΓÇö',
        status: 'running',
      };
      onLaunch(newRun);
    } catch (e: any) {
      setLaunchError(e.message ?? 'Error al lanzar la ejecución Newman');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleLaunch = async () => {
    const proj = launchProjects.find(p => p.id === config.automationProject);
    if (proj?.type === 'api') {
      return handleNewmanLaunch();
    }
    if (proj?.type === 'mobile') {
      // El flujo mobile se lanza desde los botones "Publicar en TestRail" / "Ejecutar en emulador" del Step 4.
      return;
    }
    const suiteId = trSuiteId ?? undefined;
    const selectedStories = launchSelection.selectedStories;
    const selectedGeneratedScenarios = launchSelection.selectedGeneratedScenarios;
    const selectedExistingTestRailCaseIds = launchSelection.existingTestRailCaseIds;
    const totalSelected = launchSelection.totalSelected;

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

    // ΓöÇΓöÇ Client-side validation ΓöÇΓöÇ
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
    if (!launchSelection.hasLaunchableSelection) {
      setLaunchError('No hay escenarios seleccionados para lanzar.');
      return;
    }

    if (selectedTrCaseIds.length > 0 && selectedExistingTestRailCaseIds.length === 0) {
      setLaunchError('Los casos seleccionados de TestRail no tienen caseId válido para lanzar.');
      return;
    }

    console.info('[launch-selection]', {
      jiraSelected: launchSelection.jiraSelectedCount,
      testRailSelected: launchSelection.testRailSelectedCount,
      totalSelected: launchSelection.totalSelected,
      source: launchSelection.sourceLabel,
    });

    console.log(`[launch] selectedSection id=${selectedSection.id} name="${sectionNameValue}" slug=${sectionSlugValue}`);
    console.log(`[launch] payload projectId=${projectIdValue} sectionId=${selectedSection.id} appSlug=${config.automationProject} scenarios=${selectedGeneratedScenarios.length} existingCaseIds=${selectedExistingTestRailCaseIds.length}`);
    console.info('[launch-payload]', {
      selectedScenarios: selectedGeneratedScenarios.length,
      existingTestRailCaseIds: selectedExistingTestRailCaseIds.length,
    });

    const launchPayload: any = {
      appSlug: config.automationProject || '',
      projectId: projectIdValue,
      suiteId: suiteId ?? undefined,
      sectionId: selectedSection.id,
      sectionName: sectionNameValue,
      sectionSlug: sectionSlugValue,
      jiraKey: selectedStories[0]?.jiraKey,
      sprintName: undefined as string | undefined,
      selectedScenarios: buildLaunchPayloadScenarios(selectedGeneratedScenarios),
      existingTestRailCaseIds: selectedExistingTestRailCaseIds,
      adaptiveScenarios: adaptiveScenarios.length > 0 ? adaptiveScenarios : undefined,
      publishStrategy: 'always_create' as const,
    };
    // Web: proyectar valores del formulario a dataOverrides usando requirement.key (aislado por escenario)
    const webDataOverrides: Record<string, Record<string, string>> = {};
    for (const k of config.selectedCases) {
      const vals = (webDataValues as any)[k];
      if (!vals) continue;
      const filtered: Record<string, string> = {};
      for (const [rk, v] of Object.entries(vals)) {
        if (typeof v === 'boolean') filtered[rk] = String(v);
        else if (String(v).trim() !== '') filtered[rk] = String(v);
      }
      if (Object.keys(filtered).length > 0) webDataOverrides[k] = filtered;
    }
    if (Object.keys(webDataOverrides).length > 0) (launchPayload as any).dataOverrides = webDataOverrides;

    setIsLaunching(true);
    setLaunchError(null);

    for (const _sc of (launchPayload.selectedScenarios ?? [])) { console.log('[scenario-id-trace] LAUNCH_HTTP_OUT=' + JSON.stringify({ bucket: 'launch-scenario', title: _sc?.title ?? '', scenarioId: _sc?.scenarioId ?? '', id: _sc?.id ?? '', sourceIssueKey: _sc?.sourceIssueKey ?? '' })); }

    // Fase 1: Publish + TestRun (launch-execution endpoint)
    try {
      const launchResult = await runsProxy.launchExecution(launchPayload);
      if (!launchResult.ok) {
        setLaunchError(launchResult.message || launchResult.error || 'Error al publicar escenarios en TestRail');
        setIsLaunching(false);
        return;
      }
      console.log(`[launch] launch successful launchId=${launchResult.launchId} testRunId=${launchResult.testRunId} cases=${launchResult.publishedCases?.length}`);

      // Fase 2: (futura) discovery job ΓÇö por ahora solo creamos el job para mantener compatibilidad
      try {
        const runJiraKey = launchPayload.jiraKey || selectedStories[0]?.jiraKey;
        const runPayload: any = {
          appSlug: config.automationProject || '',
          projectId: projectIdValue,
          suiteId: suiteId ?? 0,
          sectionId: selectedSection.id,
          sectionName: sectionNameValue,
          sectionSlug: sectionSlugValue,
          stories: selectedStories,
          existingCaseIds: selectedExistingTestRailCaseIds,
          launchId: launchResult.launchId,
          testRunId: launchResult.testRunId,
          publishedCases: normalizePublishedCasesForDiscovery(launchResult.publishedCases),
          jiraKey: runJiraKey,
          ...(Object.keys(webDataOverrides).length > 0 ? { dataOverrides: webDataOverrides } : {}),
        };
        console.log(`[launch] create discovery job jiraKey=${runJiraKey} launchId=${launchResult.launchId} testRunId=${launchResult.testRunId}`);
        const { jobId, status, issueKey, checklistUrl, defectCount } = await runsProxy.create(runPayload);
        const newRun: ActiveRun = {
          id: jobId,
          jobId,
          project: proj?.name || 'Proyecto',
          triggered: 'Carlos M.',
          startedAt: 'Hace 0m',
          progress: 0,
          total: totalSelected,
          completed: 0, passed: 0, failed: 0,
          currentTest: '',
          eta: 'ΓÇö',
          status,
          issueKey,
          checklistUrl,
          defectCount,
        };
        onLaunch(newRun);
      } catch (jobErr: any) {
        // Job creation failed but publish succeeded ΓÇö still show success
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
          eta: 'ΓÇö',
          status: 'test_run_created',
        });
      }
    } catch (e: any) {
      setLaunchError(e.message ?? 'Error al crear la ejecución');
    } finally {
      setIsLaunching(false);
    }
  };

  // ΓöÇΓöÇ Computed: project type ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const selectedProject = launchProjects.find(p => p.id === config.automationProject);
  const isApiProject = selectedProject?.type === 'api';
  const isMobileProject = selectedProject?.type === 'mobile';
  const maxStep = isMobileProject ? 5 : 4;

  // ΓöÇΓöÇ Newman collection dropdown helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const openNewmanCollDropdown = () => {
    if (newmanCollLoading) return;
    if (!newmanCollDropdownOpen && newmanCollTriggerRef.current) {
      const r = newmanCollTriggerRef.current.getBoundingClientRect();
      setNewmanCollDropdownPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setNewmanCollDropdownOpen(o => !o);
  };

  const filteredCollections = useMemo(() => {
    if (!newmanCollSearch) return newmanCollections;
    const s = newmanCollSearch.toLowerCase();
    return newmanCollections.filter(c => c.name.toLowerCase().includes(s));
  }, [newmanCollections, newmanCollSearch]);

  const selectedNewmanCollection = newmanCollections.find(c => c.name === config.newmanCollection) ?? null;

  const steps = isApiProject
    ? [
        { n: 1, label: 'Proyecto', icon: Boxes },
        { n: 2, label: 'Configuración', icon: Package },
        { n: 4, label: 'Lanzar', icon: Rocket },
      ]
    : isMobileProject
    ? [
        { n: 1, label: 'Proyecto', icon: Boxes },
        { n: 2, label: 'Emulador', icon: Layers },
        { n: 3, label: 'Fuentes', icon: GitBranch },
        { n: 4, label: 'Escenarios', icon: ScanLine },
        { n: 5, label: 'Publicar y ejecutar', icon: Rocket },
      ]
    : [
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
      appSlug: config.automationProject || undefined,
      ...(sprintId ? { sprintId } : { activeSprint: true }),
    })
      .then(data => {
        const normalized = normalizeScenarioPreviewResponse(data);
        setStories(normalized.stories);
        setTotalScenarios(normalized.totalScenarios);
        setSprintMeta(normalized.sprint);
        setBlockedScenarios(normalized.blockedScenarios ?? []);
        setAdaptiveScenarios(normalized.adaptiveScenarios ?? []);
        setExpandedStories(normalized.stories.map(s => s.jiraKey));
      })
      .catch(e => setStoriesError(e.message))
      .finally(() => setStoriesLoading(false));
  };

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      {/* ΓöÇΓöÇ Step indicator ΓöÇΓöÇ */}
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

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 1 ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 1 && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso uno · Elige tu lanzadera</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>¿Qué proyecto vamos a correr?</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Selecciona el framework de automatización.</p>
            <div className="grid grid-cols-2 gap-4 max-w-xl">
              {launchProjectsLoading && (
                <>
                  {[0, 1].map(i => (
                    <div key={i} className="h-[120px] rounded-2xl bg-white border border-[#E8EBEC] animate-pulse" />
                  ))}
                </>
              )}
              {!launchProjectsLoading && launchProjectsError && (
                <div className="col-span-2 rounded-xl border border-[#E63946]/30 bg-[#E63946]/5 px-4 py-3 text-[12px] text-[#E63946] flex items-center gap-2">
                  <AlertCircle size={14} /> No se pudieron cargar los proyectos ({launchProjectsError})
                </div>
              )}
              {!launchProjectsLoading && !launchProjectsError && launchProjects.length === 0 && (
                <div className="col-span-2 rounded-xl border border-[#E8EBEC] bg-[#FAFAF7] px-4 py-6 text-center text-[12px] text-[#8B999D]">
                  No hay proyectos listos para ejecutar.
                </div>
              )}
              {!launchProjectsLoading && !launchProjectsError && launchProjects.map(p => {
                const selected = config.automationProject === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setConfig({ ...config, automationProject: p.id, newmanCollection: '', testRailProject: '' })}
                    className={cn(
                      'text-left p-6 rounded-2xl border-2 transition-all relative overflow-hidden',
                      selected ? 'border-[#1a1f2e] bg-[#1a1f2e] text-white' : 'border-[#E8EBEC] hover:border-[#1a1f2e]/40 bg-white'
                    )}
                  >
                    {selected && <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20" style={{ background: C.green }} />}
                    <div className="flex items-start justify-between mb-3 relative">
                      <div className={cn('text-[10px] uppercase tracking-wider font-semibold', selected ? 'text-white/50' : 'text-[#8B999D]')}>
                        {p.type === 'api' ? 'API · Newman' : p.type === 'mobile' ? 'Mobile · Android' : 'Web · Playwright'}
                      </div>
                      {selected && (
                        <div className="w-5 h-5 rounded-full bg-[#48A157] flex items-center justify-center">
                          <Check size={12} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className={cn('text-[22px] font-medium leading-tight', selected ? 'text-white' : 'text-[#1a1f2e]')} style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{p.name}</div>
                    <div className={cn('text-[12px] mt-1.5', selected ? 'text-white/60' : 'text-[#8B999D]')}>{p.stack}</div>
                  </button>
                );
              })}
            </div>
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 2 · API ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 2 && isApiProject && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso dos · Configura la ejecución</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Colección y reporte</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Elige la colección Newman y el destino TestRail.</p>

            <div className="grid grid-cols-2 gap-5">

              {/* ΓöÇΓöÇ Panel Newman ΓöÇΓöÇ */}
              <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#E47E2B] flex items-center justify-center"><Package size={15} className="text-white" /></div>
                  <div className="text-[14px] font-semibold text-[#1a1f2e]">Newman</div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Colección</label>
                  <div className="relative">
                    <button ref={newmanCollTriggerRef} type="button" onClick={openNewmanCollDropdown} disabled={newmanCollLoading}
                      className={cn('w-full flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 text-left transition-all',
                        newmanCollDropdownOpen ? 'border-[#E47E2B] ring-4 ring-[#E47E2B]/10' : 'border-[#E8EBEC] hover:border-[#BABEC3]',
                        newmanCollLoading && 'opacity-60 cursor-wait')}
                    >
                      <span className={cn('text-[13px] truncate', config.newmanCollection ? 'font-medium text-[#1a1f2e]' : 'text-[#8B999D]')}>
                        {newmanCollLoading ? 'Cargando colecciones...' : (config.newmanCollection || 'Selecciona una colección...')}
                      </span>
                      <div className="flex-shrink-0 ml-2">
                        {newmanCollLoading ? <Loader2 size={14} className="text-[#E47E2B] animate-spin" /> : <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', newmanCollDropdownOpen && 'rotate-180')} />}
                      </div>
                    </button>
                    {newmanCollDropdownOpen && newmanCollDropdownPos && createPortal(
                      <div ref={newmanCollPanelRef} style={{ position: 'fixed', top: newmanCollDropdownPos.top, left: newmanCollDropdownPos.left, width: newmanCollDropdownPos.width }}
                        className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(228,126,43,0.22)] z-[9999] overflow-hidden">
                        <div className="p-2 border-b border-[#F4F1EA]">
                          <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                            <input autoFocus placeholder="Buscar colección..." value={newmanCollSearch} onChange={e => setNewmanCollSearch(e.target.value)}
                              className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]" />
                            {newmanCollSearch && <button onClick={() => setNewmanCollSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]"><X size={12} /></button>}
                          </div>
                          <div className="text-[10px] text-[#8B999D] mt-1.5 px-0.5">{filteredCollections.length} de {newmanCollections.length} colecciones</div>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto">
                          {filteredCollections.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">
                              {newmanCollections.length === 0 ? 'No hay colecciones disponibles' : `Sin resultados para "${newmanCollSearch}"`}
                            </div>
                          ) : filteredCollections.map(col => {
                            const isSel = config.newmanCollection === col.name;
                            return (
                              <button key={col.name} type="button"
                                onClick={() => { setConfig(c => ({ ...c, newmanCollection: col.name })); setNewmanCollDropdownOpen(false); setNewmanCollSearch(''); }}
                                className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0', isSel ? 'bg-[#E47E2B]/5' : 'hover:bg-[#FAFAF7]')}
                              >
                                <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#E47E2B] bg-[#E47E2B]' : 'border-[#E8EBEC]')}>
                                  {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                                </div>
                                <span className={cn('text-[12px] truncate flex-1', isSel ? 'font-semibold text-[#E47E2B]' : 'font-medium text-[#1a1f2e]')}>{col.name}</span>
                                {col.requestCount > 0 && (
                                  <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-1.5 py-0.5 rounded flex-shrink-0 ml-2">{col.requestCount} req</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>, document.body,
                    )}
                  </div>
                  {newmanCollError && <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> No se pudieron cargar las colecciones</div>}
                </div>

                {selectedNewmanCollection && (
                  <div className="bg-white rounded-xl p-4 border border-[#E8EBEC]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Endpoints</div>
                      <div className="text-[24px] font-medium text-[#1a1f2e] mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                        {selectedNewmanCollection.requestCount > 0 ? selectedNewmanCollection.requestCount : 'ΓÇö'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ΓöÇΓöÇ Panel TestRail (API mode) ΓöÇΓöÇ */}
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
                        className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(72,161,87,0.22)] z-[9999] overflow-hidden">
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
                                  setConfig(c => ({ ...c, testRailProject: String(t.id) }));
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
                        <div className="text-[24px] font-medium text-[#1a1f2e] mt-0.5" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{trSuiteId ?? 'ΓÇö'}</div>
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
            </div>
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 2 · WEB ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 2 && !isApiProject && !isMobileProject && (
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
              {(config.source === 'jira' || config.source === 'both') && renderJiraPanel()}
              {(config.source === 'testrail' || config.source === 'both') && renderTestRailPanel(t => {
                const appSlug = normalizeAppSlug(t.name);
                console.log(`[testrail-select] projectId=${t.id} name="${t.name}" appSlug="${appSlug}"`);
                setConfig({ ...config, testRailProject: String(t.id) });
              })}
            </div>
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 2 · MOBILE (Emulador) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 2 && isMobileProject && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso dos · Infraestructura</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Emulador Android</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Arranca el emulador y verifica Appium antes de generar escenarios.</p>

            <div className="grid grid-cols-2 gap-5 mb-6">
              <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#1a1f2e] flex items-center justify-center"><Layers size={15} className="text-white" /></div>
                    <div className="text-[14px] font-semibold text-[#1a1f2e]">Emulador</div>
                  </div>
                  <div className={cn('flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full',
                    emulatorStatus?.running ? 'bg-[#48A157]/10 text-[#357a42]' : 'bg-[#E8EBEC] text-[#8B999D]')}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', emulatorStatus?.running ? 'bg-[#48A157]' : 'bg-[#BABEC3]')} />
                    {emulatorStatus?.running ? (emulatorStatus.bootCompleted ? 'Corriendo' : 'Arrancando...') : 'Apagado'}
                  </div>
                </div>
                {emulatorStatus?.avdName && (
                  <div className="text-[11px] text-[#8B999D]">AVD: <span className="font-medium text-[#1a1f2e]">{emulatorStatus.avdName}</span></div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleStartEmulator} disabled={emulatorActionLoading || !!emulatorStatus?.running}
                    className="flex-1 bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-4 py-2 rounded-full transition flex items-center justify-center gap-1.5">
                    {emulatorActionLoading ? <Loader2 size={13} className="animate-spin" /> : null} Iniciar
                  </button>
                  <button onClick={handleStopEmulator} disabled={emulatorActionLoading || !emulatorStatus?.running}
                    className="flex-1 bg-white border border-[#E8EBEC] hover:border-[#1a1f2e]/40 disabled:opacity-40 disabled:cursor-not-allowed text-[#1a1f2e] text-[12px] font-semibold px-4 py-2 rounded-full transition">
                    Detener
                  </button>
                </div>
                {emulatorError && <div className="flex items-center gap-1.5 text-[11px] text-[#E63946]"><AlertCircle size={12} /> {emulatorError}</div>}
              </div>

              <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#58646D] flex items-center justify-center"><Database size={15} className="text-white" /></div>
                    <div className="text-[14px] font-semibold text-[#1a1f2e]">Appium</div>
                  </div>
                  <div className={cn('flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full',
                    appiumStatus?.ready ? 'bg-[#48A157]/10 text-[#357a42]' : 'bg-[#E8EBEC] text-[#8B999D]')}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', appiumStatus?.ready ? 'bg-[#48A157]' : 'bg-[#BABEC3]')} />
                    {appiumStatus?.ready ? 'Listo' : appiumStatus?.running ? 'Iniciando...' : 'Apagado'}
                  </div>
                </div>
                {appiumStatus?.port && (
                  <div className="text-[11px] text-[#8B999D]">Puerto: <span className="font-medium text-[#1a1f2e]">{appiumStatus.port}</span></div>
                )}
                <div className="text-[11px] text-[#8B999D]">Solo lectura — se administra junto con el emulador.</div>
              </div>
            </div>

            {emulatorBootLogs.length > 0 && (
              <div className="bg-[#1a1f2e] rounded-2xl p-4 max-h-[220px] overflow-y-auto font-mono text-[11px] text-white/80 space-y-1">
                {emulatorBootLogs.map((l, i) => (
                  <div key={i}><span className="text-white/40">{l.time}</span> {l.msg}</div>
                ))}
              </div>
            )}
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 3 ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 3 && !isMobileProject && (
          <BentoCard className="!p-0 overflow-hidden">

            {/* ΓöÇΓöÇ Loading ΓöÇΓöÇ */}
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

            {/* ΓöÇΓöÇ Error ΓöÇΓöÇ */}
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

            {/* ΓöÇΓöÇ Loaded ΓöÇΓöÇ */}
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

                {/* ΓöÇΓöÇ Tab: Escenarios Jira (historias agrupadas) ΓöÇΓöÇ */}
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
                            {/* ΓöÇΓöÇ Story header row ΓöÇΓöÇ */}
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

                            {/* ΓöÇΓöÇ Scenario rows ΓöÇΓöÇ */}
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

                                  {/* ΓöÇΓöÇ Expanded panel ΓöÇΓöÇ */}
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
                                        {/* Datos de la prueba - generado dinámicamente desde scenario.dataRequirements */}
                                        {Array.isArray((sc as any).dataRequirements) && (sc as any).dataRequirements.length > 0 && (
                                          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                                            <div className="text-[9px] uppercase tracking-wider text-white/60 mb-2">Datos de la prueba</div>
                                            <div className="space-y-2">
                                              {(sc as any).dataRequirements.map((req: any) => {
                                                const scenarioKeyStr = key;
                                                const currentVal = webDataValues[scenarioKeyStr]?.[req.key] ?? (req.suggestedValue ?? (req.controlType === 'boolean' ? false : ''));
                                                const isSelect = req.controlType === 'select';
                                                const isNumber = req.controlType === 'number';
                                                const isDate = req.controlType === 'date';
                                                const isBoolean = req.controlType === 'boolean';
                                                const opts: string[] = Array.isArray(req.options) ? req.options : [];
                                                const editable = req.editable !== false;
                                                return (
                                                  <div key={`${scenarioKeyStr}-${req.key}`} className="flex flex-col gap-1">
                                                    <label className="text-[11px] font-medium text-white/75 flex items-center gap-1">
                                                      {req.label}
                                                      {req.required && <span className="text-[#F4A261]">*</span>}
                                                    </label>
                                                    {isSelect ? (
                                                      <select
                                                        value={String(currentVal ?? '')}
                                                        onChange={(e) => editable && setWebFieldValue(scenarioKeyStr, req.key, e.target.value)}
                                                        disabled={!editable}
                                                        className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/20 bg-black/30 text-white focus:outline-none focus:border-[#5EC470] disabled:opacity-50"
                                                      >
                                                        <option value="">{req.required ? 'Selecciona...' : '—'}</option>
                                                        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                                      </select>
                                                    ) : isBoolean ? (
                                                      <label className="flex items-center gap-2 text-[11px] text-white/75">
                                                        <input type="checkbox" checked={Boolean(currentVal)} onChange={(e) => editable && setWebFieldValue(scenarioKeyStr, req.key, e.target.checked)} disabled={!editable} className="rounded" />
                                                        {req.label}
                                                      </label>
                                                    ) : (
                                                      <input
                                                        type={isNumber ? 'number' : isDate ? 'date' : 'text'}
                                                        value={String(currentVal ?? '')}
                                                        onChange={(e) => editable && setWebFieldValue(scenarioKeyStr, req.key, e.target.value)}
                                                        placeholder={req.suggestedValue ?? ''}
                                                        disabled={!editable}
                                                        className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/20 bg-black/30 text-white placeholder:text-white/35 focus:outline-none focus:border-[#5EC470] disabled:opacity-50"
                                                      />
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
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
                                                    <div className="text-[10px] font-mono text-[#5EC470]/60 mt-0.5">ΓåÆ {s.expected}</div>
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

                {/* ΓöÇΓöÇ Tab: Casos TestRail ΓöÇΓöÇ */}
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

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 3 · MOBILE (Fuentes) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 3 && isMobileProject && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso tres · Conecta las fuentes</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>¿De dónde vienen los casos?</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Jira genera los escenarios con IA; TestRail es donde se publicarán los casos y el Test Run.</p>

            <div className="grid grid-cols-2 gap-5">
              {renderJiraPanel()}
              {renderTestRailPanel(t => setConfig(c => ({ ...c, testRailProject: String(t.id) })))}
            </div>
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 4 · MOBILE (Escenarios) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 4 && isMobileProject && (
          <BentoCard className="!p-0 overflow-hidden">

            {/* ΓöÇΓöÇ Loading ΓöÇΓöÇ */}
            {mobileScenariosLoading && (
              <div className="bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] p-8 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 70% 30%, ${C.green}50 0%, transparent 50%)` }} />
                <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold mb-1">Paso cuatro · Generando escenarios</div>
                  <h2 className="text-[28px] font-medium leading-tight mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>{config.jiraProject}</h2>
                  <div className="text-[12px] text-white/60 font-mono mb-6">{activeSprint?.name ?? 'Sprint activo'} · estado: {config.status}</div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-6">
                    <div className="h-full rounded-full relative overflow-hidden" style={{ width: '65%', background: `linear-gradient(90deg, ${C.green}, #5EC470)` }}>
                      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', animation: 'shimmer 1.6s linear infinite' }} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {['Consultando historias del sprint activo...', `Aplicando filtro de estado: ${config.status}`, 'Generando pasos mobile con IA...'].map((msg, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-[12px]">
                        <Loader2 size={13} className="text-[#5EC470] animate-spin flex-shrink-0" style={{ animationDelay: `${i * 200}ms` }} />
                        <span className="text-white/80">{msg}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-2">
                    <div className="text-[11px] text-white/70">
                      Job: <span className="font-mono">{mobileGenerationJobId ?? 'iniciando...'}</span> · estado: <span className="font-semibold">{mobileGenerationStatus ?? 'pending'}</span>
                    </div>
                    {mobileGenerationIssueProgress.length > 0 && (
                      <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                        {mobileGenerationIssueProgress.map((issue) => (
                          <div key={issue.issueKey} className="text-[11px] text-white/70 flex items-center justify-between gap-2">
                            <span className="font-mono">{issue.issueKey}</span>
                            <span>{issue.status}</span>
                            <span>{issue.scenarioCount} esc.</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {mobileGenerationNotice && (
                      <div className="text-[11px] text-[#F4A261]">{mobileGenerationNotice}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ΓöÇΓöÇ Error ΓöÇΓöÇ */}
            {!mobileScenariosLoading && mobileScenariosError && (
              <div className="p-8">
                <div className="flex items-center gap-3 text-[#E63946] mb-2">
                  <AlertCircle size={18} />
                  <span className="text-[14px] font-semibold">No se pudieron generar los escenarios</span>
                </div>
                <p className="text-[12px] text-[#8B999D] mb-4">{mobileScenariosError}</p>
                <button onClick={handleGenerateMobileScenarios} className="text-[12px] font-semibold text-[#104B99] hover:underline flex items-center gap-1.5">
                  <Loader2 size={12} /> Reintentar
                </button>
              </div>
            )}

            {/* ΓöÇΓöÇ Loaded ΓöÇΓöÇ */}
            {!mobileScenariosLoading && !mobileScenariosError && (
              <>
                {mobileRejected.length > 0 && (
                  <div className="px-6 pt-5 text-[11px] text-[#8B999D]">{mobileRejected.length} historia(s) rechazada(s): {mobileRejected.map(r => r.sourceIssueKey).join(', ')}</div>
                )}
                <MobileScenarioSelectionPanel
                  mobileScenarios={mobileDisplayScenarios}
                  selectedMobileScenarioIds={selectedMobileScenarioIds}
                  expandedMobileIssueKeys={expandedMobileIssueKeys}
                  setExpandedMobileIssueKeys={setExpandedMobileIssueKeys}
                  mobileDataValues={mobileDataValues}
                  setMobileFieldValue={setMobileFieldValue}
                  toggleMobileScenario={toggleMobileScenario}
                  setSelectedMobileScenarioIds={setSelectedMobileScenarioIds}
                />
              </>
            )}
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 4 · API ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 4 && isApiProject && (
          <BentoCard className="!p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-[#2d1a08] via-[#6b3410] to-[#2d1a08] text-white p-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 80% 20%, #E47E2B50 0%, transparent 50%)` }} />
              <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
              <div className="absolute right-16 top-16 w-16 h-16 rounded-full border border-white/10" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#f0a96a] font-semibold mb-2">Listo para ejecutar</div>
                <h2 className="text-[40px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  {selectedProject?.name}
                </h2>
                <div className="text-[12px] text-white/60 mt-2">{selectedProject?.stack}</div>
                <div className="grid grid-cols-3 gap-6 mt-7 pt-6 border-t border-white/15">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Colección</div>
                    <div className="text-[20px] font-medium mt-1 truncate" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      {config.newmanCollection || 'ΓÇö'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Endpoints</div>
                    <div className="text-[28px] font-medium mt-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      {selectedNewmanCollection?.requestCount ?? 'ΓÇö'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Proyecto TestRail</div>
                    <div className="text-[18px] font-medium mt-1.5 truncate">{currentTR?.name || 'ΓÇö'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 space-y-3">
              {trSuiteId && (
                <div className="flex items-center justify-between py-3 border-b border-[#F4F1EA]">
                  <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Suite ID</span>
                  <span className="text-[13px] font-semibold text-[#1a1f2e]">{trSuiteId}</span>
                </div>
              )}
              {selectedSection && (
                <div className="flex items-center justify-between py-3 border-b border-[#F4F1EA]">
                  <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Sección TestRail</span>
                  <span className="text-[13px] font-semibold text-[#1a1f2e]">{selectedSection.name}</span>
                </div>
              )}
              <div className="flex items-start gap-2.5 bg-[#FFF7F0] rounded-2xl p-4 mt-4 border border-[#E47E2B]/15">
                <div className="text-[11px] text-[#58646D] leading-relaxed">
                  La ejecución correrá la colección <strong className="text-[#1a1f2e]">{config.newmanCollection}</strong> con Newman y reportará los resultados a <strong className="text-[#1a1f2e]">TestRail</strong>.
                </div>
              </div>
            </div>
          </BentoCard>
        )}

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 4 · WEB ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 4 && !isApiProject && !isMobileProject && (
          <BentoCard className="!p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] text-white p-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(circle at 80% 20%, ${C.green}50 0%, transparent 50%), radial-gradient(circle at 20% 80%, #ffffff20 0%, transparent 50%)` }} />
              <div className="absolute right-8 top-8 w-32 h-32 rounded-full border border-white/10" />
              <div className="absolute right-16 top-16 w-16 h-16 rounded-full border border-white/10" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#5EC470] font-semibold mb-2">Listo para despegar</div>
                <h2 className="text-[40px] font-medium leading-none tracking-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                  {selectedProject?.name}
                </h2>
                <div className="text-[12px] text-white/60 mt-2">{selectedProject?.stack}</div>
                <div className="grid grid-cols-3 gap-6 mt-7 pt-6 border-t border-white/15">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Casos</div>
                    <div className="text-[28px] font-medium mt-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      {launchSelection.totalSelected}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Tiempo estimado</div>
                    <div className="text-[28px] font-medium mt-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
                      ~{launchSelection.totalSelected === 0 ? 12 : Math.max(2, Math.floor(launchSelection.totalSelected * 1.2))}
                      <span className="text-[14px] text-white/60 ml-1">min</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/60">Fuente</div>
                    <div className="text-[18px] font-medium mt-2.5">{launchSelection.sourceLabel}</div>
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

        {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ STEP 5 · MOBILE (Publicar y ejecutar) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
        {step === 5 && isMobileProject && (
          <BentoCard className="!p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#48A157] font-semibold mb-2">Paso cinco · Publicar y ejecutar</div>
            <h2 className="text-[34px] font-medium text-[#1a1f2e] mb-1 leading-tight" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Confirma antes de ejecutar en el dispositivo</h2>
            <p className="text-[13px] text-[#58646D] mb-7">Primero publica los {selectedMobileScenarioIds.length} escenario(s) seleccionados en TestRail, revisa el Test Run, y luego ejecútalos en el emulador.</p>

            <div className="bg-[#FAFAF7] rounded-2xl p-5 mb-6 space-y-2 max-w-md">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Proyecto TestRail</span>
                <span className="text-[13px] font-semibold text-[#1a1f2e]">{currentTR?.name ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] uppercase tracking-wider text-[#8B999D] font-medium">Sección TestRail</span>
                <span className="text-[13px] font-semibold text-[#1a1f2e]">{selectedSection?.name ?? '—'}</span>
              </div>
            </div>

            <button onClick={handleLaunchMobile}
              disabled={mobilePublishing || !selectedSection || !config.testRailProject || selectedMobileScenarioIds.length === 0}
              className="mb-4 bg-gradient-to-r from-[#48A157] to-[#357a42] hover:from-[#5EC470] hover:to-[#48A157] disabled:from-[#BABEC3] disabled:to-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5 shadow-lg shadow-[#48A157]/30 group">
              {mobilePublishing
                ? <><Loader2 size={13} className="animate-spin" /> Ejecutando…</>
                : <><Rocket size={13} className="group-hover:rotate-12 transition" /> Ejecutar</>}
            </button>

            {mobilePublishing && mobileLaunchPhase && (
              <div className="flex items-center gap-1.5 mb-4 text-[12px] text-[#58646D]"><Loader2 size={12} className="animate-spin" /> {mobileLaunchPhase}</div>
            )}

            {mobilePublishError && (
              <div className="flex items-center gap-1.5 mb-5 text-[12px] text-[#E63946]"><AlertCircle size={13} /> {mobilePublishError}</div>
            )}
          </BentoCard>
        )}

        {/* ΓöÇΓöÇ Navigation ΓöÇΓöÇ */}
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => {
              if (step === 4 && isApiProject) { setStep(2); return; }
              setStep(s => Math.max(1, s - 1));
            }}
            disabled={step === 1}
            className="text-[12px] font-medium px-4 py-2.5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed text-[#58646D] hover:bg-white hover:text-[#1a1f2e] transition flex items-center gap-1.5">
            <ChevronLeft size={13} /> Atrás
          </button>
          {step < maxStep ? (
            <button onClick={handleContinueAdvance} disabled={!canAdvance()}
              className="bg-[#1a1f2e] hover:bg-black disabled:bg-[#BABEC3] disabled:cursor-not-allowed text-white text-[12px] font-semibold px-6 py-2.5 rounded-full transition flex items-center gap-1.5">
              {step === 2 ? ((isApiProject || isMobileProject) ? 'Continuar' : 'Generar escenarios') : 'Continuar'} <ChevronRight size={13} />
            </button>
          ) : isMobileProject ? null : (
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
