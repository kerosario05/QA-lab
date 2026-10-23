export type ProjectDataCatalogOption = { id: string; label: string; value: string; active: boolean; position: number };
export type ProjectDataCatalog = { id: string; projectSlug: string; name: string; fieldName: string; aliases: string[]; active: boolean; revision: number; options: ProjectDataCatalogOption[] };
export type ProjectDataCatalogWrite = Omit<ProjectDataCatalog, 'id' | 'projectSlug' | 'revision' | 'options'> & { options: Array<Partial<ProjectDataCatalogOption> & Pick<ProjectDataCatalogOption, 'label' | 'value'>> };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const catalogLists = new Map<string, Promise<ProjectDataCatalog[]>>();
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `${response.status}`);
  return body;
}
function invalidateCatalogLists(slug: string) {
  const prefix = `${slug}:`;
  for (const key of catalogLists.keys()) if (key.startsWith(prefix)) catalogLists.delete(key);
}
export const projectDataCatalogApi = {
  list: (slug: string, includeInactive = false) => {
    const key = `${slug}:${includeInactive ? 'all' : 'active'}`;
    const cached = catalogLists.get(key);
    if (cached) return cached;
    const pending = request<{ catalogs: ProjectDataCatalog[] }>(`/api/projects/${encodeURIComponent(slug)}/data-catalogs${includeInactive ? '?includeInactive=true' : ''}`)
      .then(result => result.catalogs)
      .catch(error => { catalogLists.delete(key); throw error; });
    catalogLists.set(key, pending);
    return pending;
  },
  create: async (slug: string, catalog: ProjectDataCatalogWrite) => {
    const result = (await request<{ catalog: ProjectDataCatalog }>(`/api/projects/${encodeURIComponent(slug)}/data-catalogs`, { method: 'POST', body: JSON.stringify(catalog) })).catalog;
    invalidateCatalogLists(slug);
    return result;
  },
  update: async (slug: string, id: string, catalog: ProjectDataCatalogWrite) => {
    const result = (await request<{ catalog: ProjectDataCatalog }>(`/api/projects/${encodeURIComponent(slug)}/data-catalogs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(catalog) })).catalog;
    invalidateCatalogLists(slug);
    return result;
  },
};

export function normalizeCatalogField(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[\\_-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function deriveProjectDataCatalogAliases(fieldName: string): string[] {
  const words = normalizeCatalogField(fieldName).split(' ').filter(Boolean);
  const withoutArticles = words.filter(word => !['de', 'del', 'la', 'el', 'los', 'las'].includes(word));
  const alias = withoutArticles.join(' ');
  return alias && alias !== normalizeCatalogField(fieldName) ? [alias] : [];
}
export function matchProjectDataCatalogs(field: string, catalogs: ProjectDataCatalog[]): ProjectDataCatalog[] {
  const normalized = normalizeCatalogField(field);
  if (!normalized) return [];
  return catalogs.filter(catalog => catalog.active && [catalog.fieldName, ...catalog.aliases].some(alias => normalizeCatalogField(alias) === normalized));
}

export function parseProjectDataCatalogOptions(text: string, existing: ProjectDataCatalogOption[] = []): Array<Partial<ProjectDataCatalogOption> & Pick<ProjectDataCatalogOption, 'label' | 'value'>> {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, position) => {
    const parts = line.split('|').map(part => part.trim());
    const label = parts[0] ?? '';
    const inactive = parts[1]?.toLocaleLowerCase() === 'inactivo' || parts[2]?.toLocaleLowerCase() === 'inactivo';
    const value = parts.length === 1 || parts[1]?.toLocaleLowerCase() === 'inactivo' ? label : (parts[1] ?? label);
    const prior = existing.find(option => option.label === label && option.value === value);
    return { id: prior?.id, label, value, active: !inactive, position };
  });
}

export function formatProjectDataCatalogOptions(options: ProjectDataCatalogOption[]): string {
  return options.map(option => {
    if (option.label === option.value) return option.active ? option.label : `${option.label} | inactivo`;
    return `${option.label} | ${option.value}${option.active ? '' : ' | inactivo'}`;
  }).join('\n');
}
