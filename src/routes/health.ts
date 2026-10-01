import { Router } from 'express';
import { isReady } from '../readiness.ts';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true });
});
healthRouter.get('/ready', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ready = await isReady();
  res.status(ready ? 200 : 503).json({ ready });
});
