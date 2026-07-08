export function getRunProviderConfig(): { baseUrl: string; timeoutMs: number } {
  return {
    baseUrl: process.env.RUN_PROVIDER_BASE_URL || 'http://localhost:3002',
    timeoutMs: parseInt(process.env.RUN_PROVIDER_TIMEOUT_MS || '30000', 10),
  };
}

export async function requestDiscoveryBatch(
  _caseIds: number[],
  _options?: any,
  _testRailProjectName?: string,
): Promise<any> {
  throw new Error('Not implemented');
}

export async function requestScenarioPreviewRun(
  _stories: any,
  _projectId: number,
  _suiteId: number,
  _sectionId?: number,
  _testRailProjectName?: string,
  _sectionName?: string,
  _sectionSlug?: string,
  _launchId?: string,
  _testRunId?: number,
  _publishedCases?: Array<{ scenarioId: string; caseId: number; title?: string }>,
  _jiraKey?: string,
): Promise<any> {
  throw new Error('Not implemented');
}
