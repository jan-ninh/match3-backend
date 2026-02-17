// src/controllers/campaign.controller.ts
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { CampaignAttempt, CampaignRun, AllTimeLeaderboardEntry, User, type ICampaignAttempt } from '#models';
import { HttpError } from '../utils/httpError.ts';
import {
  CAMPAIGN_META_VERSION,
  computeDisplayScore,
  compareRankKey,
  computeMovesCounted,
  computeRatio,
  getMoveBudget,
  makeRankKey,
  newCampaignId,
  newRunId,
  type RankKey,
  type Outcome,
} from '../services/campaignRanking.ts';

type CampaignStartBody = {
  ACCOUNT_ID?: string;
  CLIENT_VERSION?: string;
  PLATFORM?: string;
  CLIENT_TIMESTAMP_MS?: number;
};

type CampaignLevelEndBody = {
  CAMPAIGN_ID: string;
  LEVEL_INDEX: number;
  ATTEMPT_ID: string;
  OUTCOME: Outcome;
  MOVES_USED_RAW: number;

  CLIENT_TIMESTAMP_MS?: number;
  CLIENT_VERSION?: string;
  LEVEL_CONFIG_HASH?: string;
  PLATFORM?: string;
};

type CampaignLevelAbortBody = {
  CAMPAIGN_ID: string;
  LEVEL_INDEX: number;
  ATTEMPT_ID: string;
  ABORT_REASON: 'disconnect' | 'quit' | 'crash' | 'timeout' | 'unknown';
  MOVES_USED_AT_ABORT?: number;

  CLIENT_TIMESTAMP_MS?: number;
  CLIENT_VERSION?: string;
  PLATFORM?: string;
};

function clampInt(value: number, min: number, max: number): number {
  const v = Math.floor(value);
  return Math.max(min, Math.min(max, v));
}

function computeMetaTierFromUser(user: { powers?: { bomb?: number; laser?: number; extraShuffle?: number } } | null): number {
  // Minimal v1 heuristic: inventory counts as "meta strength". Replace with real Meta SSOT later.
  const bomb = clampInt(user?.powers?.bomb ?? 0, 0, 1_000_000);
  const laser = clampInt(user?.powers?.laser ?? 0, 0, 1_000_000);
  const extraShuffle = clampInt(user?.powers?.extraShuffle ?? 0, 0, 1_000_000);

  const metaPowerScore = bomb + laser + extraShuffle;

  const TIER_SIZE = 5;
  const META_TIER_MAX = 9;

  return Math.max(0, Math.min(META_TIER_MAX, Math.floor(metaPowerScore / TIER_SIZE)));
}

function resolveAccountId(reqBody: unknown, authHeader: string | undefined): string | null {
  // 1) Explicit (dev) body override
  if (typeof reqBody === 'object' && reqBody !== null && 'ACCOUNT_ID' in reqBody) {
    const v = (reqBody as { ACCOUNT_ID?: unknown }).ACCOUNT_ID;
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }

  // 2) x-account-id header (dev)
  // NOTE: express lower-cases header names.
  // eslint is not configured in this backend scaffold; keep it simple.
  //
  // (We intentionally do not rely on req.header(...) here to avoid leaking req into helper signature.)

  // 3) Authorization: Bearer <jwt> (decode only; verification is out-of-scope for this tracking feature)
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const decoded = jwt.decode(token);

    if (decoded && typeof decoded === 'object') {
      const obj = decoded as Record<string, unknown>;
      const candidates = ['id', 'userId', '_id', 'sub'];
      for (const key of candidates) {
        const val = obj[key];
        if (typeof val === 'string' && val.trim().length > 0) return val.trim();
      }
    }
  }

  return null;
}

async function getUserSnapshot(accountId: string): Promise<{ username: string; avatar: string; metaTier: number } | null> {
  // If accountId is a Mongo ObjectId (24 hex), try to load the user.
  if (!/^[a-fA-F0-9]{24}$/.test(accountId)) return null;

  const user = await User.findById(accountId).select('username avatar powers').lean();
  if (!user) return null;

  const metaTier = computeMetaTierFromUser(user);

  return {
    username: user.username,
    avatar: user.avatar,
    metaTier,
  };
}

async function sumRatiosForCampaign(campaignId: string): Promise<number> {
  const attempts = await CampaignAttempt.find({ campaignId }).select('ratio').lean();
  let sum = 0;
  for (const a of attempts) {
    sum += typeof a.ratio === 'number' ? a.ratio : 0;
  }
  return sum;
}

function buildRankKeyFromEntry(entry: {
  totalLevelsPlayed: number;
  metaTier: number;
  movesMetric: number;
  finishedAt: Date;
  runId: string;
}): RankKey {
  return {
    totalLevelsPlayed: entry.totalLevelsPlayed,
    metaTier: entry.metaTier,
    movesMetric: entry.movesMetric,
    finishedAtMs: entry.finishedAt.getTime(),
    runId: entry.runId,
  };
}

