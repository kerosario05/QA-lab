/**
 * App Config Service — migración y aprendizaje seguro de App Profile/routeProfile
 * por proyecto TestRail, sin edición manual obligatoria.
 *
 * Conceptos:
 * - Cada proyecto TestRail tiene un perfil en automations/apps/<normalizedAppSlug>/app.config.json
 * - El perfil se aprende/migra automáticamente según evidencia del snapshot y escenarios
 * - No se hardcodean entrySteps globalmente; solo por appSlug con evidencia
 */

/* ─────────────── Types ─────────────── */

export interface EntryStep {
  action: string;
  target: string;
  when: string;
  reason?: string;
}

export interface RouteProfile {
  name: string;
  entrySteps?: EntryStep[];
  entry?: string[];
  domainTerms?: Record<string, string>;
  visibleControls?: string[];
}

export interface AppProfile {
  name?: string;
  source?: string;
  testRailProjectName?: string;
  testRailProjectId?: number;
  baseUrl?: string;
  loginMode?: string;
  usernameRef?: string;
  passwordRef?: string;
  /** Campos dinámicos preservados */
  [key: string]: unknown;
}

export interface AppConfig {
  appProfile?: AppProfile;
  routeProfile?: RouteProfile | null;
  /** Cualquier otro campo existente se preserva */
  [key: string]: unknown;
}

export interface MigrationMetadata {
  testRailProjectName: string;
  testRailProjectId: number;
}

export interface ScenarioTarget {
  action: string;
  target: string;
  stepText?: string;
}

export interface SnapshotEvidence {
  visibleControls?: Array<{ label: string; type: string; visible: boolean }>;
  url?: string;
  title?: string;
}

export interface LearnedEntryStepsResult {
  entrySteps: EntryStep[];
  confidence: 'full' | 'partial' | 'none';
  reason: string;
}

export interface MigrationResult {
  config: AppConfig;
  warnings: string[];
}

export interface LearningError {
  errorCode: string;
  appSlug: string;
  appConfigPath: string;
  testRailProjectName: string;
  expectedRouteProfileShape: string;
  hint: string;
}

/* ─────────────── Constants ─────────────── */

const TECHNICAL_SLUGS = new Set([
  'tests', 'test', 'api-tests', 'api', 'qa-tests', 'qa',
  'unknown', 'default', 'undefined', 'null', '',
]);

const SECTION_PREFIXES = [
  /^regresi[oó]n[\s_]+/i,
  /^regression[\s_]+/i,
  /^detalle[\s_]+/i,
  /^smoke[\s_]+/i,
  /^api[\s_]+/i,
  /^pruebas?[\s_]+/i,
  /^automatizaci[oó]n[\s_]+/i,
  /^qa[\s_]+/i,
  /^tests?[\s_]+/i,
  /^validaci[oó]n[\s_]+/i,
  /^sanity[\s_]+/i,
];

/* ─────────────── Helpers ─────────────── */

function stripPrefixes(input: string): string {
  let result = input.trim();
  for (const prefix of SECTION_PREFIXES) {
    result = result.replace(prefix, '');
  }
  return result.trim();
}

/**
 * Normaliza un nombre de proyecto TestRail a appSlug.
 * "Arquitectura automatización" → "arquitectura-automatizacion"
 */
export function normalizeAppSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Valida que un appSlug no contenga path traversal y sea seguro.
 */
export function validateAppSlug(appSlug: string): boolean {
  if (!appSlug || typeof appSlug !== 'string') return false;
  if (appSlug.includes('..')) return false;
  if (appSlug.includes('/') || appSlug.includes('\\')) return false;
  if (TECHNICAL_SLUGS.has(appSlug)) return false;
  const normalized = normalizeAppSlug(appSlug);
  return normalized === appSlug && normalized.length >= 1;
}

/**
 * Corrige mojibake común (UTF-8 doblemente codificado o Latin-1 malinterpretado).
 * Ej: "automatizaciÃ³n" → "automatización"
 */
export function fixMojibake(text: string): string {
  return text
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã\xa1/g, 'á')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Ã/g, 'Í')
    .replace(/¡/g, 'í')
    .replace(/©/g, '©')
    .replace(/[\x80-\xBF]/g, '');
}

/**
 * Resuelve el nombre de un proyecto TestRail.
 * Prefiere valor explícito, luego TestRail API, finalmente appSlug como fallback.
 */
export async function resolveTestRailProjectName(
  projectId: number,
  explicitName?: string | null,
  testRailClient?: { getProjects: () => Promise<{ projects: Array<{ id: number; name: string }> }> },
): Promise<string | null> {
  if (explicitName) return explicitName;

  if (testRailClient) {
    try {
      const { projects } = await testRailClient.getProjects();
      const project = projects.find((p) => p.id === projectId);
      if (project?.name) return project.name;
    } catch {
      // TestRail no disponible, continuar con fallback
    }
  }

  return null;
}

