// src/utils/hash.ts
import bcrypt from 'bcrypt';

import { env } from './env.ts';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, env.saltRounds);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