export const startCampaign: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignStartBody;

    const authHeader = req.header('authorization') ?? req.header('Authorization');
    const accountId = resolveAccountId(req.body as unknown, authHeader ?? undefined) ?? req.header('x-account-id') ?? req.header('x-user-id') ?? null;

    if (!accountId) {
      throw new HttpError(400, 'Missing ACCOUNT_ID (or Authorization Bearer token)');
    }

    const snapshot = await getUserSnapshot(accountId);

    const campaignId = newCampaignId();

    await CampaignRun.create({
      accountId,
      campaignId,
      startedAt: new Date(),
      metaTier: snapshot?.metaTier ?? 0,
      metaVersion: CAMPAIGN_META_VERSION,
      winsCount: 0,
      lossesCount: 0,
    });

    res.json({
      CAMPAIGN_ID: campaignId,
    });
  } catch (err) {
    next(err);
  }
};

async function upsertAttemptAndBumpCounts(args: {
  run: { campaignId: string; accountId: string };
  kind: 'END' | 'ABORT';
  attemptId: string;
  levelIndex: number;
  outcome: Outcome;
  movesUsedRaw: number;
  abortReason?: CampaignLevelAbortBody['ABORT_REASON'];
}): Promise<{ attempt: ICampaignAttempt; didMutateCounts: boolean; countsDelta: { wins: number; losses: number } }>
{
  const moveBudget = getMoveBudget(args.levelIndex);
  const movesCounted = computeMovesCounted(args.outcome, args.movesUsedRaw, moveBudget);
  const ratio = computeRatio(movesCounted, moveBudget);

  const existing = await CampaignAttempt.findOne({ campaignId: args.run.campaignId, attemptId: args.attemptId });

  if (!existing) {
    const created = await CampaignAttempt.create({
      accountId: args.run.accountId,
      campaignId: args.run.campaignId,
      attemptId: args.attemptId,
      levelIndex: args.levelIndex,
      kind: args.kind,
      outcome: args.outcome,
      abortReason: args.abortReason,
      moveBudget,
      movesUsedRaw: Math.max(0, Math.floor(args.movesUsedRaw)),
      movesCounted,
      ratio,
    });

    return {
      attempt: created,
      didMutateCounts: true,
      countsDelta: {
        wins: args.outcome === 'WIN' ? 1 : 0,
        losses: args.outcome === 'LOSS' ? 1 : 0,
      },
    };
  }

  // Idempotence:
  // - END is authoritative. If END already exists, ignore ABORT.
  if (existing.kind === 'END') {
    return {
      attempt: existing,
      didMutateCounts: false,
      countsDelta: { wins: 0, losses: 0 },
    };
  }

  // Existing is ABORT.
  // - ABORT again => idempotent.
  if (args.kind === 'ABORT') {
    return {
      attempt: existing,
      didMutateCounts: false,
      countsDelta: { wins: 0, losses: 0 },
    };
  }

  // Upgrade ABORT -> END.
  const prevOutcome = existing.outcome;

  existing.kind = 'END';
  existing.outcome = args.outcome;
  existing.abortReason = undefined;

  existing.levelIndex = args.levelIndex;
  existing.moveBudget = moveBudget;
  existing.movesUsedRaw = Math.max(0, Math.floor(args.movesUsedRaw));
  existing.movesCounted = movesCounted;
  existing.ratio = ratio;

  await existing.save();

  const winsDelta = (args.outcome === 'WIN' ? 1 : 0) - (prevOutcome === 'WIN' ? 1 : 0);
  const lossesDelta = (args.outcome === 'LOSS' ? 1 : 0) - (prevOutcome === 'LOSS' ? 1 : 0);

  return {
    attempt: existing,
    didMutateCounts: winsDelta !== 0 || lossesDelta !== 0,
    countsDelta: { wins: winsDelta, losses: lossesDelta },
  };
}

