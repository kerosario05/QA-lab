import { Router } from 'express';
import type { Request, Response } from 'express';
import { TestRailClient } from '../testrail-client';

const router = Router();

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const raw = firstQueryValue(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function getClient(): TestRailClient {
  return new TestRailClient({
    url: process.env.TESTRAIL_URL || '',
    email: process.env.TESTRAIL_EMAIL || '',
    apiKey: process.env.TESTRAIL_API_KEY || '',
  });
}

// GET /api/testrail/projects?counts=true
router.get('/projects', async (req: Request, res: Response) => {
  const includeCounts =
    firstQueryValue(req.query.counts) === 'true' ||
    firstQueryValue(req.query.includeCounts) === 'true';

  try {
    const projects = await getClient().getProjects(includeCounts);
    res.json({ ok: true, projects });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message || 'TestRail request failed' });
  }
});

// GET /api/testrail/sections?projectId=<id>&suiteId=<id>
router.get('/sections', async (req: Request, res: Response) => {
  const projectId = queryNumber(req.query.projectId);
  const suiteId = queryNumber(req.query.suiteId);

  if (!projectId) return res.status(400).json({ ok: false, error: 'projectId is required' });
  if (!suiteId) return res.status(400).json({ ok: false, error: 'suiteId is required' });

  try {
    const sections = await getClient().getSections(projectId, suiteId);
    res.json({ ok: true, sections });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message || 'TestRail request failed' });
  }
});

// GET /api/testrail/sections/:sectionId/cases?projectId=<id>&suiteId=<id>
router.get('/sections/:sectionId/cases', async (req: Request, res: Response) => {
  const projectId = queryNumber(req.query.projectId);
  const suiteId = queryNumber(req.query.suiteId);
  const sectionId = Number(req.params.sectionId);

  if (!projectId) return res.status(400).json({ ok: false, error: 'projectId is required' });
  if (!suiteId) return res.status(400).json({ ok: false, error: 'suiteId is required' });
  if (!Number.isFinite(sectionId)) return res.status(400).json({ ok: false, error: 'sectionId is required' });

  try {
    const cases = await getClient().getCases(projectId, suiteId, sectionId);
    res.json({ ok: true, cases });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message || 'TestRail request failed' });
  }
});

export default router;
