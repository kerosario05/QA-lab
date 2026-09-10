import { Router } from 'express';
import type { Request, Response } from 'express';
import { TestRailClient } from '../testrail-client';
import { TestRailCacheService } from '../testrail-cache';

const router = Router();
const client = new TestRailClient();
const cache = new TestRailCacheService();

type AutomationEngineSectionCasesResponse = {
  ok?: boolean;
  sectionId?: number;
  projectId?: number;
  suiteId?: number;
  count?: number;
  cases: any[];
  [key: string]: unknown;
};

type SectionCasesFetcher = (url: string) => Promise<Response>;

export async function fetchAutomationEngineSectionCases(input: {
  baseUrl: string;
  sectionId: number;
  projectId: number;
  suiteId: number;
  localProjectId?: string;
  fetcher?: SectionCasesFetcher;
}): Promise<AutomationEngineSectionCasesResponse> {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Automation Engine base URL is not configured");
  const localProjectParam = input.localProjectId ? `&localProjectId=${encodeURIComponent(input.localProjectId)}` : '';
  const url = `${baseUrl}/api/testrail/sections/${input.sectionId}/cases?projectId=${input.projectId}&suiteId=${input.suiteId}${localProjectParam}`;
  const response = await (input.fetcher ?? fetch)(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Automation Engine section cases failed: ${response.status}`);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as AutomationEngineSectionCasesResponse).cases)) {
    throw new Error("Automation Engine section cases response is invalid");
  }
  return payload as AutomationEngineSectionCasesResponse;
}

function sendError(res: Response, status: number, errorMsg: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ ok: false, error: errorMsg, ...extra });
}

function getQueryParam(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  return undefined;
}

function logRequest(resource: string, params: Record<string, unknown>): void {
  const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`[testrail-api] request resource=${resource} ${parts}`);
}

// GET /api/testrail/projects
// Params: ?includeCounts=true (optional, default false)
// Returns minimal project data (id, name, suite_mode) WITHOUT suites or counts by default.
// Fan-out: 1 upstream call to TestRail (get_projects). No per-suite or per-case calls.
router.get('/projects', async (req: Request, res: Response) => {
  const includeCounts = getQueryParam(req.query.includeCounts) === 'true';
  logRequest('projects', { includeCounts });

  try {
    const result = await cache.getOrFetch('projects', [], () => client.getProjects());
    const projects = result.data.projects;
    console.log(`[testrail-api] projects fromCache=${!!result.stale} count=${projects.length}`);

    if (includeCounts) {
      // Enriched mode: fetch suites and counts per project (fan-out — use sparingly)
      const enriched = await Promise.all(
        projects.map(async (p: any) => {
          try {
            const suites = await client.getSuites(p.id);
            const suitesWithCounts = await Promise.all(
              suites.map(async (s: any) => {
                let caseCount = 0;
                try {
                  const casesResp = await client.getCases(p.id, { suiteId: s.id });
                  caseCount = casesResp?.size ?? 0;
                } catch { /* skip */ }
                return {
                  id: s.id, name: s.name, is_master: s.is_master ?? false,
                  caseCount, caseCountApproximate: false,
                };
              }),
            );
            const totalCaseCount = suitesWithCounts.reduce((sum, s) => sum + s.caseCount, 0);
            return {
              id: p.id, name: p.name, suite_mode: p.suite_mode ?? 1,
              totalCaseCount, suites: suitesWithCounts,
            };
          } catch {
            return {
              id: p.id, name: p.name, suite_mode: p.suite_mode ?? 1,
              totalCaseCount: 0, suites: [],
            };
          }
        }),
      );
      res.json({
        ok: true, projects: enriched,
        stale: result.stale ?? false, rateLimited: result.rateLimited ?? false,
        retryAfterSeconds: result.retryAfterSeconds ?? 0,
        fromCache: result.stale ?? false,
        warning: result.rateLimited ? 'testrail_rate_limited' : undefined,
      });
      return;
    }

    // Minimal mode: no fan-out, just project metadata
    const minimal = projects.map((p: any) => ({
      id: p.id, name: p.name, suite_mode: p.suite_mode ?? 1,
    }));

    res.json({
      ok: true, projects: minimal,
      stale: result.stale ?? false, rateLimited: result.rateLimited ?? false,
      retryAfterSeconds: result.retryAfterSeconds ?? 0,
      fromCache: result.stale ?? false,
      warning: result.rateLimited ? 'testrail_rate_limited' : undefined,
    });
  } catch (err: any) {
    if (err.status === 429) {
      console.log(`[testrail-api] rate_limited resource=projects`);
      sendError(res, 429, err.message ?? 'TestRail rate limit exceeded', { retryAfterSeconds: err.retryAfterSeconds ?? 60 });
      return;
    }
    console.log(`[testrail-api] projects error: ${err.message}`);
    sendError(res, err.status ?? 502, 'Failed to fetch TestRail projects');
  }
});

// GET /api/testrail/projects/:projectId/suites
// Params: ?includeCounts=true (optional, default false)
// Returns suite metadata (id, name, is_master). No caseCount by default.
// Fan-out: 1 upstream call to TestRail (get_suites). No per-case calls.
router.get('/projects/:projectId/suites', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const includeCounts = getQueryParam(req.query.includeCounts) === 'true';
  logRequest('suites', { projectId, includeCounts });

  if (isNaN(projectId)) { sendError(res, 400, 'Invalid projectId'); return; }

  try {
    const result = await cache.getOrFetch('suites', [projectId], () => client.getSuites(projectId));
    const suites = result.data.suites;
    console.log(`[testrail-api] suites fromCache=${!!result.stale} count=${suites.length}`);

    if (!Array.isArray(suites) || suites.length === 0) {
      const envProjectId = parseInt(String(process.env.TESTRAIL_PROJECT_ID ?? ''), 10);
      const envSuiteId = parseInt(String(process.env.TESTRAIL_SUITE_ID ?? ''), 10);
      if (!isNaN(envProjectId) && envProjectId === projectId && !isNaN(envSuiteId)) {
        console.log(`[testrail-api] suites fallback envSuiteId=${envSuiteId} reason=empty_or_error projectId=${projectId}`);
        const fallback = [{ id: envSuiteId, name: `Suite ${envSuiteId}`, is_master: true }];
        res.json({ ok: true, projectId, suites: fallback, count: 1, fromCache: false });
        return;
      }
      res.json({ ok: true, projectId, suites: [], count: 0 });
      return;
    }

    let enriched = suites;
    if (includeCounts) {
      enriched = await Promise.all(
        suites.map(async (s: any) => {
          let caseCount = 0;
          try {
            const casesResp = await client.getCases(projectId, { suiteId: s.id });
            caseCount = casesResp?.size ?? 0;
          } catch { /* skip */ }
          return { id: s.id, name: s.name, is_master: s.is_master ?? false, caseCount, caseCountApproximate: false };
        }),
      );
    } else {
      enriched = suites.map((s: any) => ({
        id: s.id, name: s.name, is_master: s.is_master ?? false,
      }));
    }

    const response: Record<string, unknown> = {
      ok: true, projectId, suites: enriched, count: enriched.length,
    };
    if (result.stale) {
      response.stale = true;
      response.rateLimited = true;
      response.warning = 'testrail_rate_limited';
    }
    res.json(response);
  } catch (err: any) {
    const envProjectId = parseInt(String(process.env.TESTRAIL_PROJECT_ID ?? ''), 10);
    const envSuiteId = parseInt(String(process.env.TESTRAIL_SUITE_ID ?? ''), 10);
    if (!isNaN(envProjectId) && envProjectId === projectId && !isNaN(envSuiteId)) {
      console.log(`[testrail-api] suites fallback envSuiteId=${envSuiteId} reason=error projectId=${projectId} status=${err.status ?? 0}`);
      res.json({ ok: true, projectId, suites: [{ id: envSuiteId, name: `Suite ${envSuiteId}`, is_master: true }], count: 1, fromCache: false });
      return;
    }
    if (err.status === 429) {
      console.log(`[testrail-api] rate_limited resource=suites project=${projectId}`);
      sendError(res, 429, err.message ?? 'TestRail rate limit exceeded', { retryAfterSeconds: err.retryAfterSeconds ?? 60 });
      return;
    }
    console.log(`[testrail-api] suites error project=${projectId} status=${err.status ?? 0} message=${err.message ?? 'unknown'}`);
    sendError(res, err.status ?? 502, 'Failed to fetch suites', { projectId });
  }
});

// GET /api/testrail/sections?projectId=&suiteId=
// Returns sections for a project+suite. Single upstream call. No fan-out.
router.get('/sections', async (req: Request, res: Response) => {
  const projectId = parseInt(getQueryParam(req.query.projectId) ?? '', 10);
  const suiteId = parseInt(getQueryParam(req.query.suiteId) ?? '', 10);
  logRequest('sections', { projectId, suiteId });

  if (isNaN(projectId)) { sendError(res, 400, 'projectId is required'); return; }
  if (isNaN(suiteId)) { sendError(res, 400, 'suiteId is required'); return; }

  try {
    const result = await cache.getOrFetch('sections', [projectId, suiteId], () =>
      client.getSections(projectId, suiteId),
    );

    const sectionData = result.data as { sections: any[]; count: number };
    const sections = Array.isArray(sectionData.sections) ? sectionData.sections : [];
    console.log(`[testrail-api] sections fromCache=${!!result.stale} count=${sections.length}`);

    const response: Record<string, unknown> = {
      ok: true, projectId, suiteId,
      sections,
      count: sections.length,
      fromCache: result.stale ?? false, stale: result.stale ?? false,
      rateLimited: result.rateLimited ?? false, retryAfterSeconds: result.retryAfterSeconds ?? 0,
    };
    if (result.rateLimited) response.warning = 'testrail_rate_limited';
    res.json(response);
  } catch (err: any) {
    if (err.status === 429) {
      console.log(`[testrail-api] rate_limited resource=sections project=${projectId} suite=${suiteId}`);
      sendError(res, 429, err.message ?? 'TestRail rate limit exceeded', { retryAfterSeconds: err.retryAfterSeconds ?? 60 });
      return;
    }
    console.log(`[testrail-api] sections error project=${projectId} suite=${suiteId} status=${err.status ?? 0} message=${err.message ?? 'unknown'}`);
    sendError(res, err.status ?? 502, 'Failed to fetch sections', { projectId, suiteId });
  }
});

// GET /api/testrail/sections/:sectionId/cases?projectId=&suiteId=&includeSubsections=
// Returns cases for a section. Single upstream call. No fan-out.
router.get('/sections/:sectionId/cases', async (req: Request, res: Response) => {
  const sectionId = parseInt(String(req.params.sectionId), 10);
  const projectId = parseInt(getQueryParam(req.query.projectId) ?? '', 10);
  const suiteId = parseInt(getQueryParam(req.query.suiteId) ?? '', 10);
  const localProjectId = getQueryParam(req.query.localProjectId);
  logRequest('section-cases', { sectionId, projectId, suiteId });

  if (isNaN(sectionId)) { sendError(res, 400, 'sectionId is required'); return; }
  if (isNaN(projectId)) { sendError(res, 400, 'projectId is required'); return; }
  if (isNaN(suiteId)) { sendError(res, 400, 'suiteId is required'); return; }

  try {
    const result = await cache.getOrFetch(
      'section-cases', [projectId, suiteId, sectionId, localProjectId ?? ''],
      () => fetchAutomationEngineSectionCases({
        baseUrl: process.env.SCENARIO_PREVIEW_BASE_URL ?? '',
        sectionId,
        projectId,
        suiteId,
        localProjectId,
      }),
    );

    const upstream = result.data;
    const cases = upstream.cases;

    const response: Record<string, unknown> = {
      ...upstream,
      ok: upstream.ok ?? true,
      sectionId: upstream.sectionId ?? sectionId,
      projectId: upstream.projectId ?? projectId,
      suiteId: upstream.suiteId ?? suiteId,
      includeSubsections: getQueryParam(req.query.includeSubsections) !== 'false',
      count: upstream.count ?? cases.length,
      cases,
    };

    if (result.stale) {
      response.stale = true;
      response.rateLimited = true;
      response.source = 'cache';
      response.warning = 'testrail_rate_limited';
    }

    res.json(response);
  } catch (err: any) {
    if (err.status === 429) {
      console.log(`[testrail-api] rate_limited resource=section-cases section=${sectionId} project=${projectId} suite=${suiteId}`);
      sendError(res, 429, err.message ?? 'TestRail rate limit exceeded', { retryAfterSeconds: err.retryAfterSeconds ?? 60 });
      return;
    }
    console.log(`[testrail-api] section-cases section=${sectionId}: ${err.message}`);
    sendError(res, err.status ?? 502, 'Failed to fetch cases');
  }
});

// GET /api/testrail/projects/:projectId/suites/:suiteId/cases/count
// Returns the total case count for a project+suite (no section filter).
// Uses pagination to count all cases across all pages. Cached.
router.get('/projects/:projectId/suites/:suiteId/cases/count', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const suiteId = parseInt(String(req.params.suiteId), 10);
  console.log(`[testrail-count] request projectId=${projectId} suiteId=${suiteId}`);

  if (isNaN(projectId)) { sendError(res, 400, 'Invalid projectId'); return; }
  if (isNaN(suiteId)) { sendError(res, 400, 'Invalid suiteId'); return; }

  try {
    const result = await cache.getOrFetch(
      'suite-case-count', [projectId, suiteId],
      () => client.getAllCases(projectId, { suiteId }),
    );

    const allCasesResult = result.data as { cases: any[]; count: number; pagesFetched: number };
    const count = allCasesResult?.count ?? 0;
    const rawShape = typeof allCasesResult === 'object' && allCasesResult !== null ? 'getAllCases' : typeof allCasesResult;

    console.log(`[testrail-count] response normalizedCount=${count} rawShape=${rawShape} stale=${!!result.stale} rateLimited=${!!result.rateLimited}`);

    const response: Record<string, unknown> = {
      ok: true, count, projectId, suiteId,
    };

    if (result.stale) {
      response.stale = true;
      response.rateLimited = true;
      response.source = 'cache';
      response.warning = 'testrail_rate_limited';
    }

    res.json(response);
  } catch (err: any) {
    const isRateLimited = err.status === 429 || err.rateLimited;
    console.log(`[testrail-count] error status=${err.status ?? 0} rateLimited=${isRateLimited} message=${err.message ?? 'unknown'}`);
    if (isRateLimited) {
      sendError(res, 429, err.message ?? 'TestRail rate limit exceeded', { retryAfterSeconds: err.retryAfterSeconds ?? 60 });
      return;
    }
    sendError(res, err.status ?? 502, 'Failed to fetch suite case count');
  }
});

export default router;
