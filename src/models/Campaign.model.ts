// src/models/Campaign.model.ts
import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type CampaignOutcome = 'WIN' | 'LOSS';

export type CampaignAbortReason = 'disconnect' | 'quit' | 'crash' | 'timeout' | 'unknown';

export type CampaignAttemptKind = 'END' | 'ABORT';

export interface ICampaignRun extends Document {
  campaignId: string;
  accountId?: string | null;
  platform?: string | null;
  clientVersion?: string | null;
  clientTimestampMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignRunSchema = new Schema<ICampaignRun>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, default: null },
    platform: { type: String, default: null },
    clientVersion: { type: String, default: null },
    clientTimestampMs: { type: Number, default: null },
  },
  { timestamps: true },
);

campaignRunSchema.index({ campaignId: 1 }, { unique: true });

export const CampaignRun: Model<ICampaignRun> = mongoose.model<ICampaignRun>('CampaignRun', campaignRunSchema);

export interface ICampaignAttempt extends Document {
  campaignId: string;
  levelIndex: number;
  attemptId: string;
  kind: CampaignAttemptKind;

  outcome?: CampaignOutcome;
  movesUsedRaw?: number;

  abortReason?: CampaignAbortReason;
  movesUsedAtAbort?: number;

  clientTimestampMs?: number | null;
  clientVersion?: string | null;
  levelConfigHash?: string | null;
  platform?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const campaignAttemptSchema = new Schema<ICampaignAttempt>(
  {
    campaignId: { type: String, required: true, index: true },
    levelIndex: { type: Number, required: true, min: 1, max: 12, index: true },
    attemptId: { type: String, required: true },
    kind: { type: String, required: true, enum: ['END', 'ABORT'] },

    outcome: { type: String, enum: ['WIN', 'LOSS'] },
    movesUsedRaw: { type: Number, min: 0 },

    abortReason: { type: String, enum: ['disconnect', 'quit', 'crash', 'timeout', 'unknown'] },
    movesUsedAtAbort: { type: Number, min: 0 },

    clientTimestampMs: { type: Number, default: null },
    clientVersion: { type: String, default: null },
    levelConfigHash: { type: String, default: null },
    platform: { type: String, default: null },
  },
  { timestamps: true },
);

campaignAttemptSchema.index({ campaignId: 1, attemptId: 1 }, { unique: true });
campaignAttemptSchema.index({ campaignId: 1, levelIndex: 1 });

export const CampaignAttempt: Model<ICampaignAttempt> = mongoose.model<ICampaignAttempt>('CampaignAttempt', campaignAttemptSchema);
