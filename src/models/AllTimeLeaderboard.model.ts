// src/models/AllTimeLeaderboard.model.ts
import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IAllTimeLeaderboardEntry extends Document {
  accountId: string;
  username: string;
  avatar: string;

  // RankKey (SSOT for sort)
  totalLevelsPlayed: number;
  metaTier: number;
  movesMetric: number;
  finishedAt: Date;
  runId: string;

  // UI score (not used for sort)
  displayScore: number;

  createdAt: Date;
  updatedAt: Date;
}

const allTimeLeaderboardSchema = new Schema<IAllTimeLeaderboardEntry>(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    avatar: { type: String, required: true, default: 'default.png' },

    totalLevelsPlayed: { type: Number, required: true, min: 12, index: true },
    metaTier: { type: Number, required: true, min: 0, index: true },
    movesMetric: { type: Number, required: true, min: 0, index: true },
    finishedAt: { type: Date, required: true, index: true },
    runId: { type: String, required: true },

    displayScore: { type: Number, required: true, min: 0, max: 10_000, index: true },
  },
  { timestamps: true },
);

// Compound index to make RankKey sort fast.
allTimeLeaderboardSchema.index({ totalLevelsPlayed: 1, metaTier: 1, movesMetric: 1, finishedAt: 1, runId: 1 });

export const AllTimeLeaderboardEntry: Model<IAllTimeLeaderboardEntry> = mongoose.model<IAllTimeLeaderboardEntry>(
  'AllTimeLeaderboardEntry',
  allTimeLeaderboardSchema,
);
