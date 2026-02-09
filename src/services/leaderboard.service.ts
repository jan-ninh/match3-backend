// src/services/leaderboard.service.ts
import { LeaderboardEntry } from '#models';
import mongoose from 'mongoose';

export async function upsertLeaderboard(userId: mongoose.Types.ObjectId, totalScore: number) {
  return LeaderboardEntry.findOneAndUpdate({ userId }, { $set: { totalScore } }, { upsert: true, new: true }).exec();
}

export async function getTopN(n = 10) {
  return LeaderboardEntry.find().sort({ totalScore: -1 }).limit(n).populate('userId', 'username avatar totalScore').lean();
}

export async function getUserRank(userId: mongoose.Types.ObjectId) {
  // rank calculation: count how many entries have greater score + 1
  const userEntry = await LeaderboardEntry.findOne({ userId }).lean();
  if (!userEntry) return { rank: null, totalScore: 0 };
  const betterCount = await LeaderboardEntry.countDocuments({ totalScore: { $gt: userEntry.totalScore } });
  return { rank: betterCount + 1, totalScore: userEntry.totalScore };
}
