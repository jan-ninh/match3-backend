// src/models/User.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export type PowerKey = 'bomb' | 'rocket' | 'extraTime';

interface Powers {
  bomb: number;
  rocket: number;
  extraTime: number;
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

export interface IUser extends Document {
  email: string;
  username: string;
  password: string;
  avatar: 'default.png' | 'avatar1.png' | 'avatar2.png' | 'avatar3.png';
  powers: Powers;
  totalScore: number;
  hearts: number;
  progress: Map<string, StageProgress>; // stage1, stage2, ..., stage12
  badges: BadgeProgress[];
  createdAt: Date;
  updatedAt: Date;
}

const powersSchema = new Schema<Powers>(
  {
    bomb: { type: Number, default: 0 },
    rocket: { type: Number, default: 0 },
    extraTime: { type: Number, default: 0 },
  },
  { _id: false },
);

const stageProgressSchema = new Schema<StageProgress>(
  {
    completed: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
    lastCompletedAt: { type: Date },
    usedPower: { type: String, enum: ['bomb', 'rocket', 'extraTime'] },
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
    password: { type: String, required: true },
    avatar: { type: String, enum: ['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png'], default: 'default.png' },
    powers: { type: powersSchema, default: () => ({ bomb: 0, rocket: 0, extraTime: 0 }) },
    totalScore: { type: Number, default: 0, index: true },
    hearts: { type: Number, default: 3, min: 0 },
    progress: { type: Map, of: stageProgressSchema, default: {} },
    badges: { type: [badgeProgressSchema], default: [] },
  },
  { timestamps: true },
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
