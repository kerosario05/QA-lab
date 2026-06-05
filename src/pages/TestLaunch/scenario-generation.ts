import type { JiraIssue } from '../../services/jira';
import type { Story, StoryScenario, McpScenario, McpPreviewResponse } from '../../services/scenarios';
import type { TRSection } from '../../services/testrail';
import type { LaunchConfig } from './scenario-preview-types';

export interface ActiveGenerationSource {
  jiraIssueKey: string;
  jiraSummary: string;
  sourceMode: string;
  sectionId: number | null;
  sectionName: string | null;
  sourceCaseIds: string[];
}

export interface NormalizedGeneratedScenarios {
  stories: Story[];
  totalScenarios: number;
  activeGenerationSource: ActiveGenerationSource | null;
  cached: boolean;
}

export function isAsyncPreviewResponse(
  response: McpPreviewResponse | { stories?: Story[]; scenarios?: McpScenario[]; totalScenarios?: number; cached?: boolean; jobId?: string; job?: { id?: string; status?: string } | null; status?: string } | null | undefined,
): boolean {
  if (!response || typeof response !== 'object') return false;
  const candidate = response as Record<string, unknown>;
  const status = typeof candidate.status === 'string' ? candidate.status.toLowerCase() : '';
  if (status === 'pending' || status === 'queued' || status === 'running' || status === 'processing') return true;
  if (typeof candidate.jobId === 'string' && candidate.jobId.trim()) return true;
  const job = candidate.job && typeof candidate.job === 'object' ? candidate.job as Record<string, unknown> : null;
  if (job) {
    const jobStatus = typeof job.status === 'string' ? job.status.toLowerCase() : '';
    if (jobStatus === 'pending' || jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'processing') return true;
    if (typeof job.id === 'string' && job.id.trim()) return true;
  }
  return false;
}

function normalizeSteps(steps: string[] | { content?: string; expected?: string }[] | null | undefined): StoryScenario['custom_steps_separated'] {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step) => {
      if (typeof step === 'string') {
        return { content: step, expected: '' };
      }
      return {
        content: String(step?.content ?? '').trim(),
        expected: String(step?.expected ?? '').trim(),
      };
    })
    .filter((step) => Boolean(step.content));
}

function uniqueStories(stories: Story[]): Story[] {
  const seen = new Set<string>();
  return stories.filter((story) => {
    if (!story.jiraKey) return false;
    if (seen.has(story.jiraKey)) return false;
    seen.add(story.jiraKey);
    return true;
  });
}

function buildStoriesFromMcpScenarios(scenarios: McpScenario[], selectedIssueKey: string, selectedIssueSummary: string): Story[] {
  const grouped = new Map<string, Story>();

  scenarios.forEach((scenario, index) => {
    const storyKey = scenario.sourceIssueKey?.trim() || selectedIssueKey || `scenario-${index + 1}`;
    const scenarioStory = grouped.get(storyKey) ?? {
      jiraKey: storyKey,
      title: selectedIssueSummary || scenario.sourceTrace?.jiraSummary || scenario.title || storyKey,
      storyType: scenario.type,
      generatedByAi: true,
      scenarioCount: 0,
      scenarios: [],
    };

    const mappedScenario: StoryScenario & Record<string, unknown> = {
      title: scenario.title,
      refs: `${storyKey}-${scenario.scenarioId ?? scenario.caseId ?? index + 1}`,
      custom_preconds: Array.isArray(scenario.preconditions) && scenario.preconditions.length > 0 ? scenario.preconditions.join('\n') : null,
      custom_expected: scenario.expectedResult || '',
      custom_steps_separated: normalizeSteps(scenario.steps),
      sourceTrace: scenario.sourceTrace ?? scenario.generationSource ?? {
        sourceMode: 'jira',
        jiraIssueKey: storyKey,
        jiraSummary: selectedIssueSummary,
        testRailProjectId: null,
        suiteId: null,
        sectionId: null,
        sectionName: null,
        sourceCaseIds: [],
      },
    };

    scenarioStory.scenarios = [...(scenarioStory.scenarios ?? []), mappedScenario as StoryScenario];
    scenarioStory.scenarioCount = scenarioStory.scenarios.length;
    grouped.set(storyKey, scenarioStory);
  });

  return uniqueStories(Array.from(grouped.values()));
}

export function normalizeGeneratedScenarios(
  response: McpPreviewResponse | { stories?: Story[]; scenarios?: McpScenario[]; totalScenarios?: number; cached?: boolean } | null | undefined,
  selectedIssue: JiraIssue | null,
  config: LaunchConfig,
  selectedSection: TRSection | null,
): NormalizedGeneratedScenarios {
  const jiraIssueKey = selectedIssue?.key?.trim() || config.jiraIssueKey?.trim() || '';
  const jiraSummary = selectedIssue?.summary?.trim() || config.jiraSummary?.trim() || '';

  const cached = Boolean((response as { cached?: boolean } | null | undefined)?.cached);
  const sourceCaseIds = Array.isArray((response as McpPreviewResponse | null | undefined)?.source?.issuesFound)
    ? []
    : [];

  if (response && Array.isArray((response as { stories?: Story[] }).stories) && (response as { stories?: Story[] }).stories!.length > 0) {
    const stories = uniqueStories((response as { stories?: Story[] }).stories!.map((story) => ({
      ...story,
      scenarios: Array.isArray(story.scenarios) ? story.scenarios : [],
    })));
    return {
      stories,
      totalScenarios: (response as { totalScenarios?: number }).totalScenarios ?? stories.reduce((acc, story) => acc + (story.scenarioCount ?? story.scenarios.length ?? 0), 0),
      activeGenerationSource: {
        jiraIssueKey,
        jiraSummary,
        sourceMode: config.source,
        sectionId: selectedSection?.id ?? null,
        sectionName: selectedSection?.name ?? null,
        sourceCaseIds,
      },
      cached,
    };
  }

  if (response && Array.isArray((response as McpPreviewResponse).scenarios) && (response as McpPreviewResponse).scenarios.length > 0) {
    const stories = buildStoriesFromMcpScenarios((response as McpPreviewResponse).scenarios, jiraIssueKey, jiraSummary);
    return {
      stories,
      totalScenarios: (response as McpPreviewResponse).summary?.generated ?? stories.reduce((acc, story) => acc + (story.scenarioCount ?? story.scenarios.length ?? 0), 0),
      activeGenerationSource: {
        jiraIssueKey,
        jiraSummary,
        sourceMode: config.source,
        sectionId: selectedSection?.id ?? null,
        sectionName: selectedSection?.name ?? null,
        sourceCaseIds,
      },
      cached,
    };
  }

  return {
    stories: [],
    totalScenarios: 0,
    activeGenerationSource: jiraIssueKey
      ? {
        jiraIssueKey,
        jiraSummary,
        sourceMode: config.source,
        sectionId: selectedSection?.id ?? null,
        sectionName: selectedSection?.name ?? null,
        sourceCaseIds,
      }
      : null,
    cached,
  };
}
