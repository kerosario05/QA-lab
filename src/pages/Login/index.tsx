import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Lock, User } from 'lucide-react';
import { C } from '../../constants/theme';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../services/http';

/**
 * Sign-in screen.
 *
 * Failure messages come straight from the engine, which deliberately does not
 * distinguish "no such user" from "wrong password". A lockout (423) and a
 * disabled account (403) do say what happened, because the user cannot fix
 * either by trying again.
 */
export function Login() {
  const { login, notice, clearNotice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (notice) setError(notice);
  }, [notice]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setHint(null);
    clearNotice();
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const remaining = err.payload?.remainingAttempts;
        if (typeof remaining === 'number' && remaining > 0) {
          setHint(`Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${remaining} intentos`} antes de que la cuenta se bloquee.`);
        }
        if (err.payload?.lockedUntil) {
          const until = new Date(err.payload.lockedUntil);
          setHint(`Podrás intentarlo de nuevo a las ${until.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}.`);
        }
      } else {
        setError('No se pudo iniciar sesión');
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
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-[11px] rotate-6" style={{ background: C.green }} />
            <div
              className="absolute inset-0 rounded-[11px] -rotate-3 flex items-center justify-center text-white font-bold text-[15px]"
              style={{ background: C.blue, letterSpacing: '-0.03em' }}
            >
              Q
            </div>
          </div>
          <div>
            <div className="text-[16px] font-semibold tracking-tight text-[#1a1f2e] leading-tight">QA Lab</div>
            <div className="text-[10px] text-[#8B999D] uppercase tracking-[0.15em] mt-0.5">Santa Cruz</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8EBEC] p-7 shadow-[0_1px_3px_rgba(26,31,46,0.04)]">
          <h1
            className="text-[20px] font-medium text-[#1a1f2e] leading-tight"
            style={{ letterSpacing: '-0.03em' }}
          >
            Iniciar sesión
          </h1>
          <p className="text-[12px] text-[#58646D] mt-1">Accede con tu usuario corporativo.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="username" className="block text-[11px] font-medium text-[#58646D] mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  className="w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-lg pl-9 pr-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]"
                  placeholder="tu.usuario"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-medium text-[#58646D] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-lg pl-9 pr-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#BABEC3]"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
                <AlertCircle size={14} className="text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12px] text-[#991B1B] leading-snug">{error}</div>
                  {hint && <div className="text-[11px] text-[#B45309] mt-1 leading-snug">{hint}</div>}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="w-full bg-[#1a1f2e] hover:bg-black disabled:opacity-40 disabled:hover:bg-[#1a1f2e] text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-[#8B999D] text-center mt-5 leading-relaxed">
          ¿Olvidaste tu contraseña? Pídele a un administrador que la restablezca.
        </p>
      </div>
    </div>
  );
}