/* ─────────────── Migration ─────────────── */

/**
 * Migra un app.config.json existente con metadatos del proyecto TestRail.
 *
 * Reglas:
 * - Preserva campos existentes (baseUrl, loginMode, usernameRef, passwordRef, refs, testData)
 * - source → "testrail_project"
 * - name → testRailProjectName (corrigiendo mojibake)
 * - testRailProjectId → del metadata
 * - NO persiste secretos nuevos
 * - NO cambia username/password si existen
 * - routeProfile: null si falta (no se crea sin evidencia)
 * - Idempotente
 */
export function migrateAppConfigForTestRailProject(
  config: Record<string, unknown>,
  metadata: MigrationMetadata,
): MigrationResult {
  const warnings: string[] = [];
  const out = { ...config };

  // Preservar appProfile existente o crear uno nuevo
  const existingProfile = (out.appProfile as Record<string, unknown> | undefined) ?? {};
  const profile: Record<string, unknown> = { ...existingProfile };

  // source
  profile.source = 'testrail_project';

  // name — corregir mojibake si el real está disponible
  const fixedName = fixMojibake(metadata.testRailProjectName);
  if (existingProfile.name && existingProfile.name !== fixedName) {
    profile.name = fixedName;
  } else if (!existingProfile.name) {
    profile.name = fixedName;
  }

  // testRailProjectName
  profile.testRailProjectName = metadata.testRailProjectName;

  // testRailProjectId
  profile.testRailProjectId = metadata.testRailProjectId;

  // Preservar campos existentes útiles — no tocar credenciales
  for (const key of ['baseUrl', 'loginMode', 'usernameRef', 'passwordRef']) {
    if (existingProfile[key] !== undefined) {
      profile[key] = existingProfile[key];
    }
  }

  out.appProfile = profile;

  // routeProfile: null si falta (no se crea sin evidencia)
  if (out.routeProfile === undefined) {
    out.routeProfile = null;
  }

  return { config: out as AppConfig, warnings };
}

/* ─────────────── Entry steps learning ─────────────── */

/**
 * Aprende entrySteps desde evidencia visible (snapshot) y targets de escenarios.
 *
 * Lógica:
 * - Si el primer functional target no está visible en la pantalla inicial
 *   pero hay un control visible "Iniciar" → aprender click en "Iniciar"
 * - Si el primer target ya está visible → no aprender nada
 * - Si no hay snapshot → no aprender
 */
