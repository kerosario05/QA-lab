import { describe, expect, it } from 'vitest';

import { buildScenarioPreviewRequest } from './scenario-preview-request';

describe('scenario preview request', () => {
  it('includes sprintId when a sprint id exists', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sprintId: 123,
      useActiveSprint: true,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.sprintId).toBe(123);
    expect(payload.activeSprint).toBeUndefined();
    expect(payload.jiraIssueKey).toBe('AA-82');
    expect(payload.jiraSummary).toBe('Alta de producto');
    expect(payload.jiraDescription).toBe('Descripción');
  });

  it('includes activeSprint=true when no sprint id exists', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      useActiveSprint: true,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.activeSprint).toBe(true);
    expect(payload.sprintId).toBeUndefined();
  });

  it('does not alter source fields unrelated to sprint selection', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sprintId: 55,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.projectKey).toBe('QA');
    expect(payload.status).toBe('Desestimado');
    expect(payload.maxResults).toBe(50);
    expect(payload.jiraIssueKey).toBe('AA-82');
    expect(payload.jiraSummary).toBe('Alta de producto');
    expect(payload.jiraDescription).toBe('Descripción');
  });

  it('omits sprintId and activeSprint when neither is provided', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.sprintId).toBeUndefined();
    expect(payload.activeSprint).toBeUndefined();
  });

  it('does not send sprintId when value is null or undefined', () => {
    const payload1 = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sprintId: null,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });
    const payload2 = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sprintId: undefined,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload1.sprintId).toBeUndefined();
    expect(payload1.activeSprint).toBeUndefined();
    expect(payload2.sprintId).toBeUndefined();
    expect(payload2.activeSprint).toBeUndefined();
  });

  it('does not send activeSprint when useActiveSprint is false', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      useActiveSprint: false,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.sprintId).toBeUndefined();
    expect(payload.activeSprint).toBeUndefined();
  });

  it('prefers sprintId over activeSprint when both are provided', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sprintId: 123,
      useActiveSprint: true,
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
    });

    expect(payload.sprintId).toBe(123);
    expect(payload.activeSprint).toBeUndefined();
  });

  it('includes source metadata when provided', () => {
    const payload = buildScenarioPreviewRequest({
      projectKey: 'QA',
      status: 'Desestimado',
      maxResults: 50,
      sourceMode: 'both',
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
      testRailProjectId: 56,
      testRailSuiteId: 1731,
      testRailSectionId: 4903,
      testRailSectionName: 'Kiosko / REGRESION-KIOSKO',
      appSlug: 'kiosko',
      effectiveTargetAppSlug: 'kiosko',
    });

    expect(payload.sourceMode).toBe('both');
    expect(payload.testrailProjectId).toBe(56);
    expect(payload.testrailSuiteId).toBe(1731);
    expect(payload.testrailSectionId).toBe(4903);
    expect(payload.testrailSectionName).toBe('Kiosko / REGRESION-KIOSKO');
    expect(payload.appSlug).toBe('kiosko');
    expect(payload.effectiveTargetAppSlug).toBe('kiosko');
  });
});
