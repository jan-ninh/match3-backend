import type { RequestHandler } from 'express';
import { accountId } from '../middlewares/auth.middleware.ts';
import { executeGameplay, readOperation } from '../services/gameplayTransitions.ts';
import { User } from '../models/User.model.ts';
import { StageAttempt } from '../models/Gameplay.model.ts';
import { currentUser } from '../services/currentUser.ts';
import { HttpError } from '../utils/httpError.ts';
const command =
  (kind: 'START' | 'TERMINAL' | 'REWARD' | 'LEGACY_ABANDON'): RequestHandler =>
  async (req, res, next) => {
    try {
      res.json(await executeGameplay(accountId(req), { kind, body: req.body }));
    } catch (e) {
      next(e);
    }
  };
export const startAttempt = command('START'),
  finishAttempt = command('TERMINAL'),
  claimReward = command('REWARD'),
  abandonLegacy = command('LEGACY_ABANDON');
export const getGameplaySnapshot: RequestHandler = async (req, res, next) => {
  try {
    const user = await User.findById(accountId(req));
    if (!user) throw new HttpError(401, 'Account unavailable');
    res.json(currentUser(user));
  } catch (e) {
    next(e);
  }
};
export const getOperation: RequestHandler = async (req, res, next) => {
  try {
    res.json(await readOperation(accountId(req), String(req.params.id)));
  } catch (e) {
    next(e);
  }
};
export const getAttempt: RequestHandler = async (req, res, next) => {
  try {
    const attempt = await StageAttempt.findOne({ ownerId: accountId(req), attemptId: req.params.id }).lean();
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    res.json({ attempt });
  } catch (e) {
    next(e);
  }
};
export const deprecatedGameplay: RequestHandler = (_req, res) => {
  res.status(410).json({ error: 'Use acknowledged gameplay commands and receipts' });
};
