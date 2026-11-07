import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecordedScenario } from '../../services/recordings/types';
import {
  serviceBindingsApi,
  type BindingOwnerRef,
  type BindingParamValue,
  type ScenarioServiceView,
  type ServiceBindingsView,
} from '../../services/service-catalog';
import { bindingFieldsForScenario, segmentsFor } from './service-binding-ui';

/** '' = the recording's general form (every scenario); otherwise one scenario. */
export type BindingScope = string;

/**
 * Catalog services bound to the fields of one recording: the engine's view (effective
 * binding, suggestion and missing fields per scenario) plus the actions that change it.
 * A user without access, or an engine without the catalog, simply gets no view.
 */
export function useRecordingServiceBindings(projectSlug: string, recordingId: string | undefined, scenarios: RecordedScenario[]) {
  const [view, setView] = useState<ServiceBindingsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const owner = useMemo<BindingOwnerRef | null>(
    () => (projectSlug && recordingId ? { projectSlug, ownerType: 'recording', ownerId: recordingId } : null),
    [projectSlug, recordingId],
  );
  const request = useMemo(
    () => scenarios.map((scenario) => ({ scenarioId: scenario.scenarioId, fields: bindingFieldsForScenario(scenario) })),
    [scenarios],
  );
  const requestSignature = JSON.stringify(request.map((scenario) => [scenario.scenarioId, scenario.fields.map((field) => field.key)]));

  useEffect(() => {
    if (!owner || request.length === 0) { setView(null); return; }
    let cancelled = false;
    serviceBindingsApi.view(owner, request)
      .then((next) => { if (!cancelled) { setView(next); setError(null); } })
      .catch(() => { if (!cancelled) setView(null); });
    return () => { cancelled = true; };
    // requestSignature stands for `request`: values typed in the form never change the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, requestSignature, reload]);

  const scenarioView = useCallback(
    (scenarioId: string): ScenarioServiceView | undefined => view?.scenarios.find((scenario) => scenario.scenarioId === scenarioId),
    [view],
  );

  const run = useCallback(async (action: (owner: BindingOwnerRef) => Promise<unknown>) => {
    if (!owner) return;
    setBusy(true);
    setError(null);
    try {
      await action(owner);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el servicio del campo.');
    } finally {
      setBusy(false);
      setReload((value) => value + 1);
    }
  }, [owner]);

  /** The service fills these keys (one field, or the digits of one code). */
  const applyService = useCallback((scope: BindingScope, keys: string[], serviceKey: string, params: Record<string, BindingParamValue>) =>
    run(async (current) => {
      for (const { key, segment } of segmentsFor(keys)) {
        await serviceBindingsApi.save({ ...current, scenarioId: scope, targetValueKey: key, serviceKey, params, segment });
      }
    }), [run]);

  /** This scenario types the value by hand even though the general form uses a service. */
  const typeByHand = useCallback((scenarioId: string, keys: string[]) =>
    run(async (current) => {
      for (const key of keys) await serviceBindingsApi.save({ ...current, scenarioId, targetValueKey: key, serviceKey: null });
    }), [run]);

  /** Drops the binding at this scope: a scenario goes back to the general form. */
  const clear = useCallback((scope: BindingScope, keys: string[]) =>
    run(async (current) => {
      for (const key of keys) await serviceBindingsApi.remove(current, key, scope);
    }), [run]);

  return { view, scenarioView, busy, error, applyService, typeByHand, clear, enabled: Boolean(view) };
}
