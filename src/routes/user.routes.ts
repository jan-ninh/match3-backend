import { deprecatedGameplay } from '../controllers/gameplay.controller.ts';
import { Router } from 'express';
import { getProfile, updateAvatar } from '#controllers';
import { z } from 'zod';
import { validateBodyZod } from '#middlewares';
import { authenticate, matchAccountParam } from '../middlewares/auth.middleware.ts';
const router = Router();
const avatarSchema = z.object({
  avatar: z.enum(['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png']),
});
router.use(authenticate);
router.get('/profile/:id', matchAccountParam, getProfile);
router.patch('/avatar', validateBodyZod(avatarSchema), updateAvatar);
router.patch('/powers', deprecatedGameplay);
router.patch('/avatar/:id', matchAccountParam, validateBodyZod(avatarSchema), updateAvatar);
router.patch('/powers/:id', matchAccountParam, deprecatedGameplay);
export default router;
