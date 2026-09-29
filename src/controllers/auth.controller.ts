import type { RequestHandler } from 'express';
import { User } from '#models';
import { hashPassword, comparePassword } from '#utils';
import { currentUser } from '../services/currentUser.ts';
import { createSession, rotateSession, revokeRefresh, refreshCookie, clearRefreshCookie } from '../services/session.service.ts';
import { accountId } from '../middlewares/auth.middleware.ts';
import { RefreshSession } from '../models/RefreshSession.model.ts';
import { HttpError } from '../utils/httpError.ts';
export const register: RequestHandler = async (req, res, next) => {
  try {
    const { email, username, password } = req.body as { email: string; username: string; password: string };
    if (await User.exists({ $or: [{ email }, { username }] })) throw new HttpError(409, 'Email or username already used');
    const user = await User.create({ email, username, password: await hashPassword(password) });
    const accessToken = await createSession(String(user._id), req, res);
    res.status(201).json({ accessToken, user: currentUser(user) });
  } catch (error) {
    next(error);
  }
};
export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await comparePassword(password, user.password))) throw new HttpError(401, 'Invalid credentials');
    const accessToken = await createSession(String(user._id), req, res);
    res.json({ accessToken, user: currentUser(user) });
  } catch (error) {
    next(error);
  }
};
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const session = await rotateSession(req, res);
    const user = await User.findById(session.userId);
    if (!user) {
      await RefreshSession.updateOne({ _id: session.sessionId }, { $set: { revokedAt: new Date() } });
      clearRefreshCookie(res);
      throw new HttpError(401, 'Session expired');
    }
    res.json({ accessToken: session.accessToken, user: currentUser(user) });
  } catch (error) {
    next(error);
  }
};
export const logout: RequestHandler = async (req, res, next) => {
  try {
    await revokeRefresh(refreshCookie(req));
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
};
export const me: RequestHandler = async (req, res, next) => {
  try {
    const user = await User.findById(accountId(req));
    if (!user) throw new HttpError(401, 'Session expired');
    res.json(currentUser(user));
  } catch (error) {
    next(error);
  }
};
