import type { Story } from './types';

export interface NormalizedPreviewResponse {
  stories: Story[];
  totalScenarios: number;
  sprint: { id: number; name: string } | null;
  rawShape: string;
}

export function normalizeScenarioPreviewResponse(response: unknown): NormalizedPreviewResponse {
  const rawShape = response === null ? 'null'
    : response === undefined ? 'undefined'
    : Array.isArray(response) ? 'array'
    : typeof response === 'object' ? `object:${Object.keys(response as object).join(',')}`
    : typeof response;

  const empty = (): NormalizedPreviewResponse => ({
    stories: [], totalScenarios: 0, sprint: null, rawShape,
  });

  if (!response || typeof response !== 'object') return empty();

  const data = response as Record<string, unknown>;
  let stories: Story[] = [];

  if (Array.isArray(data.stories)) {
    stories = data.stories as Story[];
  } else if (Array.isArray(data.valid)) {
    stories = data.valid as Story[];
  } else if (Array.isArray(data.data)) {
    stories = data.data as Story[];
  } else if (Array.isArray(data.generated)) {
    stories = data.generated as Story[];
  } else if (data.result && typeof data.result === 'object' && Array.isArray((data.result as Record<string, unknown>).scenarios)) {
    stories = (data.result as Record<string, unknown>).scenarios as Story[];
  } else if (Array.isArray(response)) {
    stories = response as Story[];
  }

  const totalScenarios = typeof data.totalScenarios === 'number' ? data.totalScenarios
    : typeof data.total === 'number' ? data.total
    : typeof data.count === 'number' ? data.count
    : stories.length;

  const sprint = data.sprint && typeof data.sprint === 'object'
    ? { id: Number((data.sprint as Record<string, unknown>).id ?? 0), name: String((data.sprint as Record<string, unknown>).name ?? '') }
    : null;

  return { stories, totalScenarios, sprint, rawShape };
}
