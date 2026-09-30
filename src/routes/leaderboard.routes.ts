import { authenticate, matchAccountParam } from '../middlewares/auth.middleware.ts';
// src/routes/leaderboard.routes.ts
import { Router } from 'express';
import { top10, myRank } from '#controllers';

const router = Router();

router.get('/top', top10);
router.get('/top10', top10);
router.get('/me', authenticate, myRank);

// user id is a Mongo ObjectId (24 hex chars)
router.get('/rank', authenticate, myRank);
router.get('/rank/:id', authenticate, matchAccountParam, myRank);

export default router;
