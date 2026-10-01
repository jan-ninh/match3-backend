import type { RequestHandler, Request } from 'express';
import jwt from 'jsonwebtoken';
import { RefreshSession } from '../models/RefreshSession.model.ts';
import { env } from '../utils/env.ts';
import { HttpError } from '../utils/httpError.ts';
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string };
    }
  }
}
export function accountId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'Authentication required');
  return req.auth.userId;
}
export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  let claims: jwt.JwtPayload;
  try {
    const parsed = jwt.verify(header.slice(7), env.ACCESS_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.issuer,
      audience: env.audience,
    });
    if (
      typeof parsed === 'string' ||
      parsed.type !== 'access' ||
      !/^[a-f0-9]{24}$/i.test(parsed.sub ?? '') ||
      typeof parsed.sid !== 'string' ||
      !/^[a-f0-9]{24}$/i.test(parsed.sid) ||
      typeof parsed.exp !== 'number'
    )
      throw Error('claims');
    claims = parsed;
  } catch {
    return res.status(401).json({ error: 'Access token invalid or expired' });
  }
  try {
    const active = await RefreshSession.exists({ _id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!active) return res.status(401).json({ error: 'Session expired' });
    req.auth = { userId: claims.sub!, sessionId: claims.sid as string };
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch (error) {
    next(error);
  }
};
export const requireFrontendOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (!origin || !env.allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Origin not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  next();
};
// Kept only for historical route compatibility; the controller still reads req.auth.
export const matchAccountParam: RequestHandler = (req, res, next) => {
  if (req.params.id && req.params.id !== accountId(req)) return res.status(403).json({ error: 'Account mismatch' });
  next();
};
