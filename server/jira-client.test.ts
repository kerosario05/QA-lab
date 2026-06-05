import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJiraConfig } from './jira-client';

const ORIG_ENV = { ...process.env };

describe('getJiraConfig', () => {
  beforeEach(() => {
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it('reads JIRA_BASE_URL when present', () => {
    process.env.JIRA_BASE_URL = 'https://jira.example.com';
    const config = getJiraConfig();
    expect(config.baseUrl).toBe('https://jira.example.com');
  });

  it('reads JIRA_EMAIL when present', () => {
    process.env.JIRA_EMAIL = 'user@example.com';
    const config = getJiraConfig();
    expect(config.email).toBe('user@example.com');
  });

  it('reads JIRA_API_TOKEN when present', () => {
    process.env.JIRA_API_TOKEN = 'token-123';
    const config = getJiraConfig();
    expect(config.apiToken).toBe('token-123');
  });

  it('returns empty strings when no config is set', () => {
    const config = getJiraConfig();
    expect(config.baseUrl).toBe('');
    expect(config.email).toBe('');
    expect(config.apiToken).toBe('');
  });

  it('all fields populated from env', () => {
    process.env.JIRA_BASE_URL = 'https://jira.example.com';
    process.env.JIRA_EMAIL = 'user@example.com';
    process.env.JIRA_API_TOKEN = 'token-123';
    const config = getJiraConfig();
    expect(config.baseUrl).toBe('https://jira.example.com');
    expect(config.email).toBe('user@example.com');
    expect(config.apiToken).toBe('token-123');
  });
});
