import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../services/http';
import { permissionsApi, projectsRefApi, rolesApi, usersApi, type ProjectRef } from '../../services/identity';
import type { AdminRole, AdminUser, PermissionModule } from '../../auth/types';
import { UserDialog } from './UserDialog';
import { RolesPanel } from './RolesPanel';

/** Admin module: users, their roles and project scope, plus the role editor. */
export function Usuarios() {
  const { can, user: currentUser } = useAuth();
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);

  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; password?: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, roleList] = await Promise.all([usersApi.list(), rolesApi.list()]);
      setUsers(userList.users);
      setRoles(roleList.roles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // The catalogue and the project list rarely change; one fetch is enough.
    void permissionsApi.catalogue().then((r) => setModules(r.modules)).catch(() => {});
    void projectsRefApi.list().then(setProjects).catch(() => {});
  }, [load]);

  const visible = users.filter((user) => {
    if (!showDisabled && !user.enabled) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      user.username.toLowerCase().includes(needle) ||
      user.fullName.toLowerCase().includes(needle) ||
      (user.email ?? '').toLowerCase().includes(needle)
    );
  });

  function notify(message: string, password?: string) {
    setToast({ message, password });
    if (!password) setTimeout(() => setToast(null), 5000);
  }

  async function toggleEnabled(user: AdminUser) {
    try {
      await usersApi.update(user.id, { enabled: !user.enabled });
      notify(`${user.username} ${user.enabled ? 'desactivado' : 'reactivado'}.`);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    }
  }

  async function resetPassword(user: AdminUser) {
    if (!confirm(`¿Restablecer la contraseña de ${user.username}? Se cerrarán sus sesiones.`)) return;
    try {
      const result = await usersApi.resetPassword(user.id);
      notify(
        `Contraseña de ${user.username} restablecida. Deberá cambiarla al entrar.`,
        result.temporaryPassword,
      );
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña');
    }
  }

  if (!can('admin.users') && !can('admin.roles')) {
    return (
      <div className="px-8 py-10">
        <div className="flex items-start gap-3 max-w-md">
          <ShieldAlert size={18} className="text-[#B45309] mt-0.5" />
          <div>
            <div className="text-[14px] font-medium text-[#1a1f2e]">Sin acceso</div>
            <p className="text-[12px] text-[#58646D] mt-1 leading-relaxed">
              No tienes permisos de administración. Pídele a un administrador el permiso
              <code className="mx-1 text-[11px] bg-[#F4F1EA] px-1 py-0.5 rounded">admin.users</code>
              si necesitas gestionar usuarios.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      {toast && (
        <div className="mb-4 rounded-xl border border-[#E8EBEC] bg-white px-4 py-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12.5px] text-[#1a1f2e]">{toast.message}</div>
            {toast.password && (
              <div className="mt-2">
                <div className="text-[11px] text-[#58646D] mb-1">
                  Contraseña temporal — cópiala ahora, no se vuelve a mostrar:
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[13px] font-mono bg-[#F4F1EA] px-2.5 py-1.5 rounded-lg text-[#1a1f2e] select-all">
                    {toast.password}
                  </code>
                  <button
                    onClick={() => void navigator.clipboard?.writeText(toast.password!)}
                    className="p-1.5 hover:bg-[#FAFAF7] rounded-lg transition"
                    title="Copiar"
                  >
                    <Copy size={13} className="text-[#58646D]" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-[#FAFAF7] rounded transition shrink-0">
            <X size={14} className="text-[#8B999D]" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 bg-white border border-[#E8EBEC] rounded-full p-0.5">
          {(['usuarios', 'roles'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              disabled={id === 'roles' && !can('admin.roles')}
              className={cn(
                'px-4 py-1.5 rounded-full text-[12px] font-medium transition disabled:opacity-40',
                tab === id ? 'bg-[#1a1f2e] text-white' : 'text-[#58646D] hover:text-[#1a1f2e]',
              )}
            >
              {id === 'usuarios' ? 'Usuarios' : 'Roles y permisos'}
            </button>
          ))}
        </div>

        {tab === 'usuarios' && can('admin.users') && (
          <button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition group"
          >
            <Plus size={13} className="group-hover:rotate-90 transition" /> Nuevo usuario
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5 text-[12px] text-[#991B1B] mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-[#8B999D] py-10">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      ) : tab === 'roles' ? (
        <RolesPanel
          roles={roles}
          modules={modules}
          onChanged={(message) => {
            notify(message);
            void load();
          }}
        />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por usuario, nombre o correo…"
                className="bg-white border border-[#E8EBEC] focus:border-[#104B99] rounded-full pl-9 pr-4 py-1.5 text-[12px] w-72 outline-none transition-all placeholder:text-[#BABEC3]"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#58646D] cursor-pointer">
              <input
                type="checkbox"
                checked={showDisabled}
                onChange={(e) => setShowDisabled(e.target.checked)}
                className="accent-[#104B99]"
              />
              Mostrar desactivados
            </label>
            <span className="text-[11.5px] text-[#8B999D] ml-auto">
              {visible.length} de {users.length}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-[#E8EBEC] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8EBEC]">
                  {['Usuario', 'Roles', 'Proyectos', 'Estado', ''].map((header) => (
                    <th
                      key={header}
                      className="text-left text-[10.5px] font-semibold text-[#8B999D] uppercase tracking-[0.08em] px-4 py-2.5"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-[#8B999D]">
                      No hay usuarios que coincidan.
                    </td>
                  </tr>
                )}
                {visible.map((user) => (
                  <tr key={user.id} className="border-b border-[#F4F1EA] last:border-0 hover:bg-[#FAFAF7] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10.5px] font-semibold shrink-0"
                          style={{
                            background: user.enabled
                              ? `linear-gradient(135deg, ${C.blue}, ${C.green})`
                              : '#BABEC3',
                          }}
                        >
                          {initials(user.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-medium text-[#1a1f2e] truncate">
                            {user.fullName}
                            {user.id === currentUser?.id && (
                              <span className="ml-1.5 text-[10px] text-[#8B999D]">(tú)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#8B999D] truncate">
                            {user.username}
                            {user.email && ` · ${user.email}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role.id}
                            className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#F4F1EA] text-[#58646D]"
                          >
                            {role.name}
                          </span>
                        ))}
                        {user.roles.length === 0 && (
                          <span className="text-[10.5px] text-[#B45309]">sin rol</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.allProjects ? (
                        <span className="text-[11.5px] text-[#58646D]">Todos</span>
                      ) : user.projects.length === 0 ? (
                        <span className="text-[11.5px] text-[#B45309]">Ninguno</span>
                      ) : (
                        <span className="text-[11.5px] text-[#58646D]">
                          {user.projects.map((p) => p.projectSlug).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill user={user} />
                    </td>
                    <td className="px-4 py-3">
                      {can('admin.users') && (
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            title="Editar"
                            onClick={() => {
                              setEditing(user);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil size={13} />
                          </IconButton>
                          <IconButton title="Restablecer contraseña" onClick={() => void resetPassword(user)}>
                            <KeyRound size={13} />
                          </IconButton>
                          <IconButton
                            title={user.enabled ? 'Desactivar' : 'Reactivar'}
                            onClick={() => void toggleEnabled(user)}
                            danger={user.enabled}
                          >
                            {user.enabled ? <Power size={13} /> : <UserCheck size={13} />}
                          </IconButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {dialogOpen && (
        <UserDialog
          user={editing}
          roles={roles}
          projects={projects}
          onClose={() => setDialogOpen(false)}
          onSaved={(message, temporaryPassword) => {
            setDialogOpen(false);
            notify(message, temporaryPassword);
            void load();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ user }: { user: AdminUser }) {
  const locked = user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
  if (!user.enabled) {
    return <Pill color="#8B999D" bg="#F1F2F3" label="Desactivado" />;
  }
  if (locked) return <Pill color="#B45309" bg="#FEF3C7" label="Bloqueado" />;
  if (user.mustChangePassword) return <Pill color="#104B99" bg="#E8EFF9" label="Clave temporal" />;
  return <Pill color="#2F7A3C" bg="#E7F4E9" label="Activo" />;
}

function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span
      className="text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  );
}

function IconButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-lg transition',
        danger ? 'text-[#58646D] hover:text-[#DC2626] hover:bg-[#FEF2F2]' : 'text-[#58646D] hover:bg-[#F4F1EA]',
      )}
    >
      {children}
    </button>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
