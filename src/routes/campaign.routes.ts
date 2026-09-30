import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.ts';
const router = Router();
router.use(authenticate);
// Legacy ranking telemetry is paused, not a second source of account gameplay authority.
router.post(['/start', '/levelEnd', '/levelAbort'], (_req, res) => res.status(410).json({ error: 'Campaign telemetry is paused pending consolidation' }));
export default router;
