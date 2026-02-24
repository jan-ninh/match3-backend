import { ACCESS_JWT_SECRET, REFRESH_TOKEN_TTL } from '#config';
import { RefreshToken } from '#models';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

export async function createAccessToken(payload: { id: Types.ObjectId }) {
  return jwt.sign({ sub: payload.id }, ACCESS_JWT_SECRET, {
    expiresIn: '15min',
  });
}

export async function createRefreshToken(id: Types.ObjectId) {
  const refreshToken = crypto.randomBytes(25).toString('hex');
  await RefreshToken.create({ token: refreshToken, userId: id });
  return refreshToken;
}

export async function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_JWT_SECRET) as jwt.JwtPayload;
}
