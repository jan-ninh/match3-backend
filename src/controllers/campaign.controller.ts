// src/controllers/campaign.controller.ts
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { CampaignAttempt, CampaignRun, type CampaignAbortReason, type CampaignOutcome } from '#models';

type CampaignStartBody = Readonly<{
  ACCOUNT_ID?: string;
  CLIENT_VERSION?: string;
  PLATFORM?: string;
  CLIENT_TIMESTAMP_MS?: number;
}>;

type CampaignLevelEndBody = Readonly<{
  CAMPAIGN_ID: string;
  ACCOUNT_ID?: string;

  LEVEL_INDEX: number;
  ATTEMPT_ID: string;

  OUTCOME: CampaignOutcome;
  MOVES_USED_RAW: number;

  CLIENT_TIMESTAMP_MS?: number;
  CLIENT_VERSION?: string;
  LEVEL_CONFIG_HASH?: string;
  PLATFORM?: string;
}>;

type CampaignLevelAbortBody = Readonly<{
  CAMPAIGN_ID: string;
  ACCOUNT_ID?: string;

  LEVEL_INDEX: number;
  ATTEMPT_ID: string;

  ABORT_REASON: CampaignAbortReason;
  MOVES_USED_AT_ABORT?: number;

  CLIENT_TIMESTAMP_MS?: number;
  CLIENT_VERSION?: string;
  PLATFORM?: string;
}>;

function isMongoDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown };
  return e.code === 11000;
}

async function ensureCampaignRunExists(campaignId: string, meta: CampaignStartBody): Promise<void> {
  const existing = await CampaignRun.findOne({ campaignId }).select('_id').lean();
  if (existing) return;

  try {
    await CampaignRun.create({
      campaignId,
      accountId: meta.ACCOUNT_ID ?? null,
      platform: meta.PLATFORM ?? null,
      clientVersion: meta.CLIENT_VERSION ?? null,
      clientTimestampMs: typeof meta.CLIENT_TIMESTAMP_MS === 'number' ? meta.CLIENT_TIMESTAMP_MS : null,
    });
  } catch (err) {
    // race: another request created it
    if (isMongoDuplicateKeyError(err)) return;
    throw err;
  }
}

export const startCampaign: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignStartBody;

    // extremely low chance of collision; still try a few times
    for (let i = 0; i < 3; i++) {
      const campaignId = randomUUID();

      try {
        await CampaignRun.create({
          campaignId,
          accountId: body.ACCOUNT_ID ?? null,
          platform: body.PLATFORM ?? null,
          clientVersion: body.CLIENT_VERSION ?? null,
          clientTimestampMs: typeof body.CLIENT_TIMESTAMP_MS === 'number' ? body.CLIENT_TIMESTAMP_MS : null,
        });

        res.json({ CAMPAIGN_ID: campaignId });
        return;
      } catch (err) {
        if (isMongoDuplicateKeyError(err)) continue;
        throw err;
      }
    }

    // if we got here, collisions 3x in a row (practically impossible)
    res.status(500).json({ error: 'Failed to generate unique CAMPAIGN_ID' });
  } catch (err) {
    next(err);
  }
};

export const campaignLevelEnd: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignLevelEndBody;

    await ensureCampaignRunExists(body.CAMPAIGN_ID, {
      ACCOUNT_ID: body.ACCOUNT_ID,
      PLATFORM: body.PLATFORM,
      CLIENT_VERSION: body.CLIENT_VERSION,
      CLIENT_TIMESTAMP_MS: body.CLIENT_TIMESTAMP_MS,
    });

    const existing = await CampaignAttempt.findOne({ campaignId: body.CAMPAIGN_ID, attemptId: body.ATTEMPT_ID }).lean();

    // If an abort was recorded (e.g. disconnect), allow END to upgrade it.
    if (existing && existing.kind === 'ABORT') {
      const update = await CampaignAttempt.updateOne(
        { campaignId: body.CAMPAIGN_ID, attemptId: body.ATTEMPT_ID, kind: 'ABORT' },
        {
          $set: {
            kind: 'END',
            levelIndex: body.LEVEL_INDEX,
            outcome: body.OUTCOME,
            movesUsedRaw: body.MOVES_USED_RAW,
            clientTimestampMs: typeof body.CLIENT_TIMESTAMP_MS === 'number' ? body.CLIENT_TIMESTAMP_MS : null,
            clientVersion: body.CLIENT_VERSION ?? null,
            levelConfigHash: body.LEVEL_CONFIG_HASH ?? null,
            platform: body.PLATFORM ?? null,
          },
          $unset: {
            abortReason: '',
            movesUsedAtAbort: '',
          },
        },
      );

      res.json({ ok: true, deduped: false, upgradedFromAbort: update.modifiedCount > 0 });
      return;
    }

    if (existing) {
      res.json({ ok: true, deduped: true });
      return;
    }

    try {
      await CampaignAttempt.create({
        campaignId: body.CAMPAIGN_ID,
        levelIndex: body.LEVEL_INDEX,
        attemptId: body.ATTEMPT_ID,
        kind: 'END',

        outcome: body.OUTCOME,
        movesUsedRaw: body.MOVES_USED_RAW,

        clientTimestampMs: typeof body.CLIENT_TIMESTAMP_MS === 'number' ? body.CLIENT_TIMESTAMP_MS : null,
        clientVersion: body.CLIENT_VERSION ?? null,
        levelConfigHash: body.LEVEL_CONFIG_HASH ?? null,
        platform: body.PLATFORM ?? null,
      });

      res.json({ ok: true, deduped: false });
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        res.json({ ok: true, deduped: true });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

export const campaignLevelAbort: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignLevelAbortBody;

    await ensureCampaignRunExists(body.CAMPAIGN_ID, {
      ACCOUNT_ID: body.ACCOUNT_ID,
      PLATFORM: body.PLATFORM,
      CLIENT_VERSION: body.CLIENT_VERSION,
      CLIENT_TIMESTAMP_MS: body.CLIENT_TIMESTAMP_MS,
    });

    const existing = await CampaignAttempt.findOne({ campaignId: body.CAMPAIGN_ID, attemptId: body.ATTEMPT_ID }).lean();

    if (existing) {
      // If END already exists, ignore abort; if ABORT exists, dedupe.
      res.json({ ok: true, deduped: true });
      return;
    }

    try {
      await CampaignAttempt.create({
        campaignId: body.CAMPAIGN_ID,
        levelIndex: body.LEVEL_INDEX,
        attemptId: body.ATTEMPT_ID,
        kind: 'ABORT',

        abortReason: body.ABORT_REASON,
        movesUsedAtAbort: typeof body.MOVES_USED_AT_ABORT === 'number' ? body.MOVES_USED_AT_ABORT : undefined,

        clientTimestampMs: typeof body.CLIENT_TIMESTAMP_MS === 'number' ? body.CLIENT_TIMESTAMP_MS : null,
        clientVersion: body.CLIENT_VERSION ?? null,
        platform: body.PLATFORM ?? null,
      });

      res.json({ ok: true, deduped: false });
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        res.json({ ok: true, deduped: true });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};
