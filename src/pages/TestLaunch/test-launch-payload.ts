export type LaunchRuntimeEntry = {
  key: string;
  value: string;
  source?: string;
  sensitive?: boolean;
};

export function resolveTestRailInputGate(input: {
  hasSelectedCases: boolean;
  inputsBlocked: boolean;
}): { blocked: boolean; reason?: string } {
  if (input.hasSelectedCases && input.inputsBlocked) return { blocked: true, reason: 'missing_required_inputs' };
  return { blocked: false };
}

export function buildTestRailRuntimePayloadFragment(input: {
  hasSelectedCases: boolean;
  runtimeEntriesByCase?: Record<string, LaunchRuntimeEntry[]>;
}): { runtimeEntriesByCase?: Record<string, LaunchRuntimeEntry[]> } {
  if (input.hasSelectedCases && input.runtimeEntriesByCase) return { runtimeEntriesByCase: input.runtimeEntriesByCase };
  return {};
}

export function buildTestRailLaunchPayload(input: {
  hasSelectedCases: boolean;
  runtimeEntriesByCase?: Record<string, LaunchRuntimeEntry[]>;
  contextOnly?: boolean;
}): { runtimeEntriesByCase?: Record<string, LaunchRuntimeEntry[]>; contextOnly?: true } {
  const entries = input.runtimeEntriesByCase;
  const hasRuntimeEntries = entries && Object.values(entries).some((caseEntries) => caseEntries.length > 0);
  if (!input.hasSelectedCases || !hasRuntimeEntries) return {};
  return { runtimeEntriesByCase: entries, ...(input.contextOnly ? { contextOnly: true } : {}) };
}
