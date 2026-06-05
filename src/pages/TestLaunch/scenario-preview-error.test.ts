import { describe, expect, it } from 'vitest';

import { ApiError } from '../../services/scenarios/client';
import { formatScenarioPreviewError } from './scenario-preview-error';

describe('scenario preview error formatting', () => {
  it('includes structured ApiError details', () => {
    const error = new ApiError(502, 'bad_gateway', 'Generación fallida');
    const message = formatScenarioPreviewError(error, {
      jiraIssueKey: 'AA-82',
      jiraSummary: 'Alta de producto',
      jiraDescription: 'Descripción',
      sourceMode: 'both',
      testRailProjectId: 56,
      suiteId: 1731,
      sectionId: 4903,
      sectionName: 'Sección X',
      appSlug: 'kiosko',
      effectiveTargetAppSlug: 'kiosko',
      endpoint: '/api/scenarios/preview',
    });

    expect(message).toContain('HTTP 502');
    expect(message).toContain('endpoint=/api/scenarios/preview');
    expect(message).toContain('errorCode=bad_gateway');
    expect(message).toContain('message=Generación fallida');
    expect(message).toContain('jiraIssueKey=AA-82');
    expect(message).toContain('sectionId=4903');
    expect(message).toContain('effectiveTargetAppSlug=kiosko');
  });

  it('includes generic fallback details when the error is unknown', () => {
    const message = formatScenarioPreviewError('boom', null);
    expect(message).toContain('HTTP unknown');
    expect(message).toContain('endpoint=/api/scenarios/preview');
    expect(message).toContain('message=Error desconocido al generar escenarios');
  });
});
