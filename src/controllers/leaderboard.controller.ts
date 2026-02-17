// src/controllers/leaderboard.controller.ts
import type { RequestHandler } from 'express';
import { AllTimeLeaderboardEntry } from '#models';

export const top10: RequestHandler = async (_req, res, next) => {
  try {
    const entries = await AllTimeLeaderboardEntry.find()
      .sort({ totalLevelsPlayed: 1, metaTier: 1, movesMetric: 1, finishedAt: 1, runId: 1 })
      .limit(10)
      .lean();

    const formatted = entries.map((e) => ({
      username: e.username,
      avatar: e.avatar,
      totalScore: e.displayScore, // keep FE shape compatible
      // Optional debug / UI extras:
      totalLevelsPlayed: e.totalLevelsPlayed,
      metaTier: e.metaTier,
      movesMetric: e.movesMetric,
    }));

    res.json({ top10: formatted });
  } catch (err) {
    next(err);
  }
};

export const myRank: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const me = await AllTimeLeaderboardEntry.findOne({ accountId: id }).lean();
    if (!me) return res.status(404).json({ error: 'User not in leaderboard' });

    const rankQuery = {
      $or: [
        { totalLevelsPlayed: { $lt: me.totalLevelsPlayed } },
        { totalLevelsPlayed: me.totalLevelsPlayed, metaTier: { $lt: me.metaTier } },
        { totalLevelsPlayed: me.totalLevelsPlayed, metaTier: me.metaTier, movesMetric: { $lt: me.movesMetric } },
        {
          totalLevelsPlayed: me.totalLevelsPlayed,
          metaTier: me.metaTier,
          movesMetric: me.movesMetric,
          finishedAt: { $lt: me.finishedAt },
        },
        {
          totalLevelsPlayed: me.totalLevelsPlayed,
          metaTier: me.metaTier,
          movesMetric: me.movesMetric,
          finishedAt: me.finishedAt,
          runId: { $lt: me.runId },
        },
      ],
    } as const;

    const betterCount = await AllTimeLeaderboardEntry.countDocuments(rankQuery);

    const top10Entries = await AllTimeLeaderboardEntry.find()
      .sort({ totalLevelsPlayed: 1, metaTier: 1, movesMetric: 1, finishedAt: 1, runId: 1 })
      .limit(10)
      .lean();

    const top10 = top10Entries.map((e) => ({
      username: e.username,
      avatar: e.avatar,
      totalScore: e.displayScore,
      totalLevelsPlayed: e.totalLevelsPlayed,
      metaTier: e.metaTier,
      movesMetric: e.movesMetric,
    }));

    res.json({
      top10,
      yourRank: betterCount + 1,
      yourScore: me.displayScore,
      yourRankKey: {
        totalLevelsPlayed: me.totalLevelsPlayed,
        metaTier: me.metaTier,
        movesMetric: me.movesMetric,
        finishedAt: me.finishedAt,
        runId: me.runId,
      },
    });
  } catch (err) {
    next(err);
  }
};
