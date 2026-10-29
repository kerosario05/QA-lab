import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../services/http';
import { downloadAgentInstaller, localAgentApi, type LocalAgentInstallState, type LocalAgentStatus } from '../../services/localAgent';

/**
 * Whether this PC can record in its own Chromium (via the QA Lab agent).
 *
 * Checked once right after login: when the agent is there but Chromium is not, the
 * install starts on its own and the setup dialog shows its progress. No agent is not
 * an error — recordings keep using the integrated (server) browser — but the login
 * offers to install it: the browser cannot run installers, so accepting downloads a
 * small .cmd the user opens, and the panel waits for the agent to connect.
 */

/**
 * The install offer shown at login when this PC has no agent:
 * prompt -> waiting (installer downloaded, polling for the agent) -> not_detected (gave up).
 */
export type LocalAgentOffer = 'hidden' | 'prompt' | 'waiting' | 'not_detected';

const OFFER_DISMISSED_KEY = 'qalab.localAgent.offerDismissed';
const AGENT_WAIT_POLL_MS = 3000;
const AGENT_WAIT_MAX_MS = 10 * 60 * 1000;

function offerDismissed(): boolean {
  try {
    return localStorage.getItem(OFFER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export type LocalAgentPhase =
  | 'unknown'      // not checked yet
  | 'unavailable'  // no agent on this PC, or the server cannot hand out Chromium
  | 'ambiguous'    // several agents behind this IP: the user must pick their PC
  | 'installing'
  | 'ready'
  | 'error';       // install failed or the agent disconnected mid-install

type LocalAgentContextValue = {
  phase: LocalAgentPhase;
  status: LocalAgentStatus | null;
  install: LocalAgentInstallState | null;
  error: string | null;
  dialogOpen: boolean;
  offer: LocalAgentOffer;
  /** Downloads the agent installer and waits for the agent to connect. */
  acceptOffer: () => void;
  /** "Ahora no" hides it until the next login; `forever` remembers it in this browser. */
  declineOffer: (forever?: boolean) => void;
  /** Asks the server again; installs Chromium if the agent is there without it. */
  check: () => Promise<LocalAgentStatus | null>;
  startInstall: () => Promise<void>;
  select: (agentId: string) => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
};

const LocalAgentContext = createContext<LocalAgentContextValue | null>(null);

const POLL_MS = 1000;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function LocalAgentProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<LocalAgentPhase>('unknown');
  const [status, setStatus] = useState<LocalAgentStatus | null>(null);
  const [install, setInstall] = useState<LocalAgentInstallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [offer, setOffer] = useState<LocalAgentOffer>('hidden');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const installingRef = useRef(false);
  const checkingRef = useRef<Promise<LocalAgentStatus | null> | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (agentWaitRef.current) clearTimeout(agentWaitRef.current);
    };
  }, []);

  const pollInstall = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      if (!aliveRef.current) return;
      try {
        const next = await localAgentApi.status();
        if (!aliveRef.current) return;
        setStatus(next);
        if (next.pairing !== 'found') {
          installingRef.current = false;
          setPhase('error');
          setError('Se perdió la conexión con el agente de QA Lab de tu equipo durante la instalación.');
          return;
        }
        setInstall(next.install);
        if (next.ready) {
          installingRef.current = false;
          setPhase('ready');
          return;
        }
        if (next.install?.state === 'error') {
          installingRef.current = false;
          setPhase('error');
          setError(next.install.message ?? 'La instalación de Chromium falló.');
          return;
        }
      } catch {
        // A transient poll failure (server restarting) must not end the install view.
      }
      pollInstall();
    }, POLL_MS);
  }, []);

  const startInstall = useCallback(async () => {
    if (installingRef.current) {
      setDialogOpen(true);
      return;
    }
    installingRef.current = true;
    setError(null);
    setPhase('installing');
    setDialogOpen(true);
    try {
      const res = await localAgentApi.install();
      if (!aliveRef.current) return;
      setInstall(res.install);
      pollInstall();
    } catch (err) {
      installingRef.current = false;
      if (!aliveRef.current) return;
      setPhase('error');
      setError(messageOf(err));
    }
  }, [pollInstall]);

  const apply = useCallback((next: LocalAgentStatus) => {
    setStatus(next);
    setInstall(next.install);
    if (next.pairing === 'ambiguous') {
      setPhase('ambiguous');
      setDialogOpen(true);
    } else if (next.pairing === 'none' || !next.requiredRevision) {
      setPhase('unavailable');
    } else if (next.ready) {
      setPhase('ready');
    } else {
      void startInstall();
    }
  }, [startInstall]);

  const check = useCallback(() => {
    if (installingRef.current) return Promise.resolve(status);
    if (checkingRef.current) return checkingRef.current;
    const run = (async () => {
      try {
        const next = await localAgentApi.status();
        if (aliveRef.current) apply(next);
        return next;
      } catch (err) {
        // 403 (no recording permission) or an engine without the agent routes: the
        // integrated browser keeps working, so this is never shown as an error.
        if (aliveRef.current && !(err instanceof ApiError && err.isUnauthenticated)) setPhase('unavailable');
        return null;
      } finally {
        checkingRef.current = null;
      }
    })();
    checkingRef.current = run;
    return run;
  }, [apply, status]);

  const select = useCallback(async (agentId: string) => {
    setError(null);
    try {
      const next = await localAgentApi.select(agentId);
      apply(next);
      if (next.ready) setDialogOpen(false);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [apply]);

  // After the installer is downloaded: ask until the agent connects (then `apply` starts
  // the Chromium install and its dialog), or give up after AGENT_WAIT_MAX_MS.
  const waitForAgent = useCallback((startedAt: number) => {
    if (agentWaitRef.current) clearTimeout(agentWaitRef.current);
    agentWaitRef.current = setTimeout(async () => {
      if (!aliveRef.current) return;
      try {
        const next = await localAgentApi.status();
        if (!aliveRef.current) return;
        if (next.pairing !== 'none') {
          setOffer('hidden');
          apply(next);
          return;
        }
      } catch {
        // Transient failure (server restarting): keep waiting.
      }
      if (Date.now() - startedAt >= AGENT_WAIT_MAX_MS) {
        setOffer('not_detected');
        return;
      }
      waitForAgent(startedAt);
    }, AGENT_WAIT_POLL_MS);
  }, [apply]);

  const acceptOffer = useCallback(() => {
    downloadAgentInstaller();
    setOffer('waiting');
    waitForAgent(Date.now());
  }, [waitForAgent]);

  const declineOffer = useCallback((forever = false) => {
    if (agentWaitRef.current) clearTimeout(agentWaitRef.current);
    if (forever) {
      try {
        localStorage.setItem(OFFER_DISMISSED_KEY, '1');
      } catch {
        // Storage unavailable: it is simply offered again at the next login.
      }
    }
    setOffer('hidden');
  }, []);

  // Once per login: the Workspace (and this provider) mounts only when authenticated.
  // Only this check offers the agent; later checks (Recording page) never re-prompt.
  useEffect(() => {
    if (!enabled) return;
    void check().then((next) => {
      if (aliveRef.current && next?.pairing === 'none' && next.requiredRevision && !offerDismissed()) setOffer('prompt');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const value = useMemo<LocalAgentContextValue>(() => ({
    phase,
    status,
    install,
    error,
    dialogOpen,
    offer,
    acceptOffer,
    declineOffer,
    check,
    startInstall,
    select,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
  }), [phase, status, install, error, dialogOpen, offer, acceptOffer, declineOffer, check, startInstall, select]);

  return <LocalAgentContext.Provider value={value}>{children}</LocalAgentContext.Provider>;
}

// Outside the provider (isolated page renders) there is simply no agent: integrated browser.
const NO_AGENT: LocalAgentContextValue = {
  phase: 'unavailable',
  status: null,
  install: null,
  error: null,
  dialogOpen: false,
  offer: 'hidden',
  acceptOffer: () => undefined,
  declineOffer: () => undefined,
  check: async () => null,
  startInstall: async () => undefined,
  select: async () => undefined,
  openDialog: () => undefined,
  closeDialog: () => undefined,
};

export function useLocalAgent(): LocalAgentContextValue {
  return useContext(LocalAgentContext) ?? NO_AGENT;
}
