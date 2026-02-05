// src/models/Leaderboard.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILeaderboardEntry extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  totalScore: number;
  updatedAt: Date;
}

const leaderboardSchema = new Schema<ILeaderboardEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    username: { type: String, required: true },
    totalScore: { type: Number, required: true, default: 0, index: true },
  },
  { timestamps: true },
);

leaderboardSchema.index({ totalScore: -1 });

export const LeaderboardEntry: Model<ILeaderboardEntry> = mongoose.model<ILeaderboardEntry>('LeaderboardEntry', leaderboardSchema);
