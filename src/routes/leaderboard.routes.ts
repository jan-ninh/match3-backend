import { authenticate, matchAccountParam } from '../middlewares/auth.middleware.ts';
// src/routes/leaderboard.routes.ts
import { Router } from 'express';
import { top10, myRank } from '#controllers';
import { validateParamsZod } from '#middlewares';
import { z } from 'zod';

const router = Router();

router.get('/top10', top10);

// user id is a Mongo ObjectId (24 hex chars)
router.get('/rank', authenticate, myRank);
router.get('/rank/:id', authenticate, matchAccountParam, myRank);

export default router;
