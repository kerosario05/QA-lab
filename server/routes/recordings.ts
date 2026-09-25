import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listRecordings,
  startRecording,
  getRecordingStatus,
  stopRecording,
  deriveScenarios,
  getRecordingScenarios,
  saveRecordingScenarios,
  updateRecordingScenarioValue,
  getRecordingTrace,
  getSemanticRecording,
  publishToTestRail,
  executeRecording,
  deleteRecording,
} from '../recordings-provider';
import type { RecordingsProviderResponse } from '../recordings-provider';

const router = Router();

console.log('[recordings] route registered');

function sendJson(res: Response, status: number, body: Record<string, unknown>): void {
  // A recording's scenarios/trace/semantic/status are mutable state that changes underneath the
  // same URL (derive(), scenario-value edits, a new recording reusing history). Express's default
  // ETag would let the browser revalidate and get back a bodyless 304 -- which the client's fetch
  // wrapper cannot distinguish from "no data", causing the Escenarios section to intermittently
  // fail to (re)populate on a historical recording. These responses must never be cached/revalidated.
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function statusCodeFor(result: RecordingsProviderResponse, timeoutStatus = 504): number {
  if (result.status) return result.status;
  if (result.errorCode?.endsWith('NOT_CONFIGURED')) return 503;
  if (result.errorCode === 'TIMEOUT') return timeoutStatus;
  return 502;
}

function forward(res: Response, result: RecordingsProviderResponse, okStatus = 200): void {
  if (!result.ok) {
    sendJson(res, statusCodeFor(result), {
      ok: false,
      errorCode: result.errorCode,
      error: result.error,
      message: result.message,
      ...(result.body ?? {}),
    });
    return;
  }
  sendJson(res, result.status ?? okStatus, { ok: true, ...(result.body ?? {}) });
}

/** Every route needs the project: it is what determines which app is being recorded. */
function requireProjectSlug(req: Request, res: Response): string | null {
  const slug = String(req.query.projectSlug ?? (req.body as any)?.projectSlug ?? '').trim();
  if (!slug) {
    sendJson(res, 400, {
      ok: false,
      errorCode: 'MISSING_PROJECT_SLUG',
      error: 'projectSlug is required',
      message: 'Selecciona un proyecto antes de operar sobre grabaciones',
    });
    return null;
  }
  return slug;
}

router.get('/', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await listRecordings(projectSlug));
});

router.post('/start', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  const body = req.body as Record<string, unknown>;
  console.log(`[recordings] start request projectSlug=${projectSlug} label=${body?.label ?? '—'}`);
  forward(res, await startRecording({ ...body, projectSlug }), 202);
});

router.get('/:recordingId', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await getRecordingStatus(String(req.params.recordingId), projectSlug));
});

router.post('/:recordingId/stop', async (req: Request, res: Response) => {
  console.log(`[recordings] stop request recordingId=${String(req.params.recordingId)}`);
  forward(res, await stopRecording(String(req.params.recordingId)));
});

router.post('/:recordingId/derive', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  console.log(`[recordings] derive request recordingId=${String(req.params.recordingId)}`);
  forward(res, await deriveScenarios(String(req.params.recordingId), { ...(req.body ?? {}), projectSlug }));
});

router.get('/:recordingId/scenarios', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await getRecordingScenarios(String(req.params.recordingId), projectSlug));
});

router.put('/:recordingId/scenarios', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await saveRecordingScenarios(String(req.params.recordingId), { ...(req.body ?? {}), projectSlug }));
});

router.get('/:recordingId/trace', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await getRecordingTrace(String(req.params.recordingId), projectSlug));
});

router.put('/:recordingId/scenario-value', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await updateRecordingScenarioValue(String(req.params.recordingId), { ...(req.body ?? {}), projectSlug }));
});

router.get('/:recordingId/semantic', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await getSemanticRecording(String(req.params.recordingId), projectSlug));
});

router.post('/:recordingId/testrail', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  const scenarioIds = (req.body as any)?.scenarioIds;
  console.log(
    `[recordings] testrail publish recordingId=${String(req.params.recordingId)} scenarios=${Array.isArray(scenarioIds) ? scenarioIds.length : 'all'}`,
  );
  forward(res, await publishToTestRail(String(req.params.recordingId), { ...(req.body ?? {}), projectSlug }));
});

router.post('/:recordingId/execute', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  const scenarioIds = (req.body as any)?.scenarioIds;
  console.log(
    `[recordings] web replay recordingId=${String(req.params.recordingId)} receivedScenarioIds=${JSON.stringify(Array.isArray(scenarioIds) ? scenarioIds : [])} receivedCount=${Array.isArray(scenarioIds) ? scenarioIds.length : 'all'}`,
  );
  console.log(
    `[recordings] web replay recordingId=${String(req.params.recordingId)} forwardedScenarioIds=${JSON.stringify(Array.isArray(scenarioIds) ? scenarioIds : [])} forwardedCount=${Array.isArray(scenarioIds) ? scenarioIds.length : 'all'}`,
  );
  // 202: the engine answers with a job id, not with the outcome of the replay.
  forward(res, await executeRecording(String(req.params.recordingId), { ...(req.body ?? {}), projectSlug }), 202);
});

router.delete('/:recordingId', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await deleteRecording(String(req.params.recordingId), projectSlug));
});

export default router;
