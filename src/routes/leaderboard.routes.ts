// src/routes/leaderboard.routes.ts
import { Router } from 'express';
import { top10, myRank } from '../controllers/leaderboard.controller.ts';
import { validateParamsZod } from '../middlewares/validateZod.ts';
import { z } from 'zod';

const router = Router();

router.get('/top10', top10);
router.get('/rank/:id', validateParamsZod(z.object({ id: z.string() })), myRank);

export default router;
