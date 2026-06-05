type SectionLike = {
  name?: string | null;
  displayName?: string | null;
};

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

function stripPrefixes(input: string): string {
  let result = input.trim();
  for (const prefix of SECTION_PREFIXES) {
    result = result.replace(prefix, '');
  }
  return result.trim();
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveFunctionalAppSlug(input: {
  targetAppSlug?: string | null;
  appSlug?: string | null;
  section?: SectionLike | null;
  appProfileSlug?: string | null;
  appSlugFromEnv?: string | null;
}): { appSlug: string; source: string } | null {
  const explicitTarget = input.targetAppSlug?.trim();
  if (explicitTarget) {
    const normalized = normalizeSlug(explicitTarget);
    if (normalized) return { appSlug: normalized, source: 'target_app_slug' };
  }

  const explicitApp = input.appSlug?.trim();
  if (explicitApp) {
    const normalized = normalizeSlug(explicitApp);
    if (normalized) return { appSlug: normalized, source: 'explicit_app_slug' };
  }

  const sectionName = input.section?.displayName?.trim() || input.section?.name?.trim() || '';
  if (sectionName) {
    const stripped = stripPrefixes(sectionName);
    const normalized = normalizeSlug(stripped);
    if (normalized && normalized.length >= 3) {
      return { appSlug: normalized, source: 'testrail_section_mapping' };
    }
  }

  const envSlug = input.appSlugFromEnv?.trim();
  if (envSlug) {
    const normalized = normalizeSlug(envSlug);
    if (normalized) return { appSlug: normalized, source: 'env_app_slug' };
  }

  const profileSlug = input.appProfileSlug?.trim();
  if (profileSlug) {
    const normalized = normalizeSlug(profileSlug);
    if (normalized) return { appSlug: normalized, source: 'app_profile' };
  }

  return null;
}
