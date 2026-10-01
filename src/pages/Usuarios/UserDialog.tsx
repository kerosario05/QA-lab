import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { usersApi, type ProjectRef } from '../../services/identity';
import { ApiError } from '../../services/http';
import type { AdminRole, AdminUser } from '../../auth/types';

/**
 * Create / edit dialog.
 *
 * Creating and editing are one form because the fields are the same; the
 * difference is that a new user's roles and project scope travel with the POST,
 * while editing writes them through the three dedicated endpoints (identity,
 * roles, scope) so each change is audited on its own.
 */

interface Props {
  user: AdminUser | null;
  roles: AdminRole[];
  projects: ProjectRef[];
  onClose: () => void;
  onSaved: (message: string, temporaryPassword?: string) => void;
}

export function UserDialog({ user, roles, projects, onClose, onSaved }: Props) {
  const isEdit = user !== null;

  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user?.roles.map((r) => r.slug) ?? [],
  );
  const [allProjects, setAllProjects] = useState(user?.allProjects ?? false);
  const [grants, setGrants] = useState<Record<string, 1 | 2>>(() => {
    const initial: Record<string, 1 | 2> = {};
    for (const project of user?.projects ?? []) initial[project.projectSlug] = project.accessLevel;
    return initial;
  });

  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grantedProjects = useMemo(
    () =>
      Object.entries(grants).map(([slug, accessLevel]) => ({
        slug,
        accessLevel,
      })),
    [grants],
  );

  const canSubmit =
    !busy && username.trim().length >= 3 && fullName.trim().length >= 2 && selectedRoles.length > 0;

  function toggleRole(slug: string) {
    setSelectedRoles((prev) =>
      prev.includes(slug) ? prev.filter((r) => r !== slug) : [...prev, slug],
    );
  }

  function toggleProject(slug: string) {
    setGrants((prev) => {
      const next = { ...prev };
      if (next[slug]) delete next[slug];
      else next[slug] = 1;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setViolations([]);
    setBusy(true);

    try {
      if (!isEdit) {
        const result = await usersApi.create({
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim() || null,
          password: password.trim() || undefined,
          roles: selectedRoles,
          allProjects,
          projects: allProjects ? [] : grantedProjects,
        });
        onSaved(`Usuario ${result.user.username} creado.`, result.temporaryPassword);
        return;
      }

      await usersApi.update(user.id, {
        username: username.trim(),
        fullName: fullName.trim(),
        email: email.trim() || null,
      });

      const rolesChanged =
        selectedRoles.slice().sort().join(',') !==
        user.roles.map((r) => r.slug).sort().join(',');
      if (rolesChanged) await usersApi.setRoles(user.id, selectedRoles);

      const scopeChanged =
        allProjects !== user.allProjects ||
        grantedProjects.length !== user.projects.length ||
        grantedProjects.some(
          (g) =>
            user.projects.find((p) => p.projectSlug === g.slug)?.accessLevel !== g.accessLevel,
        );
      if (scopeChanged) {
        await usersApi.setProjects(user.id, {
          allProjects,
          projects: allProjects ? [] : grantedProjects,
        });
      }

      const warning =
        rolesChanged || scopeChanged
          ? ' Se cerraron sus sesiones activas para aplicar los cambios.'
          : '';
      onSaved(`Usuario ${username.trim()} actualizado.${warning}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (Array.isArray(err.payload?.violations)) setViolations(err.payload.violations);
      } else {
        setError('No se pudo guardar el usuario');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1f2e]/25 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl border border-[#E8EBEC] w-full max-w-[520px] max-h-[88vh] flex flex-col shadow-[0_8px_30px_rgba(26,31,46,0.12)]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#E8EBEC]">
          <div>
            <h2 className="text-[17px] font-medium text-[#1a1f2e]" style={{ letterSpacing: '-0.02em' }}>
              {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <p className="text-[11px] text-[#58646D] mt-0.5">
              {isEdit
                ? 'Los cambios de rol o proyectos cierran sus sesiones activas.'
                : 'Recibirá una contraseña temporal que deberá cambiar al entrar.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#FAFAF7] rounded-lg transition">
            <X size={16} className="text-[#58646D]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Usuario" value={username} onChange={setUsername} placeholder="ana.qa" required />
            <Input label="Nombre completo" value={fullName} onChange={setFullName} placeholder="Ana Quintero" required />
          </div>
          <Input label="Correo" value={email} onChange={setEmail} placeholder="ana@bsc.com.do" type="email" />

          {!isEdit && (
            <Input
              label="Contraseña temporal (opcional)"
              value={password}
              onChange={setPassword}
              placeholder="Se genera automáticamente si lo dejas vacío"
              type="text"
            />
          )}

          <Section title="Roles" hint="Define qué módulos puede usar.">
            <div className="space-y-1.5">
              {roles.map((role) => (
                <label
                  key={role.slug}
                  className={cn(
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition',
                    selectedRoles.includes(role.slug)
                      ? 'border-[#104B99] bg-[#F4F1EA]'
                      : 'border-[#E8EBEC] hover:bg-[#FAFAF7]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.slug)}
                    onChange={() => toggleRole(role.slug)}
                    className="mt-0.5 accent-[#104B99]"
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-[#1a1f2e]">{role.name}</div>
                    {role.description && (
                      <div className="text-[11px] text-[#58646D] leading-snug">{role.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {selectedRoles.length === 0 && (
              <p className="text-[11px] text-[#B45309] mt-1.5">Asigna al menos un rol.</p>
            )}
          </Section>

          <Section title="Proyectos" hint="A qué proyectos tendrá acceso.">
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#E8EBEC] hover:bg-[#FAFAF7] cursor-pointer transition mb-2">
              <input
                type="checkbox"
                checked={allProjects}
                onChange={(e) => setAllProjects(e.target.checked)}
                className="accent-[#104B99]"
              />
              <span className="text-[12px] font-medium text-[#1a1f2e]">Todos los proyectos</span>
            </label>

            {!allProjects && (
              <div className="space-y-1.5">
                {projects.length === 0 && (
                  <p className="text-[11px] text-[#8B999D]">No hay proyectos disponibles.</p>
                )}
                {projects.map((project) => {
                  const granted = grants[project.slug];
                  return (
                    <div
                      key={project.slug}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition',
                        granted ? 'border-[#104B99] bg-[#F4F1EA]' : 'border-[#E8EBEC]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(granted)}
                        onChange={() => toggleProject(project.slug)}
                        className="accent-[#104B99]"
                      />
                      <span className="text-[12px] text-[#1a1f2e] flex-1 min-w-0 truncate">
                        {project.name}
                        <span className="text-[#8B999D] ml-1.5 text-[11px]">{project.slug}</span>
                      </span>
                      {granted && (
                        <select
                          value={granted}
                          onChange={(e) =>
                            setGrants((prev) => ({
                              ...prev,
                              [project.slug]: Number(e.target.value) as 1 | 2,
                            }))
                          }
                          className="text-[11px] border border-[#E8EBEC] rounded-md px-2 py-1 bg-white outline-none focus:border-[#104B99]"
                        >
                          <option value={1}>Lectura</option>
                          <option value={2}>Escritura</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
              <AlertCircle size={14} className="text-[#DC2626] mt-0.5 shrink-0" />
              <div>
                <div className="text-[12px] text-[#991B1B] leading-snug">{error}</div>
                {violations.map((violation) => (
                  <div key={violation} className="text-[11px] text-[#B45309] mt-0.5">
                    · {violation}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#E8EBEC]">
          <button
            onClick={onClose}
            className="text-[12px] font-medium text-[#58646D] hover:text-[#1a1f2e] px-4 py-2 rounded-lg hover:bg-[#FAFAF7] transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#1a1f2e] hover:bg-black disabled:opacity-40 text-white text-[12px] font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#58646D] mb-1.5">
        {label}
        {required && <span style={{ color: C.green }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-lg px-3 py-2 text-[12px] outline-none transition-all placeholder:text-[#BABEC3]"
      />
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-[12px] font-semibold text-[#1a1f2e]">{title}</div>
        {hint && <div className="text-[11px] text-[#8B999D]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
