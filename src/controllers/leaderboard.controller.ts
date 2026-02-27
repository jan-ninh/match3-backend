// src/controllers/leaderboard.controller.ts
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { LeaderboardEntry } from '#models';

type PopulatedUser = { username?: string; avatar?: string } | null;

function ensureObjectId(id: string): mongoose.Types.ObjectId | null {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

export const top10: RequestHandler = async (_req, res, next) => {
  try {
    const entries = await LeaderboardEntry.find()
      .sort({ totalScore: -1, updatedAt: -1 })
      .limit(10)
      .populate('userId', 'username avatar')
      .lean();

    const formatted = entries.map((e) => {
      const u = (e as unknown as { userId?: PopulatedUser }).userId ?? null;
      const username = (u && u.username) || (e as unknown as { username?: string }).username || 'Unknown';
      const avatar = (u && u.avatar) || 'default.png';
      const totalScore = (e as unknown as { totalScore?: unknown }).totalScore;
      return {
        username,
        avatar,
        totalScore: typeof totalScore === 'number' ? totalScore : Number(totalScore) || 0,
      };
    });

    res.json({ top10: formatted });
  } catch (err) {
    next(err);
  }
};

export const myRank: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const userId = ensureObjectId(id);
    if (!userId) return res.status(400).json({ error: 'Invalid id' });

    const me = await LeaderboardEntry.findOne({ userId })
      .populate('userId', 'username avatar')
      .lean();

    if (!me) return res.status(404).json({ error: 'User not in leaderboard' });

    const myScoreRaw = (me as unknown as { totalScore?: unknown }).totalScore;
    const myScore = typeof myScoreRaw === 'number' ? myScoreRaw : Number(myScoreRaw) || 0;

    const betterCount = await LeaderboardEntry.countDocuments({ totalScore: { $gt: myScore } });

    const top10Entries = await LeaderboardEntry.find()
      .sort({ totalScore: -1, updatedAt: -1 })
      .limit(10)
      .populate('userId', 'username avatar')
      .lean();

    const top10 = top10Entries.map((e) => {
      const u = (e as unknown as { userId?: PopulatedUser }).userId ?? null;
      const username = (u && u.username) || (e as unknown as { username?: string }).username || 'Unknown';
      const avatar = (u && u.avatar) || 'default.png';
      const totalScore = (e as unknown as { totalScore?: unknown }).totalScore;
      return {
        username,
        avatar,
        totalScore: typeof totalScore === 'number' ? totalScore : Number(totalScore) || 0,
      };
    });

    res.json({
      top10,
      yourRank: betterCount + 1,
      yourScore: myScore,
    });
  } catch (err) {
    next(err);
  }
};
