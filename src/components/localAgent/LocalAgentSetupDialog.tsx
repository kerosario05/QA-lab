import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Monitor, X } from 'lucide-react';
import { useLocalAgent } from './LocalAgentContext';
import type { LocalAgentInstallState } from '../../services/localAgent';

/**
 * "Preparando la grabación": shows the Chromium install the panel started on the user's
 * PC, the PC picker when several agents share one IP, and install failures.
 */

const READY_AUTO_CLOSE_MS = 3000;

function mb(bytes?: number): string {
  return bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : '';
}

function stageLabel(install: LocalAgentInstallState | null): string {
  switch (install?.state) {
    case 'download':
      return install.totalBytes
        ? `Descargando Chromium… ${mb(install.receivedBytes)} de ${mb(install.totalBytes)}`
        : 'Descargando Chromium…';
    case 'extract':
      return 'Descomprimiendo e instalando…';
    case 'done':
      return 'Terminando…';
    default:
      return 'El servidor está preparando Chromium…';
  }
}

export function LocalAgentSetupDialog() {
  const agent = useLocalAgent();
  const { phase, dialogOpen, closeDialog } = agent;

  useEffect(() => {
    if (!dialogOpen || phase !== 'ready') return;
    const timer = setTimeout(closeDialog, READY_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [dialogOpen, phase, closeDialog]);

  if (!dialogOpen || phase === 'unknown' || phase === 'unavailable') return null;

  const percent = Math.max(0, Math.min(100, Math.round(agent.install?.percent ?? 0)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-agent-setup-title"
      data-testid="local-agent-setup"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1f2e]/25 backdrop-blur-[2px]"
    >
      <div className="bg-white rounded-2xl border border-[#E8EBEC] w-full max-w-[460px] shadow-[0_8px_30px_rgba(26,31,46,0.12)]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#E8EBEC]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3F7FC] text-[#104B99]">
              <Monitor size={18} />
            </span>
            <div>
              <h2 id="local-agent-setup-title" className="text-[17px] font-medium text-[#1a1f2e]" style={{ letterSpacing: '-0.02em' }}>
                {phase === 'ambiguous' ? 'Elige tu equipo' : 'Preparando la grabación'}
              </h2>
              <p className="text-[11px] text-[#58646D] mt-0.5">Las grabaciones se abren en el Chromium de tu equipo.</p>
            </div>
          </div>
          {phase !== 'installing' && (
            <button onClick={closeDialog} aria-label="Cerrar" className="p-1 hover:bg-[#FAFAF7] rounded-lg transition">
              <X size={16} className="text-[#58646D]" />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {phase === 'installing' && (
            <div data-testid="local-agent-installing">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1a1f2e]">
                <Loader2 size={15} className="animate-spin text-[#104B99]" />
                Instalando Chromium en tu equipo para la grabación…
              </div>
              <div
                role="progressbar"
                aria-label="Instalación de Chromium"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#DCE5F1]"
              >
                <div className="h-full rounded-full bg-[#2474C6] transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#58646D]">
                <span>{stageLabel(agent.install)}</span>
                <span className="font-mono font-semibold text-[#1a1f2e]">{percent}%</span>
              </div>
              <p className="mt-4 text-[11px] leading-snug text-[#8B999D]">
                Solo ocurre la primera vez (o cuando QA Lab actualiza el navegador). Puedes seguir usando QA Lab
                mientras termina.
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={closeDialog}
                  className="text-[12px] font-semibold text-[#104B99] hover:bg-[#F3F7FC] px-3 py-2 rounded-full transition"
                >
                  Continuar en segundo plano
                </button>
              </div>
            </div>
          )}

          {phase === 'ready' && (
            <div data-testid="local-agent-ready" className="flex items-start gap-2 text-[13px] text-[#1a1f2e]">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#48A157]" />
              <span>Chromium está listo. Tus grabaciones se abrirán en una ventana de tu equipo.</span>
            </div>
          )}

          {phase === 'error' && (
            <div data-testid="local-agent-error">
              <div className="flex items-start gap-2 text-[13px] text-[#B4463C]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{agent.error ?? 'No se pudo instalar Chromium en tu equipo.'}</span>
              </div>
              <p className="mt-3 text-[11px] text-[#58646D]">
                Mientras tanto puedes grabar con el navegador integrado de QA Lab.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={closeDialog} className="text-[12px] font-semibold text-[#58646D] hover:bg-[#FAFAF7] px-3 py-2 rounded-full transition">
                  Cerrar
                </button>
                <button
                  onClick={() => void agent.startInstall()}
                  className="bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-full transition"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {phase === 'ambiguous' && (
            <div data-testid="local-agent-picker">
              <p className="text-[12px] text-[#58646D]">
                Hay varios equipos con QA Lab conectados desde tu red. Elige en cuál quieres que se abran tus grabaciones:
              </p>
              <ul className="mt-3 space-y-2">
                {(agent.status?.candidates ?? []).map((candidate) => (
                  <li key={candidate.agentId}>
                    <button
                      onClick={() => void agent.select(candidate.agentId)}
                      className="w-full text-left rounded-xl border border-[#E8EBEC] px-4 py-3 hover:border-[#104B99] hover:bg-[#F3F7FC] transition"
                    >
                      <div className="text-[13px] font-medium text-[#1a1f2e]">{candidate.machine}</div>
                      <div className="text-[11px] text-[#58646D]">
                        Usuario de Windows: {candidate.windowsUser}
                        {candidate.chromiumInstalled ? ' · Chromium instalado' : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {agent.error && (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-[#B4463C]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{agent.error}</span>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button onClick={closeDialog} className="text-[12px] font-semibold text-[#58646D] hover:bg-[#FAFAF7] px-3 py-2 rounded-full transition">
                  Ahora no
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
