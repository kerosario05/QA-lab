import { Router } from 'express';
import type { Request, Response } from 'express';
import { listExecutions, getExecution } from '../executions-provider';
import type { ExecutionsProviderResponse } from '../executions-provider';

const router = Router();

console.log('[executions] route registered');

function statusCodeFor(result: ExecutionsProviderResponse): number {
  if (result.status) return result.status;
  if (result.errorCode === 'EXECUTIONS_NOT_CONFIGURED') return 503;
  if (result.errorCode === 'TIMEOUT') return 504;
  return 502;
}

function forward(res: Response, result: ExecutionsProviderResponse): void {
  if (!result.ok) {
    res.status(statusCodeFor(result)).json({
      ok: false,
      errorCode: result.errorCode,
      error: result.error,
      message: result.message,
      ...(result.body ?? {}),
    });
    return;
  }
  res.status(result.status ?? 200).json(result.body ?? { ok: true });
}

// GET /api/executions
router.get('/', async (_req: Request, res: Response) => {
  const result = await listExecutions();
  forward(res, result);
});

// GET /api/executions/:launchId
router.get('/:launchId', async (req: Request, res: Response) => {
  console.log(`[executions] detail request launchId=${req.params.launchId}`);
  const result = await getExecution(String(req.params.launchId));
  forward(res, result);
});

export default router;
