import { describe, it, expect } from 'vitest';
import { buildTestRailRuntimePayloadFragment, resolveTestRailInputGate, buildTestRailLaunchPayload } from './test-launch-payload';

describe('TestRail input gate', () => {
  it('A: blocks the launch when a selected case has required inputs empty', () => {
    expect(resolveTestRailInputGate({ hasSelectedCases: true, inputsBlocked: true }).blocked).toBe(true);
  });

  it('B: allows the launch when required inputs are complete', () => {
    expect(resolveTestRailInputGate({ hasSelectedCases: true, inputsBlocked: false }).blocked).toBe(false);
  });

  it('never blocks when there are no selected cases', () => {
    expect(resolveTestRailInputGate({ hasSelectedCases: false, inputsBlocked: true }).blocked).toBe(false);
  });
});

describe('TestRail runtime payload fragment', () => {
  it('C: includes runtimeEntriesByCase intact in the payload', () => {
    const entries = {
      '4171': [{ key: 'auth.username', value: 'user', source: 'manual_runtime', sensitive: false }],
    };
    const fragment = buildTestRailRuntimePayloadFragment({ hasSelectedCases: true, runtimeEntriesByCase: entries });
    expect(fragment.runtimeEntriesByCase).toEqual(entries);
  });

  it('D: omits runtimeEntriesByCase when absent or without selected cases', () => {
    expect(buildTestRailRuntimePayloadFragment({ hasSelectedCases: true, runtimeEntriesByCase: undefined })).toEqual({});
    expect(buildTestRailRuntimePayloadFragment({ hasSelectedCases: false, runtimeEntriesByCase: { '1': [] } })).toEqual({});
    expect(buildTestRailLaunchPayload({ hasSelectedCases: true, runtimeEntriesByCase: { '1': [] } })).toEqual({});
  });

  it('supports opt-in context-only without changing runtime entries', () => {
    const entries = { '1': [{ key: 'auth.password', value: 'fixture', source: 'manual_runtime', sensitive: true }] };
    expect(buildTestRailLaunchPayload({ hasSelectedCases: true, runtimeEntriesByCase: entries })).toEqual({ runtimeEntriesByCase: entries });
    expect(buildTestRailLaunchPayload({ hasSelectedCases: true, runtimeEntriesByCase: entries, contextOnly: true })).toEqual({ runtimeEntriesByCase: entries, contextOnly: true });
  });

  it('includes filled runtime values in the execution launch payload', () => {
    const entries = {
      '44721': [{ key: 'customerId', value: '12345', source: 'manual_runtime', sensitive: false }],
    };
    expect(buildTestRailLaunchPayload({ hasSelectedCases: true, runtimeEntriesByCase: entries }).runtimeEntriesByCase)
      .toEqual(entries);
  });

  it('keeps runtime values isolated by case id in the execution launch payload', () => {
    const entries = {
      '44721': [{ key: 'customerId', value: '12345', source: 'manual_runtime', sensitive: false }],
      '44722': [{ key: 'customerId', value: '67890', source: 'manual_runtime', sensitive: false }],
    };
    expect(buildTestRailLaunchPayload({ hasSelectedCases: true, runtimeEntriesByCase: entries }).runtimeEntriesByCase)
      .toEqual(entries);
  });
});
