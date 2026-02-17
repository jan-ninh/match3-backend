// src/models/Campaign.model.ts
import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type CampaignOutcome = 'WIN' | 'LOSS';

export type CampaignAttemptKind = 'END' | 'ABORT';

export type AbortReason = 'disconnect' | 'quit' | 'crash' | 'timeout' | 'unknown';

export interface ICampaignRun extends Document {
  accountId: string;
  campaignId: string;
  startedAt: Date;
  metaTier: number;
  metaVersion: number;
  winsCount: number;
  lossesCount: number;
  finishedAt?: Date;
  runId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const campaignRunSchema = new Schema<ICampaignRun>(
  {
    accountId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, unique: true, index: true },

    startedAt: { type: Date, required: true, default: () => new Date() },

    metaTier: { type: Number, required: true, default: 0, min: 0 },
    metaVersion: { type: Number, required: true, default: 1, min: 1 },

    winsCount: { type: Number, required: true, default: 0, min: 0 },
    lossesCount: { type: Number, required: true, default: 0, min: 0 },

    finishedAt: { type: Date },
    runId: { type: String },
  },
  { timestamps: true },
);

campaignRunSchema.index({ accountId: 1, startedAt: -1 });

export const CampaignRun: Model<ICampaignRun> = mongoose.model<ICampaignRun>('CampaignRun', campaignRunSchema);

export interface ICampaignAttempt extends Document {
  accountId: string;
  campaignId: string;
  attemptId: string;
  levelIndex: number; // 1..12
  kind: CampaignAttemptKind;
  outcome: CampaignOutcome; // ABORT counts as LOSS
  abortReason?: AbortReason;

  moveBudget: number;
  movesUsedRaw: number;
  movesCounted: number;
  ratio: number;

  createdAt: Date;
  updatedAt: Date;
}

const attemptSchema = new Schema<ICampaignAttempt>(
  {
    accountId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true },

    levelIndex: { type: Number, required: true, min: 1, max: 12 },

    kind: { type: String, enum: ['END', 'ABORT'], required: true },
    outcome: { type: String, enum: ['WIN', 'LOSS'], required: true },
    abortReason: { type: String, enum: ['disconnect', 'quit', 'crash', 'timeout', 'unknown'] },

    moveBudget: { type: Number, required: true, min: 1 },
    movesUsedRaw: { type: Number, required: true, min: 0 },
    movesCounted: { type: Number, required: true, min: 0 },
    ratio: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

attemptSchema.index({ campaignId: 1, attemptId: 1 }, { unique: true });
attemptSchema.index({ campaignId: 1, createdAt: 1 });

export const CampaignAttempt: Model<ICampaignAttempt> = mongoose.model<ICampaignAttempt>('CampaignAttempt', attemptSchema);
