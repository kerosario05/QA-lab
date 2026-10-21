import { describe, it, expect } from 'vitest';
import { scenarioPreviewTimeout } from './scenario-preview-provider';
describe('scenario preview timeout isolation', () => {
  it('covers the bounded Jira generation and repair budget', () => expect(scenarioPreviewTimeout('jira_semantic',180000)).toBe(750000));
  it('preserves the existing preview timeout for other modes', () => expect(scenarioPreviewTimeout(undefined,5000)).toBe(5000));
});
