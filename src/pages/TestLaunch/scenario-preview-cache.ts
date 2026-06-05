import type { LaunchConfig } from './scenario-preview-types';
import type { TRSection } from '../../services/testrail';
import type { TestRailProject } from '../../types';
import type { McpPreviewResponse, McpScenario } from '../../services/scenarios';

export type ScenarioPreviewCacheEntry = {
  response: McpPreviewResponse;
  scenarios: McpScenario[];
  selectedScenarioIds: string[];
  totalScenarios: number;
  sourceSignature?: string;
};

function normalizeSourceSignature(value?: string | null): string {
  return value?.trim() ? value.trim() : "";
}

export function buildScenarioPreviewCacheKey(
  config: LaunchConfig,
  selectedSection: TRSection | null,
  trProjects: TestRailProject[],
  sourceSignature?: string | null,
): string | null {
  if (!config.jiraProject || !config.status) return null;
  const project = trProjects.find(p => String(p.id) === config.testRailProject);
  const suiteId = project?.suites?.[0]?.id ?? null;
  const sectionId = selectedSection?.id ?? null;
  const sourceMode = config.source || 'both';
  const jiraIssueKey = normalizeSourceSignature(config.jiraIssueKey);
  const jiraSummary = normalizeSourceSignature(config.jiraSummary);
  const responseSourceSignature = normalizeSourceSignature(sourceSignature);
  return [
    `projectKey=${config.jiraProject}`,
    `sprintId=${config.sprint || ''}`,
    `status=${config.status}`,
    `testRailProjectId=${config.testRailProject || ''}`,
    `suiteId=${suiteId ?? ''}`,
    `sectionId=${sectionId ?? ''}`,
    `sectionName=${selectedSection?.displayName ?? selectedSection?.name ?? ''}`,
    `sourceMode=${sourceMode}`,
    `jiraIssueKey=${jiraIssueKey}`,
    `jiraSummary=${jiraSummary}`,
    `jiraDescription=${normalizeSourceSignature(config.jiraDescription)}`,
    `sourceSignature=${normalizeSourceSignature(config.sourceSignature) || responseSourceSignature}`,
  ].join('|');
}
