import { randomBytes } from 'node:crypto';
export function loadConfig(source: NodeJS.ProcessEnv) {
  const mode = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV');
  const production = mode === 'production';
  const required = (key: string, fallback: string) => {
    const value = source[key]?.trim();
    if (!value && production) throw new Error('Missing required configuration: ' + key);
    return value || fallback;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = source[key] === undefined ? fallback : Number(source[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid configuration: ' + key);
    return value;
  };
  const duration = (key: string, fallback: string, max: number) => {
    const v = source[key] ?? fallback;
    const match = /^([0-9]+)(s|m|h|d)?$/.exec(v);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    const seconds = match ? Number(match[1]) * multipliers[match[2] ?? 's']! : NaN;
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > max) throw new Error('Invalid configuration: ' + key);
    return seconds;
  };
  const MONGO_URI = required('MONGO_URI', 'mongodb://127.0.0.1:27017');
  if (!(MONGO_URI.startsWith('mongodb://') || MONGO_URI.startsWith('mongodb+srv://'))) throw new Error('Invalid MONGO_URI');
  const DB_NAME = required('DB_NAME', 'match3_dev');
  if (!/^[a-zA-Z0-9_-]+$/.test(DB_NAME)) throw new Error('Invalid DB_NAME');
  const origins = required('CLIENT_BASE_URL', 'http://localhost:5173')
    .split(',')
    .map((v) => v.trim());
  if (
    !origins.length ||
    origins.some((v) => {
      try {
        const u = new URL(v);
        return u.origin !== v || !['http:', 'https:'].includes(u.protocol) || (production && u.protocol !== 'https:');
      } catch {
        return true;
      }
    })
  )
    throw new Error('Invalid CLIENT_BASE_URL: use exact origins');
  const secret = required('ACCESS_JWT_SECRET', randomBytes(48).toString('base64url'));
  if (Buffer.byteLength(secret) < 32 || /placeholder|replace|change.me/i.test(secret))
    throw new Error('ACCESS_JWT_SECRET must be a random secret of at least 32 bytes');
  const sameSite = source.COOKIE_SAME_SITE ?? (production ? 'none' : 'lax');
  if (!['none', 'lax', 'strict'].includes(sameSite)) throw new Error('Invalid COOKIE_SAME_SITE');
  if (source.COOKIE_SECURE && !['true', 'false'].includes(source.COOKIE_SECURE)) throw new Error('Invalid COOKIE_SECURE');
  const secure = production || source.COOKIE_SECURE === 'true';
  if ((production && source.COOKIE_SECURE === 'false') || (sameSite === 'none' && !secure)) throw new Error('Secure cookies required');
  const accessSeconds = duration('ACCESS_TOKEN_TTL', '15m', 3600);
  const refreshSeconds = duration('REFRESH_TOKEN_TTL', '7d', 30 * 86400);
  if (refreshSeconds <= accessSeconds) throw new Error('REFRESH_TOKEN_TTL must exceed ACCESS_TOKEN_TTL');
  return {
    NODE_ENV: mode,
    PORT: integer('PORT', 3000, 1, 65535),
    MONGO_URI,
    DB_NAME,
    allowedOrigins: [...new Set(origins)],
    ACCESS_JWT_SECRET: secret,
    accessSeconds,
    refreshSeconds,
    issuer: source.JWT_ISSUER || 'match3-api',
    audience: source.JWT_AUDIENCE || 'match3-spa',
    saltRounds: integer('SALT_ROUNDS', 10, mode === 'test' ? 4 : 10, 15),
    trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 5),
    cookieName: secure ? '__Secure-match3_refresh' : 'match3_refresh',
    cookie: { httpOnly: true as const, secure, sameSite: sameSite as 'none' | 'lax' | 'strict', path: '/api/auth' },
  };
}
export const env = loadConfig(process.env);
