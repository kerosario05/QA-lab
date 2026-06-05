const STORAGE_KEY = 'qa-lab:launch-config';

export interface PersistedLaunchConfig {
  jiraProject: string;
  sprint: string;
  status: string;
  jiraIssueKey?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  sourceSignature?: string;
  testRailProjectId: string;
  testRailSuiteId: string | undefined;
  testRailSectionId: number | undefined;
  testRailSectionName: string | undefined;
  sourceMode: 'jira' | 'testrail' | 'both';
  timestamp: number;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000;

export function saveLaunchConfig(config: PersistedLaunchConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, timestamp: Date.now() }));
  } catch {
    console.warn('[persistence] failed to save launch config');
  }
}

export function readLaunchConfig(): PersistedLaunchConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as PersistedLaunchConfig;
    if (!config.timestamp || Date.now() - config.timestamp > DEFAULT_TTL) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

export function clearLaunchConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
