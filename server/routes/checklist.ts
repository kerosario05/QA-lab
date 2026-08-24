import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

const router = Router();
const upstreamBase = () => (process.env.RUN_PROVIDER_BASE_URL || process.env.SCENARIO_PREVIEW_BASE_URL || '').replace(/\/+$/, '');

// ── Server-side fallback: persist Jira defect references when MCP runner PATCH fails ──
const JIRA_REFS_PATH = path.join(process.cwd(), '.data', 'jira-defect-refs.json');

function loadJiraRefs(): Record<string, { jiraIssueKey: string; jiraIssueUrl: string; jiraUploadedAt: string; jiraUploadStatus: string; jiraUploadError?: string }> {
  try {
    if (fs.existsSync(JIRA_REFS_PATH)) {
      return JSON.parse(fs.readFileSync(JIRA_REFS_PATH, 'utf-8'));
    }
  } catch { /* corrupted — start fresh */ }
  return {};
}

function saveJiraRefs(refs: Record<string, unknown>): void {
  const dir = path.dirname(JIRA_REFS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(JIRA_REFS_PATH, JSON.stringify(refs, null, 2), 'utf-8');
}

function serveLocalJiraRefs(issueKey: string, jobId?: string, scenarioIds?: string[]): Array<Record<string, unknown>> {
  const refs = loadJiraRefs();
  const prefix = `${issueKey}:`;
  let entries = Object.entries(refs)
    .filter(([k]) => k.startsWith(prefix));

  // Filter by jobId if provided — strict match only
  if (jobId) {
    entries = entries.filter(([, v]) => String((v as any).jobId ?? '') === jobId);
  }

  // Filter by scenarioIds if provided
  if (scenarioIds && scenarioIds.length > 0) {
    const sidSet = new Set(scenarioIds.map(s => s.trim()).filter(Boolean));
    if (sidSet.size > 0) {
      entries = entries.filter(([k, v]) => {
        const ref = v as Record<string, unknown>;
        const keyId = k.slice(prefix.length);
        const candidates = [keyId, ref.scenarioId, ref.executionScenarioId, ref.id]
          .map(c => String(c ?? '').trim())
          .filter(Boolean);
        if (candidates.length === 0) return false;
        return [...sidSet].some(sid =>
          candidates.some(c => c === sid || c.includes(sid) || sid.includes(c))
        );
      });
    }
  }

  return entries.map(([k, v]) => {
    const did = k.slice(prefix.length);
    const extra = typeof v === 'object' && v !== null ? v as Record<string, unknown> : {};
    return {
      id: did,
      scenarioId: extra.scenarioId ?? did,
      executionJobId: extra.jobId ?? undefined,
      scenarioTitle: `Defecto ${extra.jiraIssueKey || did}`,
      description: `Issue Jira creado: ${extra.jiraIssueKey || did}. Referencia local almacenada en QA Lab.`,
      severity: 'medium',
      status: 'pending_review',
      jiraIssueKey: extra.jiraIssueKey,
      jiraIssueUrl: extra.jiraIssueUrl,
      createdAt: extra.jiraUploadedAt ?? new Date().toISOString(),
      updatedAt: extra.jiraUploadedAt ?? new Date().toISOString(),
    };
  });
}

async function proxy(req: Request, res: Response, path: string, method: string) {
  const base = upstreamBase();
  if (!base) return res.status(500).json({ ok: false, error: 'MCP backend URL not configured' });
  const url = `${base}${path}`;
  try {
    const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
    if (method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(req.body);
    const upstream = await fetch(url, opts);
    const body = await upstream.text();
    let parsed: any;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    if (!upstream.ok) {
      console.log(`[checklists] upstream error status=${upstream.status} path=${path} body=${typeof parsed === 'string' ? parsed.substring(0, 300) : JSON.stringify(parsed).substring(0, 300)}`);
    }
    res.status(upstream.status).json(parsed);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: `proxy_error: ${err.message}` });
  }
}

