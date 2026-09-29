// src/models/User.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export type PowerKey = 'bomb' | 'laser' | 'extraShuffle';

interface Powers {
  bomb: number;
  laser: number;
  extraShuffle: number;
}

interface StageProgress {
  completed: boolean;
  points: number;
  lastCompletedAt?: Date;
  usedPower?: PowerKey; // Track which power was used (optional)
}

export interface BadgeProgress {
  badgeKey: string;
  achievedAt: Date;
}

interface ActiveStageRun {
  stageId: string;
  boosterSnapshot: Powers;
  stageSelectedBoosters: Powers;
}

export interface IUser {
  email: string;
  username: string;
  password: string;
  avatar: 'default.png' | 'avatar1.png' | 'avatar2.png' | 'avatar3.png' | 'avatar4.png' | 'avatar5.png' | 'avatar6.png';
  powers: Powers;
  totalScore: number;
  hearts: number;
  progress: Map<string, StageProgress>; // stage1, stage2, ..., stage12
  badges: BadgeProgress[];
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  activeStageRun?: ActiveStageRun;
  createdAt: Date;
  updatedAt: Date;
  lastHeartRefillAt?: Date;

  /**
   * Persistent meta-progression (farmable across runs).
   * - Stays on LOSS reset (roguelite run reset).
   * - Updated on each WIN (including replays).
   */
  playerLevel: number; // starts at 1
  playerExp: number; // 0..(EXP_PER_LEVEL-1), carry handled on award
}

const powersSchema = new Schema<Powers>(
  {
    bomb: { type: Number, default: 0 },
    laser: { type: Number, default: 0 },
    extraShuffle: { type: Number, default: 0 },
  },
  { _id: false },
);

const activeStageRunSchema = new Schema<ActiveStageRun>(
  {
    stageId: { type: String, required: true },
    boosterSnapshot: { type: powersSchema, required: true },
    stageSelectedBoosters: { type: powersSchema, required: true },
  },
  { _id: false },
);

const stageProgressSchema = new Schema<StageProgress>(
  {
    completed: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
    lastCompletedAt: { type: Date },
    usedPower: { type: String, enum: ['bomb', 'laser', 'extraShuffle'] },
  },
  { _id: false },
);

const badgeProgressSchema = new Schema<BadgeProgress>(
  {
    badgeKey: { type: String, required: true },
    achievedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Email is not valid'] },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    avatar: {
      type: String,
      enum: ['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png'],
      default: 'default.png',
    },
    powers: { type: powersSchema, default: () => ({ bomb: 0, laser: 0, extraShuffle: 0 }) },
    totalScore: { type: Number, default: 0, index: true },
    hearts: { type: Number, default: 3, min: 0 },
    progress: { type: Map, of: stageProgressSchema, default: {} },
    badges: { type: [badgeProgressSchema], default: [] },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    gamesLost: { type: Number, default: 0 },
    activeStageRun: { type: activeStageRunSchema },
    lastHeartRefillAt: { type: Date, default: null },

    // Meta progression (SSOT)
    playerLevel: { type: Number, default: 1, min: 1 },
    playerExp: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
