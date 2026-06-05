import type { McpRouteProfile, McpScenario, ScenarioReadinessItem, ScenarioReadinessStatus, ScenarioReadinessSummary } from '../../services/scenarios';

const MANUAL_OR_TIMEOUT_PATTERNS = [
  /timeout/i,
  /inactividad/i,
  /auto\s*cierre/i,
  /cierre\s+autom[aá]tico/i,
  /cerrar\s+autom[aá]ticamente/i,
  /manual/i,
  /humano/i,
  /operador/i,
  /soporte/i,
];

const DATA_ENTRY_PATTERNS = /^(?:\d+[\.)]\s*)?(?:ingresar|escribir|completar|capturar|llenar|fill|type|introducir|upload|adjuntar)\b/i;
const NAVIGATION_ACTION_PATTERNS = /^(?:\d+[\.)]\s*)?(?:clic|click|selecciona|seleccionar|abrir|acceder|elegir|escoger|presionar|volver|regresar|ir)\b/i;
const GENERIC_VALIDATION_PATTERNS = [
  /^(?:validar|verificar|comprobar|confirmar|esperar|observar|revisar)\b/i,
  /\b(?:se\s+muestre|se\s+vea|est[eé] visible|aparezca|exista|se presente)\b/i,
];

const EXTERNAL_DATA_HINT_PATTERNS = [
  /\{\{[^}]+\}\}/,
  /<[^>]+>/,
  /\btest\s*data\b/i,
  /\bdato[s]?\s+de\s+prueba\b/i,
  /\bplaceholder\b/i,
  /\bvalueSource\b/i,
  /\busuario\b/i,
  /\bcontrase[ñn]a\b/i,
  /\botp\b/i,
  /\bpin\b/i,
  /\bdocumento\b/i,
  /\bt[eé]lefono\b/i,
  /\bcorreo\b/i,
  /\bemail\b/i,
  /\bmonto\b/i,
  /\bimporte\b/i,
  /\bcuenta\b/i,
  /\breferencia\b/i,
  /\bn[uú]mero\b/i,
  /\bformulario\b/i,
  /\bcampo\s+requerido\b/i,
  /\barchivo\b/i,
  /\bupload\b/i,
];

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hasUsableRouteProfile(routeProfile: McpRouteProfile | null | undefined): boolean {
  if (!routeProfile) return false;
  return Boolean(
    (routeProfile.entry?.length ?? 0) > 0 ||
    Object.keys(routeProfile.domainTerms ?? {}).length > 0 ||
    (routeProfile.visibleControls ?? []).length > 0,
  );
}

