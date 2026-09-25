import { useState } from 'react';
import { Check, Loader2, Lock, Save, Shield, Trash2 } from 'lucide-react';
import { C, cn } from '../../constants/theme';
import { rolesApi } from '../../services/identity';
import { ApiError } from '../../services/http';
import type { AdminRole, PermissionKey, PermissionModule } from '../../auth/types';

/**
 * Role editor: pick a role, tick the permissions it grants.
 *
 * System roles can be re-scoped but not deleted, and the engine refuses to strip
 * `admin.users` from the last role that carries it — that refusal surfaces here
 * as an inline error rather than a silent no-op.
 */

interface Props {
  roles: AdminRole[];
  modules: PermissionModule[];
  onChanged: (message: string) => void;
}

export function RolesPanel({ roles, modules, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [draft, setDraft] = useState<Set<PermissionKey> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const current = draft ?? new Set(selected?.permissions ?? []);
  const dirty =
    draft !== null &&
    selected !== null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((p) => !draft.has(p)));

  function select(role: AdminRole) {
    setSelectedId(role.id);
    setDraft(null);
    setError(null);
  }

  function toggle(key: PermissionKey) {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
    setError(null);
  }

  async function save() {
    if (!selected || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      await rolesApi.setPermissions(selected.id, [...current]);
      setDraft(null);
      onChanged(
        `Permisos de "${selected.name}" actualizados.` +
          (selected.userCount > 0
            ? ` Se cerraron las sesiones de ${selected.userCount} usuario(s).`
            : ''),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los permisos');
    } finally {
      setBusy(false);
    }
  }

  async function remove(role: AdminRole) {
    if (!confirm(`¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    try {
      await rolesApi.remove(role.id);
      setSelectedId(null);
      onChanged(`Rol "${role.name}" eliminado.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el rol');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4">
      <div className="space-y-1.5">
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => select(role)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-xl border transition',
              role.id === selectedId
                ? 'border-[#104B99] bg-white'
                : 'border-[#E8EBEC] bg-white hover:bg-[#FAFAF7]',
            )}
          >
            <div className="flex items-center gap-1.5">
              <Shield size={13} style={{ color: role.isSystem ? C.blue : C.green }} />
              <span className="text-[12.5px] font-medium text-[#1a1f2e]">{role.name}</span>
              {role.isSystem && <Lock size={10} className="text-[#8B999D]" />}
            </div>
            <div className="text-[10.5px] text-[#8B999D] mt-0.5">
              {role.permissions.length} permisos · {role.userCount} usuario
              {role.userCount === 1 ? '' : 's'}
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#E8EBEC] p-5">
        {!selected ? (
          <p className="text-[12px] text-[#8B999D]">Selecciona un rol para ver sus permisos.</p>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[15px] font-medium text-[#1a1f2e]">{selected.name}</h3>
                {selected.description && (
                  <p className="text-[11.5px] text-[#58646D] mt-0.5">{selected.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!selected.isSystem && (
                  <button
                    onClick={() => void remove(selected)}
                    disabled={busy}
                    className="text-[11.5px] text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
                <button
                  onClick={() => void save()}
                  disabled={!dirty || busy}
                  className="bg-[#1a1f2e] hover:bg-black disabled:opacity-30 text-white text-[11.5px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Guardar
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 text-[11.5px] text-[#991B1B] mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {modules.map((module) => (
                <div key={module.key}>
                  <div className="text-[11px] font-semibold text-[#58646D] uppercase tracking-[0.08em] mb-1.5">
                    {module.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {module.permissions.map((permission) => {
                      const active = current.has(permission.key);
                      return (
                        <button
                          key={permission.key}
                          onClick={() => toggle(permission.key)}
                          title={permission.description}
                          className={cn(
                            'flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition',
                            active
                              ? 'border-[#104B99] bg-[#F4F1EA]'
                              : 'border-[#E8EBEC] hover:bg-[#FAFAF7]',
                          )}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                            style={{ background: active ? C.blue : '#E8EBEC' }}
                          >
                            {active && <Check size={9} className="text-white" strokeWidth={3.5} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[11.5px] text-[#1a1f2e] leading-tight">
                              {permission.label}
                            </span>
                            <span className="block text-[10px] text-[#8B999D] font-mono mt-0.5">
                              {permission.key}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
