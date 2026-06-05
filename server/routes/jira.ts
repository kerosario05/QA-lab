import { Router } from 'express';
import type { Request, Response } from 'express';
import { JiraClient } from '../jira-client';

const router = Router();
const client = new JiraClient();

function sendError(res: Response, status: number, errorMsg: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ ok: false, error: errorMsg, ...extra });
}

// GET /api/jira/projects
router.get('/projects', async (_req: Request, res: Response) => {
  console.log('[jira-api] projects request');

  try {
    const projects = await client.getProjects();
    console.log(`[jira-api] projects response count=${projects.length}`);
    res.json({ ok: true, projects });
  } catch (err: any) {
    console.log(`[jira-api] projects error: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch Jira projects');
  }
});

// GET /api/jira/projects/:key/sprint/active
router.get('/projects/:key/sprint/active', async (req: Request, res: Response) => {
  const projectKey = String(req.params.key);
  console.log(`[jira-api] active_sprint request project=${projectKey}`);

  try {
    const sprint = await client.getActiveSprint(projectKey);
    console.log(`[jira-api] active_sprint response project=${projectKey} found=${sprint !== null}`);
    res.json({ ok: true, sprint });
  } catch (err: any) {
    console.log(`[jira-api] active_sprint error project=${projectKey}: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch active sprint');
  }
});

export default router;
