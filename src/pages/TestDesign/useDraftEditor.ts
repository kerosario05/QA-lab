import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/http';
import {
  testDesignApi,
  type TestDesignDraftWithStories,
  type TestDesignScenario,
} from '../../services/test-design';
import { isGenerating, mergeServerScenarios } from './scenario-utils';

/**
 * State of one open draft.
 *
 * The server is polled while any story is generating. The editor keeps its own
 * copy of each story's scenarios; edits mark the story dirty and are saved after
 * a pause, and a poll never replaces a dirty story's list. A save that the server
 * refuses with 403 turns the screen read-only rather than retrying forever.
 */

const POLL_MS = 2500;
const SAVE_DELAY_MS = 800;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useDraftEditor(draftId: string) {
  const [draft, setDraft] = useState<TestDesignDraftWithStories | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, TestDesignScenario[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Read by the delayed saves; updateScenarios writes it eagerly so a save never sends a stale list.
  const scenariosRef = useRef(scenarios);
  useEffect(() => {
    scenariosRef.current = scenarios;
  }, [scenarios]);
  const dirty = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(0);

  const applyServerDraft = useCallback((next: TestDesignDraftWithStories) => {
    setDraft(next);
    setScenarios((local) => mergeServerScenarios(local, next.stories, dirty.current));
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyServerDraft(await testDesignApi.getDraft(draftId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [draftId, applyServerDraft]);

  useEffect(() => {
    let cancelled = false;
    testDesignApi
      .getDraft(draftId)
      .then((next) => {
        if (!cancelled) applyServerDraft(next);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, applyServerDraft]);

  const anyGenerating = Boolean(draft?.stories.some(isGenerating));
  useEffect(() => {
    if (!anyGenerating) return;
    const handle = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(handle);
  }, [anyGenerating, refresh]);

  const save = useCallback(
    async (storyId: string) => {
      const version = versions.current.get(storyId) ?? 0;
      const list = scenariosRef.current[storyId] ?? [];
      inFlight.current += 1;
      setSaveState('saving');
      try {
        const saved = await testDesignApi.saveScenarios(draftId, storyId, list);
        // Only clean if nothing changed while the request was in flight.
        if ((versions.current.get(storyId) ?? 0) === version) {
          dirty.current.delete(storyId);
          // Adopt the shared engine's derived data fields, while keeping an empty row being authored.
          const normalized = list.map(local => {
            const stored = saved.scenarios.find(scenario => scenario.id === local.id);
            if (!stored) return local;
            const localData = local.data ?? [];
            const dataIdentity = (datum: NonNullable<TestDesignScenario['data']>[number]) =>
              `${datum.key.toLowerCase()}|${datum.label?.toLowerCase() ?? ''}|${datum.condition ?? ''}`;
            const localByIdentity = new Map(localData.map(datum => [dataIdentity(datum), datum]));
            const storedData = stored.data ?? [];
            const storedIdentities = new Set(storedData.map(dataIdentity));
            const data = [
              ...storedData.map(datum => {
                // The service currently omits the UI-only catalog binding from its save response.
                // Keep it locally so catalog hydration does not reapply and autosave it forever.
                const binding = localByIdentity.get(dataIdentity(datum))?.catalogBinding;
                return binding ? { ...datum, catalogBinding: binding } : datum;
              }),
              ...localData.filter(datum => !storedIdentities.has(dataIdentity(datum))),
            ];
            return { ...stored, steps: local.steps, data };
          });
          scenariosRef.current = { ...scenariosRef.current, [storyId]: normalized };
          setScenarios(current => ({ ...current, [storyId]: normalized }));
        }
        setSaveError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        setSaveError(err instanceof Error ? err.message : String(err));
        setSaveState('error');
        return;
      } finally {
        inFlight.current -= 1;
      }
      if (inFlight.current === 0 && dirty.current.size === 0) setSaveState('saved');
    },
    [draftId],
  );

  const updateScenarios = useCallback(
    (storyId: string, update: TestDesignScenario[] | ((current: TestDesignScenario[]) => TestDesignScenario[])) => {
      const current = scenariosRef.current[storyId] ?? [];
      const next = typeof update === 'function' ? update(current) : update;
        // Catalog hydration and other derived UI updates can resolve to the exact
        // same list. Do not turn those no-ops into dirty edits/autosaves.
        if (next === current) return;
      setScenarios((current) => ({ ...current, [storyId]: next }));
      scenariosRef.current = { ...scenariosRef.current, [storyId]: next };
      dirty.current.add(storyId);
      versions.current.set(storyId, (versions.current.get(storyId) ?? 0) + 1);
      setSaveState('pending');
      const existing = timers.current.get(storyId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        storyId,
        setTimeout(() => {
          timers.current.delete(storyId);
          void save(storyId);
        }, SAVE_DELAY_MS),
      );
    },
    [save],
  );

  /** Saves every pending story now (before publishing or leaving). */
  const flush = useCallback(async () => {
    const pending = [...timers.current.keys()];
    for (const storyId of pending) {
      clearTimeout(timers.current.get(storyId));
      timers.current.delete(storyId);
    }
    await Promise.all([...dirty.current].map((storyId) => save(storyId)));
  }, [save]);

  const hasUnsaved = saveState === 'pending' || saveState === 'saving' || saveState === 'error';

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  // Leaving the draft (back to the list) must not drop an edit still waiting for its delay.
  useEffect(
    () => () => {
      for (const [storyId, handle] of timers.current) {
        clearTimeout(handle);
        void save(storyId);
      }
      timers.current.clear();
    },
    [save],
  );

  return {
    draft,
    scenarios,
    loadError,
    saveState,
    saveError,
    forbidden,
    hasUnsaved,
    anyGenerating,
    refresh,
    applyServerDraft,
    updateScenarios,
    flush,
    isDirty: (storyId: string) => dirty.current.has(storyId),
  };
}