export function learnEntrySteps(
  snapshot: SnapshotEvidence | null | undefined,
  scenarioTargets: ScenarioTarget[],
): LearnedEntryStepsResult {
  if (!snapshot || !scenarioTargets.length) {
    return { entrySteps: [], confidence: 'none', reason: 'Sin evidencia: snapshot o targets vacíos' };
  }

  const visibleControls = snapshot.visibleControls ?? [];
  const firstTarget = scenarioTargets[0];

  if (!firstTarget.target) {
    return { entrySteps: [], confidence: 'none', reason: 'Sin evidencia: primer target sin nombre' };
  }

  const targetNormalized = firstTarget.target.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const firstTargetVisible = visibleControls.some((c) => {
    const label = (c.label ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return label.includes(targetNormalized) || targetNormalized.includes(label);
  });

  if (firstTargetVisible) {
    return {
      entrySteps: [],
      confidence: 'full',
      reason: `El primer target "${firstTarget.target}" ya está visible en pantalla inicial — no requiere entryStep`,
    };
  }

  // Buscar botón "Iniciar" en los controles visibles
  const iniciarButton = visibleControls.find((c) => {
    const label = (c.label ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return label === 'iniciar' || label === 'iniciar sesion' || label === 'iniciar sesión';
  });

  if (iniciarButton) {
    return {
      entrySteps: [
        {
          action: 'click',
          target: iniciarButton.label,
          when: 'before_first_functional_step',
          reason: `"${iniciarButton.label}" detectado en snapshot; primer target "${firstTarget.target}" no está visible en pantalla inicial`,
        },
      ],
      confidence: 'full',
      reason: `"${iniciarButton.label}" visible en snapshot, aprendizaje aplicado`,
    };
  }

  // No hay botón "Iniciar" claro — ver si algún otro botón podría ser relevante
  const clickableControls = visibleControls.filter(
    (c) => c.type === 'button' || c.type === 'link' || c.type === 'menuitem',
  );

  if (clickableControls.length > 0) {
    return {
      entrySteps: [],
      confidence: 'none',
      reason: `Primer target "${firstTarget.target}" no visible. Controles disponibles: ${clickableControls.map((c) => `"${c.label}"`).join(', ')}. No se puede determinar entryStep automáticamente.`,
    };
  }

  return {
    entrySteps: [],
    confidence: 'none',
    reason: `Primer target "${firstTarget.target}" no visible y no hay controles accionables en snapshot`,
  };
}

/* ─────────────── Route profile creation ─────────────── */

/**
 * Crea un routeProfile mínimo con la evidencia disponible.
 */
export function createRouteProfile(
  appSlug: string,
  entrySteps: EntryStep[],
  scenarioTargets: ScenarioTarget[],
): RouteProfile {
  const domainTerms: Record<string, string> = {};
  for (const t of scenarioTargets) {
    if (t.target && t.stepText) {
      const key = normalizeAppSlug(t.target);
      domainTerms[key] = t.stepText;
    } else if (t.target) {
      const key = normalizeAppSlug(t.target);
      domainTerms[key] = t.target;
    }
  }

  // Extraer targets únicos como entry candidates
  const entry = [...new Set(scenarioTargets.map((t) => t.target).filter(Boolean))];

  // visibleControls: targets de escenarios
  const visibleControls = [...new Set(scenarioTargets.map((t) => t.target).filter(Boolean))];

  return {
    name: `testrail_${appSlug}`,
    entrySteps: entrySteps.length > 0 ? entrySteps : undefined,
    entry: entry.length > 0 ? entry : undefined,
    domainTerms: Object.keys(domainTerms).length > 0 ? domainTerms : undefined,
    visibleControls: visibleControls.length > 0 ? visibleControls : undefined,
  };
}

/**
 * Verifica si hay evidencia suficiente para crear routeProfile.
 */
export function hasSufficientEvidence(entrySteps: EntryStep[], scenarioTargets: ScenarioTarget[]): boolean {
  if (scenarioTargets.some((t) => t.target && t.action)) return true;
  return entrySteps.length > 0;
}

/* ─────────────── Apply entry steps to scenarios ─────────────── */

/**
 * Aplica entrySteps desde un routeProfile a los escenarios.
 * Inserta los pasos antes del primer paso funcional detectado.
 *
 * No duplica entrySteps si ya fueron aplicados.
 */
export function applyEntryStepsToScenarios(
  scenarios: Array<{ steps?: string[]; preconditions?: string[]; title?: string }>,
  entrySteps: EntryStep[] | null | undefined,
): Array<{ steps: string[]; preconditions?: string[]; title?: string }> {
  if (!entrySteps || entrySteps.length === 0) return scenarios as any;

  return scenarios.map((sc) => {
    const steps = sc.steps ?? [];

    // Verificar si ya se aplicaron (primeros pasos = entrySteps)
    const actionAliases: Record<string, string[]> = {
      click: ['clic', 'click', 'hacer clic', 'pulsar', 'presionar'],
    };
    const alreadyApplied = entrySteps.every((es, i) => {
      const existingStep = steps[i]?.toLowerCase() ?? '';
      const aliases = actionAliases[es.action.toLowerCase()] ?? [es.action.toLowerCase()];
      const actionMatched = aliases.some((a) => existingStep.includes(a));
      const targetMatched = existingStep.includes(es.target.toLowerCase().replace(/['"]/g, ''));
      return actionMatched && targetMatched;
    });

    if (alreadyApplied) {
      return { ...sc, steps };
    }

    // Convertir entrySteps a strings de pasos
    const prefixSteps = entrySteps.map((es) => {
      const actionLabel = es.action === 'click' ? 'Clic' : es.action.charAt(0).toUpperCase() + es.action.slice(1);
      return `${actionLabel} en "${es.target}"`;
    });

    return {
      ...sc,
      steps: [...prefixSteps, ...steps],
    };
  }) as any;
}

/* ─────────────── Error helpers ─────────────── */

/**
 * Genera un error accionable cuando no se puede aprender routeProfile.
 */
export function makeAppProfileCreatedButRouteProfileMissingError(
  appSlug: string,
  testRailProjectName: string,
): LearningError {
  const appConfigPath = `automations/apps/${appSlug}/app.config.json`;
  return {
    errorCode: 'app_profile_created_but_route_profile_missing',
    appSlug,
    appConfigPath,
    testRailProjectName,
    expectedRouteProfileShape: JSON.stringify(
      {
        name: `testrail_${appSlug}`,
        entrySteps: [{ action: 'click', target: '<visible_button>', when: 'before_first_functional_step', reason: '<evidence>' }],
        entry: ['<first_functional_target>'],
        domainTerms: { '<target_normalized>': '<original_text>' },
        visibleControls: ['<target1>', '<target2>'],
      },
      null,
      2,
    ),
    hint: `Abra la app o capture snapshot para inferir entrySteps, o configure routeProfile en ${appConfigPath}.`,
  };
}

/**
 * Verifica si se debe migrar el perfil: existe appSlug y no es técnico.
 */
export function shouldMigrateAppConfig(appSlug: string | null | undefined): boolean {
  if (!appSlug) return false;
  if (TECHNICAL_SLUGS.has(appSlug)) return false;
  if (!validateAppSlug(appSlug)) return false;
  return true;
}
