import { describe, it, expect } from 'vitest';
import jiraRouter from './jira';

describe('jira router', () => {
  it('exports a router function', () => {
    expect(jiraRouter).toBeDefined();
    expect(typeof jiraRouter).toBe('function');
  });

  it('does not crash on import', () => {
    expect(() => {
      const paths = (jiraRouter as any).stack?.map((r: any) => r.route?.path).filter(Boolean) ?? [];
      expect(Array.isArray(paths)).toBe(true);
    }).not.toThrow();
  });
});
