import { useState } from 'react';
import { AlertCircle, Check, KeyRound, Loader2, LogOut } from 'lucide-react';
import { C } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../services/http';

/**
 * Forced password change on first login (and after an admin reset).
 *
 * This is not a screen the user can skip: the token issued at login is scoped to
 * `password_change_only`, so every other route answers 403 until this succeeds.
 * The rules mirror the engine's policy so the user sees them before submitting
 * rather than as a server rejection.
 */

const RULES: { label: string; test: (value: string, username: string) => boolean }[] = [
  { label: 'Al menos 10 caracteres', test: (v) => v.length >= 10 },
  { label: 'Incluye una letra', test: (v) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(v) },
  { label: 'Incluye un número', test: (v) => /[0-9]/.test(v) },
  {
    label: 'No contiene tu nombre de usuario',
    test: (v, username) =>
      username.length < 3 || !v.toLowerCase().includes(username.toLowerCase()),
  },
  { label: 'Sin espacios al inicio o al final', test: (v) => v.length === 0 || v.trim() === v },
];

export function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const username = user?.username ?? '';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const ruleResults = RULES.map((rule) => ({
    label: rule.label,
    ok: newPassword.length > 0 && rule.test(newPassword, username),
  }));
  const allRulesPass = newPassword.length > 0 && ruleResults.every((r) => r.ok);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = !busy && currentPassword.length > 0 && allRulesPass && matches;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setViolations([]);
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (Array.isArray(err.payload?.violations)) setViolations(err.payload.violations);
      } else {
        setError('No se pudo cambiar la contraseña');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="h-screen flex items-center justify-center px-4"
      style={{ background: C.canvas, fontFamily: '"Geist", system-ui, -apple-system, sans-serif' }}
    >
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-2xl border border-[#E8EBEC] p-7 shadow-[0_1px_3px_rgba(26,31,46,0.04)]">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
            style={{ background: '#F4F1EA' }}
          >
            <KeyRound size={17} style={{ color: C.blue }} />
          </div>

          <h1 className="text-[20px] font-medium text-[#1a1f2e] leading-tight" style={{ letterSpacing: '-0.03em' }}>
            Cambia tu contraseña
          </h1>
          <p className="text-[12px] text-[#58646D] mt-1.5 leading-relaxed">
            Tu contraseña actual es temporal. Define una nueva para continuar
            {user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field
              id="current"
              label="Contraseña temporal"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              autoFocus
            />
            <Field
              id="new"
              label="Nueva contraseña"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />

            <ul className="space-y-1 pt-0.5">
              {ruleResults.map((rule) => (
                <li key={rule.label} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: rule.ok ? C.green : '#E8EBEC' }}
                  >
                    {rule.ok && <Check size={9} className="text-white" strokeWidth={3.5} />}
                  </span>
                  <span style={{ color: rule.ok ? C.inkSoft : C.mute }}>{rule.label}</span>
                </li>
              ))}
            </ul>

            <Field
              id="confirm"
              label="Confirma la nueva contraseña"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              error={confirmPassword.length > 0 && !matches ? 'Las contraseñas no coinciden' : undefined}
            />

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
                <AlertCircle size={14} className="text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12px] text-[#991B1B] leading-snug">{error}</div>
                  {violations.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {violations.map((violation) => (
                        <li key={violation} className="text-[11px] text-[#B45309] leading-snug">
                          · {violation}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#1a1f2e] hover:bg-black disabled:opacity-40 disabled:hover:bg-[#1a1f2e] text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Guardando…' : 'Guardar y continuar'}
            </button>
          </form>
        </div>

        <button
          onClick={() => void logout()}
          className="mx-auto mt-5 flex items-center gap-1.5 text-[11px] text-[#8B999D] hover:text-[#58646D] transition"
        >
          <LogOut size={12} /> Salir
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium text-[#58646D] mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-lg px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]"
        placeholder="••••••••"
      />
      {error && <div className="text-[11px] text-[#DC2626] mt-1">{error}</div>}
    </div>
  );
}
