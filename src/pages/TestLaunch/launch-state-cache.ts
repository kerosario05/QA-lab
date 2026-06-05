import type { McpScenario, McpPreviewResponse, Story } from '../../services/scenarios';
import type { TRSection, TRCase } from '../../services/testrail';
import type { LaunchConfig } from './scenario-preview-types';

export interface SavedLaunchState {
  config: LaunchConfig;
  mcpScenarios: McpScenario[];
  mcpPreview: McpPreviewResponse | null;
  selectedMcpScenarioIds: string[];
  selectedTrCaseIds: number[];
  selectedSection: TRSection | null;
  stories: Story[];
  totalScenarios: number;
  sprintMeta: { id: number; name: string } | null;
  step3Tab: 'scenarios' | 'cases';
  trCases: TRCase[];
  scenarioPreviewKey: string | null;
  scenarioPreviewSourceSignature?: string;
}

let savedState: SavedLaunchState | null = null;

export function saveLaunchState(state: SavedLaunchState): void {
  savedState = { ...state };
}

export function readLaunchState(): SavedLaunchState | null {
  return savedState;
}

export function clearLaunchState(): void {
  savedState = null;
}
