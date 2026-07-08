/**
 * Normalize a scenario preview response into a standard format.
 */
export function normalizeScenarioPreviewResponse(parsed: any): {
  stories: any[];
  totalScenarios: number;
  rawShape: string;
} {
  const scenarios = parsed?.scenarios ?? parsed?.stories ?? [];
  const stories = Array.isArray(scenarios) ? scenarios : [];
  const totalScenarios = parsed?.summary?.generated
    ?? parsed?.totalScenarios
    ?? stories.length;
  const rawShape = typeof parsed === 'object'
    ? Object.keys(parsed).join(',')
    : typeof parsed;

  return { stories, totalScenarios, rawShape };
}
