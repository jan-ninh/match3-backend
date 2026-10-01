import type { RequestHandler } from 'express';
import { accountId } from '../middlewares/auth.middleware.ts';
import { canonicalTop, canonicalRank } from '../services/canonicalLeaderboard.ts';
export const top10: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await canonicalTop());
  } catch (e) {
    next(e);
  }
};
export const myRank: RequestHandler = async (req, res, next) => {
  try {
    res.json(await canonicalRank(accountId(req)));
  } catch (e) {
    next(e);
  }
};
