import { CampaignBestEntry, CAMPAIGN_SCORE_VERSION } from '../models/AccountCampaign.model.ts';
import type { BestCampaignRecord } from '../models/AccountCampaign.model.ts';
import mongoose from 'mongoose';
export const LEADERBOARD_ORDER = { score: -1, finalizedAt: 1, ownerId: 1 } as const;
export function publicEntry(entry: BestCampaignRecord, rank: number) {
  return {
    accountId: String(entry.ownerId),
    username: entry.username,
    avatar: entry.avatar,
    score: entry.score,
    rank,
    finalizedAt: entry.finalizedAt,
    scoreVersion: entry.scoreVersion,
  };
}
export async function canonicalTop() {
  const rows = await CampaignBestEntry.find({ scoreVersion: CAMPAIGN_SCORE_VERSION }).sort(LEADERBOARD_ORDER).limit(10).lean();
  return { entries: rows.map((row, i) => publicEntry(row, i + 1)), scoreVersion: CAMPAIGN_SCORE_VERSION };
}
export async function canonicalRank(owner: string) {
  // Snapshot transaction keeps entry and count coherent during concurrent finalization.
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const me = await CampaignBestEntry.findOne({ ownerId: owner, scoreVersion: CAMPAIGN_SCORE_VERSION }).session(session).lean();
        if (!me) return { rank: null, best: null, scoreVersion: CAMPAIGN_SCORE_VERSION };
        const higher = await CampaignBestEntry.countDocuments({
          scoreVersion: CAMPAIGN_SCORE_VERSION,
          $or: [
            { score: { $gt: me.score } },
            { score: me.score, finalizedAt: { $lt: me.finalizedAt } },
            { score: me.score, finalizedAt: me.finalizedAt, ownerId: { $lt: me.ownerId } },
          ],
        }).session(session);
        return { rank: higher + 1, best: publicEntry(me, higher + 1), scoreVersion: CAMPAIGN_SCORE_VERSION };
      },
      { readConcern: { level: 'snapshot' }, readPreference: 'primary', writeConcern: { w: 'majority' }, timeoutMS: 10000 },
    );
  } finally {
    await session.endSession();
  }
}
