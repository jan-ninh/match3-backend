import type { RequestHandler } from 'express';
import { verifyAccessToken } from '#utils';

export const authenticateToken: RequestHandler = async (req, res, next) => {
  // Try to get token from Authorization header (Bearer) first
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.split(' ')[1]; // "Bearer <token>"

  // Fallback to cookie (from httpOnly cookie)
  const cookieToken = (req as any).cookies?.accessToken;

  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = await verifyAccessToken(token);
    (req as any).userId = decoded.sub;
    next();
  } catch (err: any) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};
