// src/controllers/leaderboard.controller.ts
import type { RequestHandler } from 'express';
import { LeaderboardEntry } from '#models';

interface PopulatedUser {
  username: string;
  avatar: 'default.png' | 'avatar1.png' | 'avatar2.png' | 'avatar3.png' | 'avatar4.png' | 'avatar5.png' | 'avatar6.png';
}

export const top10: RequestHandler = async (_req, res, next) => {
  try {
    const top10Users = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).populate('userId', 'username avatar');

    const formattedTop10 = top10Users.map((entry) => {
      const user = entry.userId as unknown as PopulatedUser;
      return {
        username: user?.username || entry.username,
        avatar: user?.avatar || 'default.png',
        totalScore: entry.totalScore,
      };
    });

    res.json({ top10: formattedTop10 });
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

    const top10 = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).populate('userId', 'username avatar');

    const formattedTop10 = top10.map((entry) => {
      const user = entry.userId as unknown as PopulatedUser;
      return {
        username: user?.username || entry.username,
        avatar: user?.avatar || 'default.png',
        totalScore: entry.totalScore,
      };
    });

    res.json({
      top10,
      yourRank: rank + 1,
      yourScore: userEntry.totalScore,
    });
  } catch (err) {
    next(err);
  }
};
