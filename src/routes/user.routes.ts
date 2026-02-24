// src/routes/user.routes.ts
import { Router } from 'express';
import { getProfile, updateAvatar, updatePowers } from '#controllers';
import { z } from 'zod';
import { authenticateToken, validateBodyZod, validateParamsZod } from '#middlewares';

const router = Router();

const avatarSchema = z.object({
  avatar: z.enum(['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png']),
});

const idParam = z.object({ id: z.string() });

const powersSchema = z.object({
  powers: z.object({
    bomb: z.number().int().nonnegative().optional(),
    laser: z.number().int().nonnegative().optional(),
    extraShuffle: z.number().int().nonnegative().optional(),
  }),
  operation: z.enum(['set', 'add']).optional(),
});

router.get('/profile/:id', authenticateToken, validateParamsZod(idParam), getProfile);
router.patch('/avatar/:id', validateParamsZod(idParam), validateBodyZod(avatarSchema), updateAvatar);

// 2) /api/user/powers/:id
router.patch('/powers/:id', validateParamsZod(idParam), validateBodyZod(powersSchema), updatePowers);
export default router;