async function maybeFinalizeCampaignAndUpdateLeaderboard(args: {
  run: { accountId: string; campaignId: string; metaTier: number; winsCount: number; lossesCount: number; finishedAt?: Date | null; runId?: string | null };
  levelIndex: number;
  outcome: Outcome;
}): Promise<null | {
  didFinalize: boolean;
  didUpdateLeaderboard: boolean;
  displayScore: number;
  rankKey: RankKey;
}> {
  if (!(args.levelIndex === 12 && args.outcome === 'WIN')) return null;

  const runDoc = await CampaignRun.findOne({ campaignId: args.run.campaignId });
  if (!runDoc) return null;

  if (runDoc.finishedAt) {
    // Already finalized (idempotent)
    const existingEntry = await AllTimeLeaderboardEntry.findOne({ accountId: runDoc.accountId }).lean();
    if (!existingEntry) return null;

    const rankKey = buildRankKeyFromEntry(existingEntry);

    return {
      didFinalize: false,
      didUpdateLeaderboard: false,
      displayScore: existingEntry.displayScore,
      rankKey,
    };
  }

  const finishedAt = new Date();
  const runId = newRunId();

  runDoc.finishedAt = finishedAt;
  runDoc.runId = runId;

  await runDoc.save();

  const totalLevelsPlayed = runDoc.winsCount + runDoc.lossesCount;

  const sumRatio = await sumRatiosForCampaign(runDoc.campaignId);
  const avgRatio = totalLevelsPlayed > 0 ? sumRatio / totalLevelsPlayed : 1;

  const rankKey = makeRankKey({
    totalLevelsPlayed,
    metaTier: runDoc.metaTier,
    avgRatio,
    finishedAt,
    runId,
  });

  const { displayScore } = computeDisplayScore({ totalLevelsPlayed, metaTier: runDoc.metaTier, avgRatio });

  const userSnapshot = await getUserSnapshot(runDoc.accountId);
  const username = userSnapshot?.username ?? 'Unknown';
  const avatar = userSnapshot?.avatar ?? 'default.png';

  const existing = await AllTimeLeaderboardEntry.findOne({ accountId: runDoc.accountId });

  if (!existing) {
    await AllTimeLeaderboardEntry.create({
      accountId: runDoc.accountId,
      username,
      avatar,
      totalLevelsPlayed,
      metaTier: runDoc.metaTier,
      movesMetric: rankKey.movesMetric,
      finishedAt,
      runId,
      displayScore,
    });

    return {
      didFinalize: true,
      didUpdateLeaderboard: true,
      displayScore,
      rankKey,
    };
  }

  const prevRankKey = buildRankKeyFromEntry(existing);
  const cmp = compareRankKey(rankKey, prevRankKey);

  if (cmp === -1) {
    existing.username = username;
    existing.avatar = avatar;

    existing.totalLevelsPlayed = totalLevelsPlayed;
    existing.metaTier = runDoc.metaTier;
    existing.movesMetric = rankKey.movesMetric;
    existing.finishedAt = finishedAt;
    existing.runId = runId;

    existing.displayScore = displayScore;

    await existing.save();

    return {
      didFinalize: true,
      didUpdateLeaderboard: true,
      displayScore,
      rankKey,
    };
  }

  return {
    didFinalize: true,
    didUpdateLeaderboard: false,
    displayScore: existing.displayScore,
    rankKey: prevRankKey,
  };
}

export const levelEnd: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignLevelEndBody;

    const run = await CampaignRun.findOne({ campaignId: body.CAMPAIGN_ID });
    if (!run) throw new HttpError(404, 'CAMPAIGN_ID not found');

    if (run.finishedAt) {
      return res.status(409).json({ error: 'Campaign already finished', finishedAt: run.finishedAt, runId: run.runId });
    }

    const { countsDelta } = await upsertAttemptAndBumpCounts({
      run: { accountId: run.accountId, campaignId: run.campaignId },
      kind: 'END',
      attemptId: body.ATTEMPT_ID,
      levelIndex: body.LEVEL_INDEX,
      outcome: body.OUTCOME,
      movesUsedRaw: body.MOVES_USED_RAW,
    });

    if (countsDelta.wins !== 0 || countsDelta.losses !== 0) {
      run.winsCount += countsDelta.wins;
      run.lossesCount += countsDelta.losses;
      await run.save();
    }

    const finalizeResult = await maybeFinalizeCampaignAndUpdateLeaderboard({
      run: {
        accountId: run.accountId,
        campaignId: run.campaignId,
        metaTier: run.metaTier,
        winsCount: run.winsCount,
        lossesCount: run.lossesCount,
        finishedAt: run.finishedAt,
        runId: run.runId,
      },
      levelIndex: body.LEVEL_INDEX,
      outcome: body.OUTCOME,
    });

    res.json({
      ok: true,
      campaignFinished: finalizeResult?.didFinalize ?? false,
      leaderboardUpdated: finalizeResult?.didUpdateLeaderboard ?? false,
      displayScore: finalizeResult?.displayScore ?? null,
      rankKey: finalizeResult?.rankKey ?? null,
    });
  } catch (err) {
    next(err);
  }
};

export const levelAbort: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CampaignLevelAbortBody;

    const run = await CampaignRun.findOne({ campaignId: body.CAMPAIGN_ID });
    if (!run) throw new HttpError(404, 'CAMPAIGN_ID not found');

    if (run.finishedAt) {
      return res.status(409).json({ error: 'Campaign already finished', finishedAt: run.finishedAt, runId: run.runId });
    }

    const movesUsed = body.MOVES_USED_AT_ABORT ?? 0;

    const { countsDelta } = await upsertAttemptAndBumpCounts({
      run: { accountId: run.accountId, campaignId: run.campaignId },
      kind: 'ABORT',
      attemptId: body.ATTEMPT_ID,
      levelIndex: body.LEVEL_INDEX,
      outcome: 'LOSS',
      movesUsedRaw: movesUsed,
      abortReason: body.ABORT_REASON,
    });

    if (countsDelta.wins !== 0 || countsDelta.losses !== 0) {
      run.winsCount += countsDelta.wins;
      run.lossesCount += countsDelta.losses;
      await run.save();
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
