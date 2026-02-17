// src/schemas/campaign.schemas.ts
import { z } from 'zod';

const optNonEmptyString = z.string().trim().min(1).optional();
const optClientTs = z.number().int().nonnegative().optional();

export const campaignStartBodySchema = z.object({
  // only send when no auth (optional); accepted for flexibility
  ACCOUNT_ID: optNonEmptyString,

  CLIENT_VERSION: optNonEmptyString,
  PLATFORM: optNonEmptyString,
  CLIENT_TIMESTAMP_MS: optClientTs,
});

export const campaignLevelEndBodySchema = z.object({
  CAMPAIGN_ID: z.string().trim().min(1),
  ACCOUNT_ID: optNonEmptyString,

  LEVEL_INDEX: z.number().int().min(1).max(12),
  ATTEMPT_ID: z.string().uuid(),

  OUTCOME: z.enum(['WIN', 'LOSS']),
  MOVES_USED_RAW: z.number().int().nonnegative(),

  CLIENT_TIMESTAMP_MS: optClientTs,
  CLIENT_VERSION: optNonEmptyString,
  LEVEL_CONFIG_HASH: optNonEmptyString,
  PLATFORM: optNonEmptyString,
});

export const campaignLevelAbortBodySchema = z.object({
  CAMPAIGN_ID: z.string().trim().min(1),
  ACCOUNT_ID: optNonEmptyString,

  LEVEL_INDEX: z.number().int().min(1).max(12),
  ATTEMPT_ID: z.string().uuid(),

  ABORT_REASON: z.enum(['disconnect', 'quit', 'crash', 'timeout', 'unknown']),
  MOVES_USED_AT_ABORT: z.number().int().nonnegative().optional(),

  CLIENT_TIMESTAMP_MS: optClientTs,
  CLIENT_VERSION: optNonEmptyString,
  PLATFORM: optNonEmptyString,
});
