// src/routes/leaderboard.routes.ts
import { Router } from 'express';
import { top10, myRank } from '#controllers';
import { validateParamsZod } from '#middlewares';
import { z } from 'zod';

const router = Router();

router.get('/top10', top10);
router.get('/rank/:id', validateParamsZod(z.object({ id: z.string() })), myRank);

export default router;
