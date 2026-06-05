import { describe, expect, it, beforeEach } from 'vitest';
import { saveLaunchConfig, readLaunchConfig, clearLaunchConfig } from './persistence';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and restores config', () => {
    const config = {
      jiraProject: 'AA',
      sprint: 'Sprint 10',
      status: 'Done',
      testRailProjectId: '56',
      testRailSuiteId: '1731',
      testRailSectionId: 4903,
      testRailSectionName: 'Kiosko / Login',
      sourceMode: 'both' as const,
      timestamp: Date.now(),
    };
    saveLaunchConfig(config);
    const restored = readLaunchConfig();
    expect(restored).toBeDefined();
    expect(restored!.jiraProject).toBe('AA');
    expect(restored!.testRailSectionId).toBe(4903);
    expect(restored!.sourceMode).toBe('both');
  });

  it('returns null when no config saved', () => {
    expect(readLaunchConfig()).toBeNull();
  });

  it('clears config', () => {
    saveLaunchConfig({
      jiraProject: 'AA',
      sprint: '',
      status: 'Desestimado',
      testRailProjectId: '',
      testRailSuiteId: undefined,
      testRailSectionId: undefined,
      testRailSectionName: undefined,
      sourceMode: 'jira',
      timestamp: Date.now(),
    });
    expect(readLaunchConfig()).toBeDefined();
    clearLaunchConfig();
    expect(readLaunchConfig()).toBeNull();
  });

  it('returns null for expired config', () => {
    const expired = {
      jiraProject: 'AA',
      sprint: '',
      status: 'Desestimado',
      testRailProjectId: '',
      testRailSuiteId: undefined,
      testRailSectionId: undefined,
      testRailSectionName: undefined,
      sourceMode: 'jira' as const,
      timestamp: Date.now() - 25 * 60 * 60 * 1000,
    };
    localStorage.setItem('qa-lab:launch-config', JSON.stringify(expired));
    expect(readLaunchConfig()).toBeNull();
  });
});
