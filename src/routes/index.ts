import { Router } from 'express';
import { healthRouter } from './health.ts';
// src/routes/index.ts

import authRoutes from './auth.routes.ts';
import userRoutes from './user.routes.ts';
import gameRoutes from './game.routes.ts';
import leaderboardRoutes from './leaderboard.routes.ts';

export const routes = Router();

routes.get('/', (_req, res) => {
  res.type('text').send('match3-backend running');
});

routes.use(healthRouter);

routes.use('/api/auth', authRoutes);
routes.use('/api/user', userRoutes);
routes.use('/api/game', gameRoutes);
routes.use('/api/leaderboard', leaderboardRoutes);

console.log('[routes] index loaded and routes mounted');

export default routes;
