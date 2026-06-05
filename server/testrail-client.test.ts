import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeTestRailCasesResponse, normalizeTestRailSuitesResponse, normalizeTestRailSectionsResponse, normalizeTestRailProjectsResponse, getTestRailConfig } from './testrail-client';

describe('normalizeTestRailCasesResponse', () => {
  it('supports direct array input', () => {
    const input = [{ id: 1, title: 'Case 1' }, { id: 2, title: 'Case 2' }];
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(2);
    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].id).toBe(1);
    expect(result.rawShape).toBe('array');
  });

  it('supports empty array', () => {
    const result = normalizeTestRailCasesResponse([]);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
    expect(result.rawShape).toBe('array');
  });

  it('supports paginated object with cases array', () => {
    const input = {
      offset: 0,
      limit: 250,
      size: 5,
      _links: { next: null, prev: null },
      cases: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
        { id: 3, title: 'C' },
      ],
    };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(5);
    expect(result.cases).toHaveLength(3);
    expect(result.rawShape).toContain('object');
  });

  it('uses size over cases.length for paginated response', () => {
    const input = {
      offset: 0,
      limit: 250,
      size: 100,
      cases: [{ id: 1 }],  // only 1 in array, but size=100
    };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(100);
    expect(result.cases).toHaveLength(1);
  });

  it('uses cases.length when size is missing', () => {
    const input = {
      offset: 0,
      limit: 250,
      cases: [{ id: 1 }, { id: 2 }],
    };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(2);
    expect(result.cases).toHaveLength(2);
  });

  it('handles object with data wrapper', () => {
    const input = {
      data: [{ id: 10, title: 'Wrapped' }],
    };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(1);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].id).toBe(10);
  });

  it('handles null gracefully', () => {
    const result = normalizeTestRailCasesResponse(null);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
    expect(result.rawShape).toBe('object');
  });

  it('handles undefined gracefully', () => {
    const result = normalizeTestRailCasesResponse(undefined);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
    expect(result.rawShape).toBe('undefined');
  });

  it('handles empty object', () => {
    const result = normalizeTestRailCasesResponse({});
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  it('handles object where cases is null', () => {
    const result = normalizeTestRailCasesResponse({ cases: null, size: 0 });
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  it('handles object where cases is not an array', () => {
    const result = normalizeTestRailCasesResponse({ cases: 'not-array', size: 0 });
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  it('count uses cases.length when size is not a number', () => {
    const input = { cases: [{ id: 1 }], size: 'invalid' as any };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(1);
  });

  it('normalizes paginated response with size > cases.length (first page)', () => {
    const page1 = {
      offset: 0,
      limit: 250,
      size: 300,
      _links: { next: '?offset=250' },
      cases: Array.from({ length: 250 }, (_, i) => ({ id: i + 1 })),
    };
    const result = normalizeTestRailCasesResponse(page1);
    expect(result.count).toBe(300);
    expect(result.cases).toHaveLength(250);
  });

  it('normalizes paginated page 2 correctly', () => {
    const page2 = {
      offset: 250,
      limit: 250,
      size: 300,
      _links: { next: null },
      cases: Array.from({ length: 50 }, (_, i) => ({ id: 251 + i })),
    };
    const result = normalizeTestRailCasesResponse(page2);
    expect(result.count).toBe(300);
    expect(result.cases).toHaveLength(50);
  });

  it('handles response with cases at top level (no size, no _links)', () => {
    const input = {
      cases: [{ id: 1 }, { id: 2 }, { id: 3 }],
    };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(3);
    expect(result.cases).toHaveLength(3);
    expect(result.rawShape).toContain('object');
  });

  it('handles response where cases is empty array with size=0', () => {
    const input = { cases: [], size: 0 };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  it('handles response with size=0 but no cases array', () => {
    const input = { size: 0 };
    const result = normalizeTestRailCasesResponse(input);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  it('handles malformed response (string input)', () => {
    const result = normalizeTestRailCasesResponse('unexpected-string');
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
    expect(result.rawShape).toBe('string');
  });

  it('handles number input', () => {
    const result = normalizeTestRailCasesResponse(42);
    expect(result.count).toBe(0);
    expect(result.cases).toHaveLength(0);
    expect(result.rawShape).toBe('number');
  });

  it('rawShape includes keys for object responses', () => {
    const result = normalizeTestRailCasesResponse({ cases: [], size: 0, offset: 0, limit: 250, _links: {} });
    expect(result.rawShape).toContain('cases');
    expect(result.rawShape).toContain('size');
    expect(result.rawShape).toContain('_links');
  });
});

describe('normalizeTestRailSuitesResponse', () => {
  it('supports direct array input', () => {
    const input = [{ id: 1, name: 'Master Suite' }, { id: 2, name: 'Child Suite' }];
    const result = normalizeTestRailSuitesResponse(input);
    expect(result.count).toBe(2);
    expect(result.suites).toHaveLength(2);
    expect(result.suites[0].id).toBe(1);
    expect(result.rawShape).toBe('array');
  });

  it('supports empty array', () => {
    const result = normalizeTestRailSuitesResponse([]);
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
    expect(result.rawShape).toBe('array');
  });

  it('supports object with suites array', () => {
    const input = { suites: [{ id: 1, name: 'Suite 1' }] };
    const result = normalizeTestRailSuitesResponse(input);
    expect(result.count).toBe(1);
    expect(result.suites).toHaveLength(1);
    expect(result.rawShape).toContain('object');
  });

  it('supports paginated object with size', () => {
    const input = {
      offset: 0, limit: 250, size: 100,
      _links: { next: null },
      suites: [{ id: 1, name: 'S1' }],
    };
    const result = normalizeTestRailSuitesResponse(input);
    expect(result.count).toBe(100);
    expect(result.suites).toHaveLength(1);
    expect(result.rawShape).toContain('_links');
  });

  it('uses suites.length when size is missing', () => {
    const input = { suites: [{ id: 1 }, { id: 2 }] };
    const result = normalizeTestRailSuitesResponse(input);
    expect(result.count).toBe(2);
    expect(result.suites).toHaveLength(2);
  });

  it('supports object with data wrapper', () => {
    const input = { data: [{ id: 10, name: 'Wrapped Suite' }] };
    const result = normalizeTestRailSuitesResponse(input);
    expect(result.count).toBe(1);
    expect(result.suites).toHaveLength(1);
    expect(result.suites[0].id).toBe(10);
  });

  it('handles null gracefully', () => {
    const result = normalizeTestRailSuitesResponse(null);
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
    expect(result.rawShape).toBe('object');
  });

  it('handles undefined gracefully', () => {
    const result = normalizeTestRailSuitesResponse(undefined);
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
    expect(result.rawShape).toBe('undefined');
  });

  it('handles empty object', () => {
    const result = normalizeTestRailSuitesResponse({});
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
  });

  it('handles object where suites is not an array', () => {
    const result = normalizeTestRailSuitesResponse({ suites: 'not-array' });
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
  });

  it('handles malformed input (string)', () => {
    const result = normalizeTestRailSuitesResponse('bad');
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
    expect(result.rawShape).toBe('string');
  });

  it('handles number input', () => {
    const result = normalizeTestRailSuitesResponse(99);
    expect(result.count).toBe(0);
    expect(result.suites).toHaveLength(0);
    expect(result.rawShape).toBe('number');
  });
});

describe('normalizeTestRailSectionsResponse', () => {
  it('supports direct array input', () => {
    const input = [{ id: 1, name: 'Section A', depth: 0 }, { id: 2, name: 'Section B', depth: 1 }];
    const result = normalizeTestRailSectionsResponse(input);
    expect(result.count).toBe(2);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].id).toBe(1);
    expect(result.rawShape).toBe('array');
  });

  it('supports empty array', () => {
    const result = normalizeTestRailSectionsResponse([]);
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
    expect(result.rawShape).toBe('array');
  });

  it('supports object with sections array', () => {
    const input = { sections: [{ id: 1, name: 'Section 1' }] };
    const result = normalizeTestRailSectionsResponse(input);
    expect(result.count).toBe(1);
    expect(result.sections).toHaveLength(1);
    expect(result.rawShape).toContain('sections');
  });

  it('supports paginated object with size', () => {
    const input = {
      offset: 0, limit: 250, size: 100,
      _links: { next: null },
      sections: [{ id: 1, name: 'S1' }],
    };
    const result = normalizeTestRailSectionsResponse(input);
    expect(result.count).toBe(100);
    expect(result.sections).toHaveLength(1);
    expect(result.rawShape).toContain('_links');
  });

  it('uses sections.length when size is missing', () => {
    const input = { sections: [{ id: 1 }, { id: 2 }] };
    const result = normalizeTestRailSectionsResponse(input);
    expect(result.count).toBe(2);
    expect(result.sections).toHaveLength(2);
  });

  it('supports object with data wrapper', () => {
    const input = { data: [{ id: 10, name: 'Wrapped Section' }] };
    const result = normalizeTestRailSectionsResponse(input);
    expect(result.count).toBe(1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].id).toBe(10);
  });

  it('handles null gracefully', () => {
    const result = normalizeTestRailSectionsResponse(null);
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
    expect(result.rawShape).toBe('object');
  });

  it('handles undefined gracefully', () => {
    const result = normalizeTestRailSectionsResponse(undefined);
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
    expect(result.rawShape).toBe('undefined');
  });

  it('handles empty object', () => {
    const result = normalizeTestRailSectionsResponse({});
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
  });

  it('handles object where sections is not an array', () => {
    const result = normalizeTestRailSectionsResponse({ sections: 'not-array' });
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
  });

  it('handles malformed input (string)', () => {
    const result = normalizeTestRailSectionsResponse('bad');
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
    expect(result.rawShape).toBe('string');
  });

  it('handles number input', () => {
    const result = normalizeTestRailSectionsResponse(99);
    expect(result.count).toBe(0);
    expect(result.sections).toHaveLength(0);
    expect(result.rawShape).toBe('number');
  });
});

describe('normalizeTestRailProjectsResponse', () => {
  it('supports direct array input', () => {
    const input = [{ id: 1, name: 'Project 1' }, { id: 2, name: 'Project 2' }];
    const result = normalizeTestRailProjectsResponse(input);
    expect(result.count).toBe(2);
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].id).toBe(1);
    expect(result.rawShape).toBe('array');
  });

  it('supports empty array', () => {
    const result = normalizeTestRailProjectsResponse([]);
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.rawShape).toBe('array');
  });

  it('supports object with projects array', () => {
    const input = { projects: [{ id: 1, name: 'P1' }, { id: 2, name: 'P2' }] };
    const result = normalizeTestRailProjectsResponse(input);
    expect(result.count).toBe(2);
    expect(result.projects).toHaveLength(2);
    expect(result.rawShape).toContain('object');
  });

  it('supports paginated object with size', () => {
    const input = {
      offset: 0, limit: 250, size: 100,
      _links: { next: null },
      projects: [{ id: 1, name: 'P1' }],
    };
    const result = normalizeTestRailProjectsResponse(input);
    expect(result.count).toBe(100);
    expect(result.projects).toHaveLength(1);
    expect(result.rawShape).toContain('_links');
  });

  it('uses projects.length when size is missing', () => {
    const input = { projects: [{ id: 1 }, { id: 2 }] };
    const result = normalizeTestRailProjectsResponse(input);
    expect(result.count).toBe(2);
    expect(result.projects).toHaveLength(2);
  });

  it('supports object with data wrapper', () => {
    const input = { data: [{ id: 10, name: 'Wrapped' }] };
    const result = normalizeTestRailProjectsResponse(input);
    expect(result.count).toBe(1);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe(10);
  });

  it('handles null gracefully', () => {
    const result = normalizeTestRailProjectsResponse(null);
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.rawShape).toBe('object');
  });

  it('handles undefined gracefully', () => {
    const result = normalizeTestRailProjectsResponse(undefined);
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.rawShape).toBe('undefined');
  });

  it('handles empty object', () => {
    const result = normalizeTestRailProjectsResponse({});
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it('handles object where projects is not an array', () => {
    const result = normalizeTestRailProjectsResponse({ projects: 'not-array' });
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it('handles malformed input (string)', () => {
    const result = normalizeTestRailProjectsResponse('bad');
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.rawShape).toBe('string');
  });

  it('handles number input', () => {
    const result = normalizeTestRailProjectsResponse(99);
    expect(result.count).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.rawShape).toBe('number');
  });

  it('rawShape includes keys for object responses', () => {
    const result = normalizeTestRailProjectsResponse({ projects: [], size: 0, offset: 0 });
    expect(result.rawShape).toContain('projects');
    expect(result.rawShape).toContain('size');
  });
});

const ORIG_ENV = { ...process.env };

describe('getTestRailConfig', () => {
  beforeEach(() => {
    delete process.env.TESTRAIL_URL;
    delete process.env.TESTRAIL_EMAIL;
    delete process.env.TESTRAIL_USER;
    delete process.env.TESTRAIL_API_KEY;
    delete process.env.VITE_TESTRAIL_URL;
    delete process.env.VITE_TESTRAIL_USER;
    delete process.env.VITE_TESTRAIL_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it('uses TESTRAIL_URL when present', () => {
    process.env.TESTRAIL_URL = 'https://testrail.example.com';
    const config = getTestRailConfig();
    expect(config.baseUrl).toBe('https://testrail.example.com');
  });

  it('uses TESTRAIL_EMAIL for user', () => {
    process.env.TESTRAIL_EMAIL = 'user@example.com';
    const config = getTestRailConfig();
    expect(config.user).toBe('user@example.com');
  });

  it('uses TESTRAIL_USER as fallback when TESTRAIL_EMAIL is missing', () => {
    process.env.TESTRAIL_USER = 'fallback-user';
    const config = getTestRailConfig();
    expect(config.user).toBe('fallback-user');
  });

  it('uses TESTRAIL_API_KEY when present', () => {
    process.env.TESTRAIL_API_KEY = 'secret-key-123';
    const config = getTestRailConfig();
    expect(config.apiKey).toBe('secret-key-123');
  });

  it('falls back to VITE_TESTRAIL_URL when TESTRAIL_URL is missing', () => {
    process.env.VITE_TESTRAIL_URL = 'https://vite-testrail.example.com';
    const config = getTestRailConfig();
    expect(config.baseUrl).toBe('https://vite-testrail.example.com');
  });

  it('falls back to VITE_TESTRAIL_USER when TESTRAIL_EMAIL and TESTRAIL_USER are missing', () => {
    process.env.VITE_TESTRAIL_USER = 'vite-user';
    const config = getTestRailConfig();
    expect(config.user).toBe('vite-user');
  });

  it('falls back to VITE_TESTRAIL_API_KEY when TESTRAIL_API_KEY is missing', () => {
    process.env.VITE_TESTRAIL_API_KEY = 'vite-key';
    const config = getTestRailConfig();
    expect(config.apiKey).toBe('vite-key');
  });

  it('TESTRAIL_EMAIL takes priority over TESTRAIL_USER', () => {
    process.env.TESTRAIL_EMAIL = 'email@example.com';
    process.env.TESTRAIL_USER = 'user';
    const config = getTestRailConfig();
    expect(config.user).toBe('email@example.com');
  });

  it('TESTRAIL_URL takes priority over VITE_TESTRAIL_URL', () => {
    process.env.TESTRAIL_URL = 'https://primary.example.com';
    process.env.VITE_TESTRAIL_URL = 'https://fallback.example.com';
    const config = getTestRailConfig();
    expect(config.baseUrl).toBe('https://primary.example.com');
  });

  it('returns empty strings when no config is set', () => {
    const config = getTestRailConfig();
    expect(config.baseUrl).toBe('');
    expect(config.user).toBe('');
    expect(config.apiKey).toBe('');
  });

  it('uses TESTRAIL_API_KEY over VITE_TESTRAIL_API_KEY', () => {
    process.env.TESTRAIL_API_KEY = 'primary-key';
    process.env.VITE_TESTRAIL_API_KEY = 'fallback-key';
    const config = getTestRailConfig();
    expect(config.apiKey).toBe('primary-key');
  });
});
