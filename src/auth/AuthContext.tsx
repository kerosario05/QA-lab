import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, getToken, onSessionLost, setToken } from '../services/http';
import type {
  AuthUser,
  IdentitySnapshot,
  LoginResponse,
  PermissionKey,
  ProjectAccess,
  RoleRef,
  SessionScope,
} from './types';

/**
 * Holds the signed-in identity for the whole app.
 *
 * The token lives in localStorage so a reload does not log the user out, but it
 * is always re-validated against `/api/auth/me` on boot: a token revoked from
 * the admin module while the tab was closed must not appear to still work.
 */

type AuthStatus = 'loading' | 'anonymous' | 'must-change-password' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  roles: RoleRef[];
  permissions: PermissionKey[];
  /** True for an admin or a service principal: no per-project restriction. */
  allProjects: boolean;
  projects: ProjectAccess[];
  scope: SessionScope;
  /** Message explaining an involuntary logout, shown on the login screen. */
  notice: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Whether the current user holds a permission. */
  can: (permission: PermissionKey) => boolean;
  canAny: (...permissions: PermissionKey[]) => boolean;
  /** Whether the user may work on a given project slug. */
  canAccessProject: (slug: string | null | undefined) => boolean;
  clearNotice: () => void;
}

const EMPTY: AuthState = {
  status: 'loading',
  user: null,
  roles: [],
  permissions: [],
  allProjects: false,
  projects: [],
  scope: 'full',
  notice: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY);

  const applySnapshot = useCallback((snapshot: IdentitySnapshot) => {
    const permissions = snapshot.permissions === '*' ? [] : snapshot.permissions;
    setState({
      status: snapshot.mustChangePassword ? 'must-change-password' : 'authenticated',
      user: snapshot.user,
      roles: snapshot.roles,
      permissions,
      // A service principal reports "*": treat it as unrestricted.
      allProjects: snapshot.allProjects || snapshot.permissions === '*',
      projects: snapshot.projects,
      scope: snapshot.scope,
      notice: null,
    });
  }, []);

  const goAnonymous = useCallback((notice: string | null = null) => {
    setToken(null);
    setState({ ...EMPTY, status: 'anonymous', notice });
  }, []);

  /**
   * Boot: validate any stored token before showing the app.
   *
   * `cancelled` is scoped to each effect run on purpose. An earlier version also
   * guarded on a component-level `mounted` ref, which StrictMode's
   * mount → cleanup → mount cycle left permanently false: the boot resolution was
   * then dropped and the app sat on the splash forever.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        if (!cancelled) setState({ ...EMPTY, status: 'anonymous' });
        return;
      }
      try {
        const snapshot = await api.get<IdentitySnapshot>('/api/auth/me', { silent: true });
        if (cancelled) return;
        // With auth disabled on the engine, /me answers with a null user and no
        // session; that is not a signed-in identity, so ask for a login.
        if (!snapshot.user) {
          goAnonymous();
          return;
        }
        applySnapshot(snapshot);
      } catch {
        if (!cancelled) goAnonymous();
      }
    })();
    return () => { cancelled = true; };
  }, [applySnapshot, goAnonymous]);

  // A request anywhere in the app found the session dead.
  useEffect(
    () =>
      onSessionLost((reason) =>
        goAnonymous(
          reason === 'revoked'
            ? 'Tu sesión fue cerrada por un administrador. Vuelve a iniciar sesión.'
            : 'Tu sesión expiró. Vuelve a iniciar sesión.',
        ),
      ),
    [goAnonymous],
  );

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<LoginResponse>(
      '/api/auth/login',
      { username, password },
      { silent: true },
    );
    setToken(result.token);
    setState({
      status: result.mustChangePassword ? 'must-change-password' : 'authenticated',
      user: result.user,
      roles: result.roles,
      permissions: result.permissions,
      allProjects: result.allProjects,
      projects: result.projects,
      scope: result.scope,
      notice: null,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', undefined, { silent: true });
    } catch {
      // Already invalid server-side; dropping the local token is enough.
    }
    goAnonymous();
  }, [goAnonymous]);

  const refresh = useCallback(async () => {
    const snapshot = await api.get<IdentitySnapshot>('/api/auth/me');
    if (!snapshot.user) {
      goAnonymous();
      return;
    }
    applySnapshot(snapshot);
  }, [applySnapshot, goAnonymous]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const result = await api.post<{ token: string }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      // The change revokes every session including this one; the response hands
      // back a fresh full-scope token that has to replace the stored one.
      setToken(result.token);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(() => {
    const permissionSet = new Set(state.permissions);
    const projectSlugs = new Set(state.projects.map((p) => p.projectSlug.toLowerCase()));
    return {
      ...state,
      login,
      logout,
      changePassword,
      refresh,
      can: (permission) => permissionSet.has(permission),
      canAny: (...permissions) => permissions.some((p) => permissionSet.has(p)),
      canAccessProject: (slug) => {
        if (state.allProjects) return true;
        if (!slug) return false;
        return projectSlugs.has(slug.trim().toLowerCase());
      },
      clearNotice: () => setState((prev) => ({ ...prev, notice: null })),
    };
  }, [state, login, logout, changePassword, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}

export { ApiError };