function collectSignals(scenario: McpScenario): string[] {
  const values = [
    scenario.title,
    scenario.expectedResult,
    scenario.nonExecutableCriteria,
    scenario.dataRequirements,
    ...(scenario.steps ?? []),
    ...(scenario.preconditions ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  return Array.from(new Set(values));
}

function hasExternalDataSignal(text: string): boolean {
  const normalized = normalizeText(text);
  return EXTERNAL_DATA_HINT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectBlockingSignals(scenario: McpScenario, routeProfile?: McpRouteProfile | null): string[] {
  const signals: string[] = [];
  const fields = collectSignals(scenario);

  if (fields.some((text) => MANUAL_OR_TIMEOUT_PATTERNS.some((pattern) => pattern.test(text)))) {
    signals.push('manual_or_timeout_signal');
  }

  const hasDataEntry = fields.some((text) => DATA_ENTRY_PATTERNS.test(text));
  const hasExternalDataHint = fields.some((text) => hasExternalDataSignal(text));
  if (hasDataEntry || hasExternalDataHint) {
    signals.push('test_data_required');
  }

  const actionCount = (scenario.steps ?? []).filter((step) => NAVIGATION_ACTION_PATTERNS.test(step.trim())).length;
  const validationCount = (scenario.steps ?? []).filter((step) => GENERIC_VALIDATION_PATTERNS.some((pattern) => pattern.test(step.trim()))).length;
  if (validationCount >= 3 && actionCount === 0) {
    signals.push('generic_validations_excessive');
  }

  const expectedLooksLikeAction = typeof scenario.expectedResult === 'string'
    && NAVIGATION_ACTION_PATTERNS.test(normalizeText(scenario.expectedResult));
  if (expectedLooksLikeAction && actionCount === 0) {
    signals.push('expected_result_translated_to_strong_steps');
  }

  if (!hasUsableRouteProfile(routeProfile) && actionCount > 0) {
    signals.push('route_profile_missing');
  }

  return signals;
}

function isInformationalNavigationScenario(scenario: McpScenario): boolean {
  const fields = collectSignals(scenario).map(normalizeText);
  const hasNavigation = (scenario.steps ?? []).some((step) => NAVIGATION_ACTION_PATTERNS.test(step.trim()));
  const hasDataEntry = fields.some((text) => DATA_ENTRY_PATTERNS.test(text) || hasExternalDataSignal(text));
  const informationalHints = [
    /\b(categoria|categori[aá]|producto|listado|detalle|informacion|informaci[óo]n|modulo|m[oó]dulo|card|cards|opcion|opci[óo]n|volver|regresar)\b/i,
  ];
  return hasNavigation && !hasDataEntry && fields.some((text) => informationalHints.some((pattern) => pattern.test(text)));
}

export function classifyScenarioReadiness(
  scenario: McpScenario,
  routeProfile?: McpRouteProfile | null,
): ScenarioReadinessItem {
  const reasons = collectSignals(scenario);
  const blockingSignals = collectBlockingSignals(scenario, routeProfile);
  const actionCount = (scenario.steps ?? []).filter((step) => NAVIGATION_ACTION_PATTERNS.test(step.trim())).length;
  const validationCount = (scenario.steps ?? []).filter((step) => GENERIC_VALIDATION_PATTERNS.some((pattern) => pattern.test(step.trim()))).length;
  const informationalNavigation = isInformationalNavigationScenario(scenario);

  let status: ScenarioReadinessStatus = 'auto_executable';
  let recommendation = 'Puede ejecutarse automáticamente.';

  if (reasons.some((text) => MANUAL_OR_TIMEOUT_PATTERNS.some((pattern) => pattern.test(text)))) {
    status = 'unsupported_or_manual';
    recommendation = 'Revisar manualmente o excluir del flujo automático.';
  } else if (!hasUsableRouteProfile(routeProfile) && actionCount > 0) {
    status = 'needs_route_profile';
    recommendation = 'Agregar o seleccionar un routeProfile funcional antes de automatizar.';
  } else if (reasons.some((text) => DATA_ENTRY_PATTERNS.test(text) || hasExternalDataSignal(text))) {
    status = 'needs_test_data';
    recommendation = 'Proveer datos de prueba antes de ejecutar.';
  } else if ((typeof scenario.expectedResult === 'string' && NAVIGATION_ACTION_PATTERNS.test(normalizeText(scenario.expectedResult))) && actionCount === 0) {
    status = 'unsupported_or_manual';
    recommendation = 'El resultado esperado describe acciones; conviértelo en pasos explícitos o revisa manualmente.';
  } else if (validationCount >= 3 && actionCount === 0) {
    status = 'too_ambiguous';
    recommendation = 'Reducir ambigüedad o dividir el escenario en pasos más específicos.';
  } else if (actionCount === 0 && validationCount >= 4 && !hasUsableRouteProfile(routeProfile)) {
    status = 'too_ambiguous';
    recommendation = 'Falta una ruta clara para automatizar este escenario.';
  }

  if (status === 'auto_executable' && !hasUsableRouteProfile(routeProfile) && actionCount === 0 && !informationalNavigation) {
    status = 'too_ambiguous';
    recommendation = 'No hay ruta clara para automatizar este escenario.';
  }

  if (status === 'auto_executable' && informationalNavigation) {
    recommendation = 'Escenario informativo apto para automatización.';
  }

  return {
    sourceIssueKey: scenario.sourceIssueKey,
    title: scenario.title,
    status,
    reasons,
    blockingSignals,
    recommendation,
  };
}

export function buildScenarioReadiness(
  scenarios: McpScenario[],
  routeProfile?: McpRouteProfile | null,
): ScenarioReadinessSummary {
  const counts: Record<ScenarioReadinessStatus, number> = {
    auto_executable: 0,
    needs_route_profile: 0,
    needs_test_data: 0,
    unsupported_or_manual: 0,
    too_ambiguous: 0,
  };

  const items = scenarios.map((scenario) => {
    const item = classifyScenarioReadiness(scenario, routeProfile);
    counts[item.status] += 1;
    return item;
  });

  return { counts, items };
}
