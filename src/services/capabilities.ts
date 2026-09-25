import { useEffect, useState } from 'react';
import { api } from './http';

/**
 * What the engine behind this deployment can actually do.
 *
 * Recording drives a *visible* browser that a person clicks through. A server
 * engine runs headless with no desktop, so the module cannot work there — and
 * the honest thing is to hide it rather than offer a button that always fails.
 */

export interface RecordingCapability {
  enabled: boolean;
  reason?: 'disabled_by_config' | 'no_interactive_desktop';
  message?: string;
}

interface CapabilitiesResponse {
  ok: true;
  recording: RecordingCapability;
  maxConcurrent: number;
}

/**
 * Optimistic default: assume recording works until told otherwise.
 *
 * The alternative — hiding it until the probe answers — makes the menu flicker
 * on every load for the local setups where it does work, which is most of them.
 */
const ASSUMED: RecordingCapability = { enabled: true };

let cached: RecordingCapability | null = null;
let inFlight: Promise<RecordingCapability> | null = null;

export function fetchRecordingCapability(): Promise<RecordingCapability> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = api
    .get<CapabilitiesResponse>('/api/recordings/capabilities')
    .then((response) => {
      cached = response.recording ?? ASSUMED;
      return cached;
    })
    .catch(() => {
      // An older engine has no such endpoint; treating that as "can record"
      // keeps this deployable against a server that has not been updated yet.
      cached = ASSUMED;
      return cached;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useRecordingCapability(): RecordingCapability {
  const [capability, setCapability] = useState<RecordingCapability>(cached ?? ASSUMED);

  useEffect(() => {
    let cancelled = false;
    void fetchRecordingCapability().then((result) => {
      if (!cancelled) setCapability(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return capability;
}
