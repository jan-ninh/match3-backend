// src/controllers/leaderboard.controller.ts
import type { RequestHandler } from 'express';
import { LeaderboardEntry } from '#models';

export const top10: RequestHandler = async (_req, res, next) => {
  try {
    const top10Users = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).select('username totalScore');

    res.json({ top10: top10Users });
  } catch (err) {
    next(err);
  }
};

export const myRank: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    const userEntry = await LeaderboardEntry.findOne({ userId: id });
    if (!userEntry) return res.status(404).json({ error: 'User not in leaderboard' });

    const rank = await LeaderboardEntry.countDocuments({ totalScore: { $gt: userEntry.totalScore } });

    const top10 = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).select('username totalScore');

    res.json({
      top10,
      yourRank: rank + 1,
      yourScore: userEntry.totalScore,
    });
  } catch (err) {
    next(err);
  }
};
