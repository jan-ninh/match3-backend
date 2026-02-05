// src/routes/user.routes.ts
import { Router } from 'express';
import { getProfile, updateAvatar, updatePowers } from '../controllers/user.controller.ts';
import { z } from 'zod';
import { validateBodyZod, validateParamsZod } from '../middlewares/validateZod.ts';

const router = Router();

const avatarSchema = z.object({
  avatar: z.enum(['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png']),
});

const idParam = z.object({ id: z.string() });

const powersSchema = z.object({
  powers: z.object({
    bomb: z.number().int().nonnegative().optional(),
    rocket: z.number().int().nonnegative().optional(),
    extraTime: z.number().int().nonnegative().optional(),
  }),
  operation: z.enum(['set', 'add']).optional(),
});

router.get('/profile/:id', validateParamsZod(idParam), getProfile);
router.patch('/avatar/:id', validateParamsZod(idParam), validateBodyZod(avatarSchema), updateAvatar);

// 2) /api/user/powers/:id
router.patch('/powers/:id', validateParamsZod(idParam), validateBodyZod(powersSchema), updatePowers);
export default router;
