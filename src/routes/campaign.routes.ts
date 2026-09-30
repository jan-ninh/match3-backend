import { Router } from 'express';
import { getGameplaySnapshot } from '../controllers/gameplay.controller.ts';
import { authenticate } from '../middlewares/auth.middleware.ts';
const router = Router();
router.use(authenticate);
router.get('/current', getGameplaySnapshot);
// Legacy ranking telemetry is paused, not a second source of account gameplay authority.
router.post(['/start', '/levelEnd', '/levelAbort'], (_req, res) =>
  res.status(410).json({ error: 'Campaign lifecycle is owned by authoritative gameplay commands' }),
);
export default router;
