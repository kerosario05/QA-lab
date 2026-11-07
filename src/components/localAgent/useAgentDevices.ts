import { useCallback, useEffect, useRef, useState } from 'react';
import { localAgentApi, type LocalAgentStatus } from '../../services/localAgent';

const POLL_MS = 3000;

/**
 * The Android devices of the agent on this PC, asked while a device picker is on screen: the
 * user opens emulators or plugs phones in on their own, and the server refreshes the agent's
 * view on each status call.
 */
export function useAgentDevices(enabled: boolean) {
  const [status, setStatus] = useState<LocalAgentStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await localAgentApi.status();
      if (!aliveRef.current) return;
      setStatus(next);
    } catch {
      // No agent routes or a transient failure: the picker falls back to the server.
      if (aliveRef.current) setStatus(null);
    } finally {
      if (aliveRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) return () => { aliveRef.current = false; };
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      aliveRef.current = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, refresh]);

  const startEmulator = useCallback(async (avd: string) => {
    setError(null);
    setStarting(avd);
    try {
      await localAgentApi.startEmulator(avd);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(null);
    }
  }, [refresh]);

  const agent = status?.pairing === 'found' ? status.agent : null;
  return {
    loaded,
    pairing: status?.pairing ?? 'none',
    agent,
    android: agent?.androidReady ? agent.android ?? null : null,
    emulator: status?.emulator ?? null,
    error,
    starting,
    startEmulator,
    refresh,
  };
}
