/** Identity types mirroring the engine's contract (src/auth in the automation engine). */

export type PermissionKey =
  | 'dashboard.view'
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'projects.delete'
  | 'projects.materialize'
  | 'tests.launch'
  | 'tests.rerun'
  | 'recordings.view'
  | 'recordings.create'
  | 'recordings.derive'
  | 'recordings.promote'
  | 'executions.view'
  | 'executions.export'
  | 'admin.users'
  | 'admin.roles';

export type SessionScope = 'full' | 'password_change_only';

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  mustChangePassword: boolean;
  enabled: boolean;
  allProjects: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleRef {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectAccess {
  projectId: string;
  projectSlug: string;
  projectName: string;
  /** 1 = lectura, 2 = escritura */
  accessLevel: 1 | 2;
  grantedAt: string;
}

export interface LoginResponse {
  ok: true;
  token: string;
  expiresAt: string;
  scope: SessionScope;
  mustChangePassword: boolean;
  user: AuthUser;
  roles: RoleRef[];
  permissions: PermissionKey[];
  projects: ProjectAccess[];
  allProjects: boolean;
}

export interface IdentitySnapshot {
  ok: true;
  user: AuthUser | null;
  roles: RoleRef[];
  permissions: PermissionKey[] | '*';
  projects: ProjectAccess[];
  allProjects: boolean;
  scope: SessionScope;
  mustChangePassword: boolean;
  session: { id: string; expiresAt: string; issuedAt: string } | null;
}

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export interface PermissionModule {
  key: string;
  label: string;
  permissions: PermissionDefinition[];
}

export interface AdminUser extends AuthUser {
  roles: RoleRef[];
  permissions: PermissionKey[];
  projects: ProjectAccess[];
  activeSessions: number;
  failedLoginCount: number;
  lockedUntil: string | null;
}

export interface AdminRole {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionKey[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: number;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}
