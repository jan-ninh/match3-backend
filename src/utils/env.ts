import { z } from 'zod';

function toPort(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 3000;
  return n;
}

const envSchema = z.object({
  MONGO_URI: z.string().url({ message: 'MONGO_URI must be a valid URL' }).default('mongodb://localhost:27017'),
  DB_NAME: z.string().default('match3'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  REFRESH_TOKEN_TTL: z.coerce.number().default(30 * 24 * 60 * 60), // 30 days in seconds
  SALT_ROUNDS: z.coerce.number().default(13),
  ACCESS_JWT_SECRET: z
    .string({
      message: 'ACCESS_JWT_SECRET is required and must be at least 64 characters long',
    })
    .min(64, 'ACCESS_JWT_SECRET must be at least 64 characters long'),
  CLIENT_BASE_URL: z.string().url().default('http://localhost:5173'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:\n', parsedEnv.error.issues);
  process.exit(1);
}

const config = parsedEnv.data;

export const { ACCESS_JWT_SECRET, DB_NAME, CLIENT_BASE_URL, MONGO_URI, REFRESH_TOKEN_TTL, SALT_ROUNDS, PORT, NODE_ENV } = config;

export const env = {
  PORT: toPort(process.env.PORT),
} as const;
