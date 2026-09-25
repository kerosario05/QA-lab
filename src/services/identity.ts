import { api } from './http';
import type {
  AdminRole,
  AdminUser,
  AuditEntry,
  PermissionKey,
  PermissionModule,
} from '../auth/types';

/** Client for the engine's identity admin surface, proxied through the BFF. */

export interface CreateUserPayload {
  username: string;
  fullName: string;
  email?: string | null;
  password?: string;
  roles?: string[];
  allProjects?: boolean;
  projects?: { slug: string; accessLevel: 1 | 2 }[];
}

export interface ProjectRef {
  id: string;
  slug: string;
  name: string;
  projectType: number;
  enabled: boolean;
}

export const usersApi = {
  list: (filters: { enabled?: boolean; role?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.enabled !== undefined) params.set('enabled', String(filters.enabled));
    if (filters.role) params.set('role', filters.role);
    if (filters.q) params.set('q', filters.q);
    const query = params.toString();
    return api.get<{ ok: true; total: number; users: AdminUser[] }>(
      `/api/users${query ? `?${query}` : ''}`,
    );
  },

  get: (id: string) => api.get<{ ok: true; user: AdminUser }>(`/api/users/${id}`),

  create: (payload: CreateUserPayload) =>
    api.post<{ ok: true; user: AdminUser; temporaryPassword?: string }>('/api/users', payload),

  update: (
    id: string,
    patch: { fullName?: string; email?: string | null; username?: string; enabled?: boolean },
  ) => api.patch<{ ok: true; user: AdminUser }>(`/api/users/${id}`, patch),

  deactivate: (id: string) =>
    api.delete<{ ok: true; user: AdminUser; deactivated: true }>(`/api/users/${id}`),

  resetPassword: (id: string, password?: string) =>
    api.post<{ ok: true; temporaryPassword?: string; revokedSessions: number }>(
      `/api/users/${id}/reset-password`,
      password ? { password } : {},
    ),

  setRoles: (id: string, roles: string[]) =>
    api.put<{ ok: true; user: AdminUser }>(`/api/users/${id}/roles`, { roles }),

  setProjects: (
    id: string,
    payload: { allProjects?: boolean; projects?: { slug: string; accessLevel: 1 | 2 }[] },
  ) => api.put<{ ok: true; user: AdminUser }>(`/api/users/${id}/projects`, payload),

  audit: (id: string, limit = 50) =>
    api.get<{ ok: true; total: number; entries: AuditEntry[] }>(
      `/api/users/${id}/audit?limit=${limit}`,
    ),
};

export const rolesApi = {
  list: () => api.get<{ ok: true; total: number; roles: AdminRole[] }>('/api/roles'),

  create: (payload: {
    slug: string;
    name: string;
    description?: string;
    permissions: PermissionKey[];
  }) => api.post<{ ok: true; role: AdminRole }>('/api/roles', payload),

  update: (id: string, patch: { name?: string; description?: string | null }) =>
    api.patch<{ ok: true; role: AdminRole }>(`/api/roles/${id}`, patch),

  setPermissions: (id: string, permissions: PermissionKey[]) =>
    api.put<{ ok: true; role: AdminRole }>(`/api/roles/${id}/permissions`, { permissions }),

  remove: (id: string) => api.delete<{ ok: true; deleted: true }>(`/api/roles/${id}`),
};

export const permissionsApi = {
  catalogue: () => api.get<{ ok: true; modules: PermissionModule[] }>('/api/permissions'),
};

export const projectsRefApi = {
  /** Projects available to grant. The engine already narrows this to what the caller may see. */
  list: async (): Promise<ProjectRef[]> => {
    const response = await api.get<{ projects: ProjectRef[] }>('/api/projects');
    return response.projects ?? [];
  },
};
