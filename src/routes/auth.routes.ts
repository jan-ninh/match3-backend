import { Router } from 'express';
import { register, login, refresh, logout, me } from '#controllers';
import { validateBodyZod } from '#middlewares';
import { registerSchema, loginSchema } from '#schemas';
import { authenticate, requireFrontendOrigin } from '../middlewares/auth.middleware.ts';
const router = Router();
// A bounded in-process limiter is suitable for a single service; shared limiting is a deployment follow-up.
const attempts = new Map<string, { count: number; until: number }>();
router.use(['/login', '/register'], (req, res, next) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip ?? 'unknown';
  const value = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
  value.count++;
  attempts.set(key, value);
  if (value.count > 30) {
    res.setHeader('Retry-After', Math.ceil((value.until - now) / 1000));
    return res.status(429).json({ error: 'Try again later' });
  }
  next();
});
router.post('/register', requireFrontendOrigin, validateBodyZod(registerSchema), register);
router.post('/login', requireFrontendOrigin, validateBodyZod(loginSchema), login);
router.post('/refresh', requireFrontendOrigin, refresh);
router.post('/logout', requireFrontendOrigin, logout);
router.get('/me', authenticate, me);
export default router;