router.post('/api/user-stories/:issueKey/checklist-url', (req, res) => proxy(req, res, `/api/user-stories/${encodeURIComponent(req.params.issueKey)}/checklist-url`, 'POST'));
router.get('/api/checklists/:issueKey', async (req: Request, res: Response) => {
  const params = new URLSearchParams();
  if (req.query.jobId) params.set('jobId', String(req.query.jobId));
  if (req.query.runId) params.set('runId', String(req.query.runId));
  if (req.query.scenarioIds) params.set('scenarioIds', String(req.query.scenarioIds));
  const encoded = params.toString();
  const qs = encoded ? `?${encoded}` : '';
  const issueKey = req.params.issueKey;
  const queryJobId = req.query.jobId ? String(req.query.jobId) : undefined;
  const queryRunId = req.query.runId ? String(req.query.runId) : undefined;
  const queryScenarioIds = req.query.scenarioIds
    ? String(req.query.scenarioIds).split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  console.log(`[checklists] GET issueKey=${issueKey} runId=${queryRunId ?? '-'} jobId=${queryJobId ?? '-'} scenarioIds=${queryScenarioIds?.join(',') ?? '-'}`);

  // Load persisted Jira refs for merging
  const jiraRefs = loadJiraRefs();

  // Proxy but intercept response to merge Jira fields
  const base = upstreamBase();
  if (!base) {
    // No upstream — serve from local Jira refs only
    const localDefects = serveLocalJiraRefs(issueKey, queryJobId, queryScenarioIds);
    return res.json({ ok: true, source: 'local', defects: localDefects, issueKey, title: issueKey, checklistUrl: '', createdAt: null, updatedAt: null });
  }
  try {
    const url = `${base}/api/checklists/${encodeURIComponent(issueKey)}${qs}`;
    const upstream = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data) {
      // Upstream failed — serve from local Jira refs
      const localDefects = serveLocalJiraRefs(issueKey, queryJobId, queryScenarioIds);
      if (localDefects.length > 0) {
        console.log(`[checklists] upstream ${upstream.status}, serving ${localDefects.length} local defects for issueKey=${issueKey}`);
        return res.json({ ok: true, source: 'local', defects: localDefects, issueKey, title: issueKey, checklistUrl: '', createdAt: null, updatedAt: null });
      }
      res.status(upstream.status).json(data);
      return;
    }

    // Merge Jira refs into each defect
    if (Array.isArray(data.defects)) {
      let merged = 0;
      for (const d of data.defects) {
        const key = `${issueKey}:${d.id || d.scenarioId || ''}`;
        const ref = jiraRefs[key];
        if (ref && !d.jiraIssueKey) {
          Object.assign(d, ref);
          merged++;
        }
      }
      if (merged > 0) console.log(`[checklists] merged jiraRefs issueKey=${issueKey} merged=${merged}`);
    }

    res.json(data);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: `proxy_error: ${err.message}` });
  }
});
router.post('/api/checklists/:issueKey/defects', (req, res) => proxy(req, res, `/api/checklists/${encodeURIComponent(req.params.issueKey)}/defects`, 'POST'));
router.patch('/api/checklists/:issueKey/defects/:defectId', async (req: Request, res: Response) => {
  const { issueKey, defectId } = req.params;
  const bodyKeys = Object.keys(req.body ?? {});
  const jiraFields = bodyKeys.filter(k => k.startsWith('jira'));
  const hasNonJiraFields = bodyKeys.some(k => !k.startsWith('jira') && k !== 'status' && k !== 'jobId' && k !== 'scenarioId');

  console.log(`[checklists] patch defect request issueKey=${issueKey} defectId=${defectId} bodyKeys=${bodyKeys.join(',')}`);

  // If request has ONLY Jira fields (and possibly status), persist locally and skip upstream
  if (jiraFields.length > 0 && !hasNonJiraFields) {
    const refs = loadJiraRefs();
    const key = `${issueKey}:${defectId}`;
    const existing = refs[key] ?? {} as Record<string, unknown>;
    refs[key] = {
      ...existing,
      jiraIssueKey: req.body.jiraIssueKey ?? existing.jiraIssueKey ?? '',
      jiraIssueUrl: req.body.jiraIssueUrl ?? existing.jiraIssueUrl ?? '',
      jiraUploadedAt: req.body.jiraUploadedAt ?? new Date().toISOString(),
      jiraUploadStatus: req.body.jiraUploadStatus ?? 'uploaded',
      jiraUploadError: req.body.jiraUploadError ?? undefined,
      issueKey: issueKey,
      jobId: req.body.jobId ?? existing.jobId ?? undefined,
      scenarioId: req.body.scenarioId ?? existing.scenarioId ?? undefined,
    };
    saveJiraRefs(refs);
    console.log(`[checklists] patch defect persisted locally issueKey=${issueKey} defectId=${defectId} jiraIssueKey=${refs[key].jiraIssueKey}`);
    return res.json({ ok: true, defect: { id: defectId, ...refs[key] } });
  }

  // Forward to upstream (original behavior)
  proxy(req, res, `/api/checklists/${encodeURIComponent(issueKey)}/defects/${encodeURIComponent(defectId)}`, 'PATCH');
});

export default router;
