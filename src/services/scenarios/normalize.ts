/**
 * Normalize a scenario preview response into a standard format.
 * Groups flat scenario items by jiraKey when stories lack populated scenarios[].
 */

function extractKeyFromText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const match = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match?.[1];
}

export function normalizeScenarioPreviewResponse(parsed: any): {
  stories: any[];
  totalScenarios: number;
  rawShape: string;
} {
  const raw = parsed?.stories ?? parsed?.scenarios ?? [];
  const flatItems: any[] = Array.isArray(raw) ? raw : [];

  console.log('[scenario-normalize] input', {
    source: Object.keys(parsed ?? {}).slice(0, 5).join(','),
    flatCount: flatItems.length,
    firstKeys: flatItems[0] ? Object.keys(flatItems[0]).slice(0, 8) : [],
    firstSteps: flatItems[0]?.steps?.[0],
    firstCustomSteps: flatItems[0]?.custom_steps_separated?.[0],
    firstPreconds: flatItems[0]?.custom_preconds,
  });

  const totalScenarios = parsed?.summary?.generated
    ?? parsed?.totalScenarios
    ?? flatItems.length;
  const rawShape = typeof parsed === 'object'
    ? Object.keys(parsed).join(',')
    : typeof parsed;

  // If items already have populated scenarios[], return as-is
  if (flatItems.some((item: any) => Array.isArray(item.scenarios) && item.scenarios.length > 0)) {
    return { stories: flatItems, totalScenarios, rawShape };
  }

  // Group flat scenario items by jiraKey
  const grouped = new Map<string, any>();
  for (const item of flatItems) {
    // Robust key extraction: try named fields, then regex pattern matching
    const jiraKey =
      item.jiraKey ??
      item.issueKey ??
      item.key ??
      item.refs ??
      item.ref ??
      item.sourceIssueKey ??
      item.storyKey ??
      item.externalId ??
      extractKeyFromText(item.title) ??
      extractKeyFromText(item.summary) ??
      extractKeyFromText(JSON.stringify(item ?? {})) ??
      'UNKNOWN';
    const storyTitle = item.storyTitle ?? item.issueTitle ?? item.jiraSummary ?? item.title ?? jiraKey;
    const existing = grouped.get(jiraKey) ?? {
      jiraKey,
      title: storyTitle,
      storyType: item.storyType,
      generatedByAi: item.generatedByAi ?? true,
      scenarioCount: 0,
      scenarios: [] as any[],
    };

    const stepRaw = item.custom_steps_separated ?? item.steps ?? [];
    const steps: Array<{ content: string; expected: string }> = Array.isArray(stepRaw)
      ? stepRaw.map((s: any, i: number) => {
          if (typeof s === 'string') return { content: s, expected: '' };
          return {
            content: s.content ?? s.step ?? s.action ?? s.text ?? s.description ?? `Paso ${i + 1}`,
            expected: s.expected ?? s.result ?? s.assertion ?? '',
          };
        })
      : (typeof stepRaw === 'string' ? stepRaw.split(/\r?\n/).filter(Boolean).map(s => ({ content: s, expected: '' })) : []);

    const preconds = item.custom_preconds ?? item.preconditions ?? '';
    const title = item.title ?? item.scenarioTitle ?? item.name ?? `Escenario ${existing.scenarios.length + 1}`;

    existing.scenarios.push({
      title,
      refs: item.refs ?? item.jiraKey ?? jiraKey,
      custom_preconds: Array.isArray(preconds) ? preconds.join('\n') : String(preconds),
      custom_expected: item.custom_expected ?? item.expectedResult ?? item.expected ?? '',
      custom_steps_separated: steps,
    });
    existing.scenarioCount = existing.scenarios.length;
    grouped.set(jiraKey, existing);
  }

  const stories = Array.from(grouped.values());
  console.log('[scenario-normalize] output', { stories: stories.length, firstScenarios: stories[0]?.scenarios?.length });

  return { stories, totalScenarios, rawShape };
}
