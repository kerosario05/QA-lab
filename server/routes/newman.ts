import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

const NEWMAN_BASE_URL = process.env.NEWMAN_API_URL ?? 'http://localhost:3002';

// GET /api/newman/collections
router.get('/collections', async (_req: Request, res: Response) => {
  try {
    const upstream = await fetch(`${NEWMAN_BASE_URL}/api/newman/collections`);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err: any) {
    console.error('[newman] collections error:', err.message);
    res.status(502).json({ ok: false, error: 'Failed to fetch Newman collections' });
  }
});

// POST /api/newman/run
router.post('/run', async (req: Request, res: Response) => {
  try {
    const upstream = await fetch(`${NEWMAN_BASE_URL}/api/newman/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err: any) {
    console.error('[newman] run error:', err.message);
    res.status(502).json({ ok: false, error: 'Failed to start Newman run' });
  }
});

// GET /api/newman/:jobId/report
router.get('/:jobId/report', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  try {
    const upstream = await fetch(`${NEWMAN_BASE_URL}/api/newman/${jobId}/report`);
    if (!upstream.ok) {
      res.status(upstream.status).json({ ok: false, error: 'Report not available' });
      return;
    }
    const contentType = upstream.headers.get('Content-Type') ?? 'application/pdf';
    const disposition = upstream.headers.get('Content-Disposition') ?? `attachment; filename="reporte-${jobId}.pdf"`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[newman] report error:', err.message);
    res.status(502).json({ ok: false, error: 'Failed to fetch Newman report' });
  }
});

export default router;
