import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { env } from '../utils/env.ts';
import { RefreshSession } from '../models/RefreshSession.model.ts';
import { HttpError } from '../utils/httpError.ts';
export const tokenDigest = (raw: string) => createHash('sha256').update(raw).digest('hex');
export function refreshCookie(req: Request): string | null {
  const entries = (req.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(env.cookieName + '='));
  if (entries.length !== 1) return null;
  const raw = entries[0]!.slice(env.cookieName.length + 1);
  return /^[A-Za-z0-9_-]{64}$/.test(raw) ? raw : null;
}
export function clearRefreshCookie(res: Response) {
  res.clearCookie(env.cookieName, env.cookie);
}
function setCookie(res: Response, raw: string, expiresAt: Date) {
  res.cookie(env.cookieName, raw, { ...env.cookie, expires: expiresAt, maxAge: Math.max(0, expiresAt.getTime() - Date.now()) });
}
export function signAccess(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId, type: 'access' }, env.ACCESS_JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: env.issuer,
    audience: env.audience,
    expiresIn: env.accessSeconds,
  });
}
export async function revokeRefresh(raw: string | null) {
  if (raw)
    await RefreshSession.updateMany(
      { $or: [{ tokenHash: tokenDigest(raw) }, { usedTokenHashes: tokenDigest(raw) }] },
      { $set: { revokedAt: new Date() } },
    );
}
export async function createSession(userId: string, req: Request, res: Response) {
  await revokeRefresh(refreshCookie(req));
  const raw = randomBytes(48).toString('base64url');
  const session = await RefreshSession.create({
    userId,
    tokenHash: tokenDigest(raw),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + env.refreshSeconds * 1000),
  });
  setCookie(res, raw, session.expiresAt);
  return signAccess(userId, String(session._id));
}
export async function rotateSession(req: Request, res: Response) {
  const raw = refreshCookie(req);
  const invalid = () => {
    clearRefreshCookie(res);
    return new HttpError(401, 'Session expired');
  };
  if (!raw) throw invalid();
  const hash = tokenDigest(raw),
    now = new Date(),
    replacement = randomBytes(48).toString('base64url');
  // A single-document compare-and-swap has one winner, including concurrent refreshes.
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { tokenHash: tokenDigest(replacement), rotatedAt: now }, $push: { usedTokenHashes: hash } },
    { new: true },
  );
  if (!session) {
    // Reusing a consumed token revokes the whole session family, including its latest token.
    await RefreshSession.updateMany({ usedTokenHashes: hash, revokedAt: null }, { $set: { revokedAt: now } });
    throw invalid();
  }
  setCookie(res, replacement, session.expiresAt);
  return {
    userId: String(session.userId),
    accessToken: signAccess(String(session.userId), String(session._id)),
    sessionId: String(session._id),
  };
}
