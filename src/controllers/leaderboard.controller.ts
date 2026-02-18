// src/controllers/leaderboard.controller.ts
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { LeaderboardEntry, User } from '#models';

export const top10: RequestHandler = async (_req, res, next) => {
  try {
    const entries = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).lean();

    const userIds = entries
      .map((e) => {
        const raw = e.userId as unknown;
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        if (raw instanceof mongoose.Types.ObjectId) return raw.toString();
        if (typeof raw === 'object' && raw !== null && '_id' in raw) {
          const id = (raw as { _id?: unknown })._id;
          if (typeof id === 'string') return id;
          if (id instanceof mongoose.Types.ObjectId) return id.toString();
        }
        return null;
      })
      .filter((v): v is string => !!v);

    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('_id username avatar').lean() : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const formatted = entries.map((e) => ({
      userId: String(e.userId),
      username: userById.get(String(e.userId))?.username ?? e.username ?? 'Unknown',
      avatar: userById.get(String(e.userId))?.avatar ?? 'default.png',
      totalScore: e.totalScore,
    }));

    res.json({ top10: formatted });
  } catch (err) {
    next(err);
  }
};

export const myRank: RequestHandler = async (req, res, next) => {
  try {
    const rawId = req.params.id;
    if (typeof rawId !== 'string' || !mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const id = rawId;

    const me = await LeaderboardEntry.findOne({ userId: id }).lean();
    if (!me) return res.status(404).json({ error: 'User not in leaderboard' });

    const betterCount = await LeaderboardEntry.countDocuments({ totalScore: { $gt: me.totalScore } });

    const top10Entries = await LeaderboardEntry.find().sort({ totalScore: -1 }).limit(10).lean();

    const userIds = top10Entries
      .map((e) => {
        const raw = e.userId as unknown;
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        if (raw instanceof mongoose.Types.ObjectId) return raw.toString();
        return null;
      })
      .filter((v): v is string => !!v);

    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('_id username avatar').lean() : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const top10 = top10Entries.map((e) => ({
      userId: String(e.userId),
      username: userById.get(String(e.userId))?.username ?? e.username ?? 'Unknown',
      avatar: userById.get(String(e.userId))?.avatar ?? 'default.png',
      totalScore: e.totalScore,
    }));

    res.json({
      top10,
      yourRank: betterCount + 1,
      yourScore: me.totalScore,
    });
  } catch (err) {
    next(err);
  }
};
