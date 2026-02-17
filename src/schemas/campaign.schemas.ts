// src/schemas/campaign.schemas.ts
import { z } from 'zod';

const uuid = z.string().uuid();

export const campaignStartBodySchema = z.object({
  // Usually implicit via Auth token. Optional for dev.
  ACCOUNT_ID: z.string().min(1).optional(),

  CLIENT_VERSION: z.string().min(1).optional(),
  PLATFORM: z.string().min(1).optional(),
  CLIENT_TIMESTAMP_MS: z.number().int().nonnegative().optional(),
});

export const campaignLevelEndBodySchema = z.object({
  CAMPAIGN_ID: uuid,
  LEVEL_INDEX: z.number().int().min(1).max(12),
  ATTEMPT_ID: uuid,
  OUTCOME: z.enum(['WIN', 'LOSS']),
  MOVES_USED_RAW: z.number().int().nonnegative(),

  CLIENT_TIMESTAMP_MS: z.number().int().nonnegative().optional(),
  CLIENT_VERSION: z.string().min(1).optional(),
  LEVEL_CONFIG_HASH: z.string().min(1).optional(),
  PLATFORM: z.string().min(1).optional(),
});

export const campaignLevelAbortBodySchema = z.object({
  CAMPAIGN_ID: uuid,
  LEVEL_INDEX: z.number().int().min(1).max(12),
  ATTEMPT_ID: uuid,
  ABORT_REASON: z.enum(['disconnect', 'quit', 'crash', 'timeout', 'unknown']),
  MOVES_USED_AT_ABORT: z.number().int().nonnegative().optional(),

  CLIENT_TIMESTAMP_MS: z.number().int().nonnegative().optional(),
  CLIENT_VERSION: z.string().min(1).optional(),
  PLATFORM: z.string().min(1).optional(),
});
