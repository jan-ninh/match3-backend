// src/routes/leaderboard.routes.ts
import { Router } from 'express';
import { top10, myRank } from '#controllers';
import { validateParamsZod } from '#middlewares';
import { z } from 'zod';

const router = Router();

router.get('/top10', top10);

// user id is a Mongo ObjectId (24 hex chars)
router.get('/rank/:id', validateParamsZod(z.object({ id: z.string().min(24).max(24) })), myRank);

export default router;
