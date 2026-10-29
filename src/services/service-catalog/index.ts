import { api } from '../http';
import type {
  BindingField,
  BindingOwnerRef,
  BindingParamValue,
  BindingSegment,
  CatalogService,
  ProjectServiceEntry,
  ServiceBinding,
  ServiceBindingsView,
  ServiceTestResult,
} from './types';

export * from './types';

/**
 * Client for the engine's service catalog (/api/service-catalog) and service
 * bindings (/api/service-bindings), forwarded unchanged by the BFF. Permissions
 * are enforced by the engine; the screen only hides what the user cannot use.
 */

const CATALOG = '/api/service-catalog';
const BINDINGS = '/api/service-bindings';

function projectPath(slug: string, serviceKey?: string): string {
  const base = `${CATALOG}/projects/${encodeURIComponent(slug)}/services`;
  return serviceKey ? `${base}/${encodeURIComponent(serviceKey)}` : base;
}

function ownerQuery(owner: BindingOwnerRef, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ ...owner, ...extra }).toString();
}

export const serviceCatalogApi = {
  async list(): Promise<CatalogService[]> {
    const res = await api.get<{ services: CatalogService[] }>(CATALOG);
    return res.services;
  },

  async projectServices(slug: string): Promise<ProjectServiceEntry[]> {
    const res = await api.get<{ services: ProjectServiceEntry[] }>(projectPath(slug));
    return res.services;
  },

  async saveProjectService(slug: string, serviceKey: string, input: { enabled: boolean; settings: Record<string, unknown> }) {
    return api.put<{ ok: true; action: 'inserted' | 'updated' }>(projectPath(slug, serviceKey), input);
  },

  /** `settings` tests unsaved form values; without it the saved configuration is used. */
  async test(slug: string, serviceKey: string, params: Record<string, unknown>, settings?: Record<string, unknown>) {
    return api.post<ServiceTestResult>(`${projectPath(slug, serviceKey)}/test`, {
      params,
      ...(settings ? { settings } : {}),
    });
  },
};

export const serviceBindingsApi = {
  async list(owner: BindingOwnerRef): Promise<ServiceBinding[]> {
    const res = await api.get<{ bindings: ServiceBinding[] }>(`${BINDINGS}?${ownerQuery(owner)}`);
    return res.bindings;
  },

  /** `serviceKey: null` on a scenario = that scenario types the value by hand. */
  async save(input: BindingOwnerRef & {
    scenarioId?: string;
    targetValueKey: string;
    serviceKey: string | null;
    params?: Record<string, BindingParamValue>;
    segment?: BindingSegment | null;
  }): Promise<ServiceBinding> {
    const res = await api.put<{ binding: ServiceBinding }>(BINDINGS, input);
    return res.binding;
  },

  /** Removing a scenario row makes it inherit the general form again. */
  async remove(owner: BindingOwnerRef, targetValueKey: string, scenarioId = ''): Promise<boolean> {
    const res = await api.delete<{ removed: boolean }>(`${BINDINGS}?${ownerQuery(owner, { scenarioId, targetValueKey })}`);
    return res.removed;
  },

  /** Effective bindings, suggestions and missing fields for each scenario of a form. */
  async view(owner: BindingOwnerRef, scenarios: Array<{ scenarioId: string; fields: BindingField[] }>): Promise<ServiceBindingsView> {
    return api.post<ServiceBindingsView>(`${BINDINGS}/view`, { ...owner, scenarios });
  },
};
