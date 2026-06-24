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

// GET /api/jira/projects/:key/sprint/:sprintId/issues — Load issues for selection before preview
router.get('/projects/:key/sprint/:sprintId/issues', async (req: Request, res: Response) => {
  const projectKey = String(req.params.key);
  const sprintId = Number(req.params.sprintId);
  console.log(`[jira-api] sprint_issues request project=${projectKey} sprintId=${sprintId}`);

  try {
    // Fetch issues from sprint (using Jira client)
    const issues = await client.getSprintIssues(projectKey, sprintId);
    console.log(`[jira-api] sprint_issues response project=${projectKey} sprintId=${sprintId} count=${issues.length}`);

    // Map to simple format for UI selection
    const mapped = issues.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields?.summary || issue.fields?.title || issue.key,
      status: issue.fields?.status?.name || 'Unknown',
      type: issue.fields?.issuetype?.name || 'Story',
    }));

    res.json({ ok: true, issues: mapped });
  } catch (err: any) {
    console.log(`[jira-api] sprint_issues error project=${projectKey} sprintId=${sprintId}: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch sprint issues');
  }
});

export default router;
