import mongoose, { Schema } from 'mongoose';
import type { Powers, PowerKey } from './User.model.ts';
export type Usage = { id: number; power: PowerKey };
export interface GameplayAttempt {
  attemptId: string;
  ownerId: mongoose.Types.ObjectId;
  runId: string;
  stageNumber: number;
  scenarioVersion: string;
  rulesVersion: string;
  startedAt: Date;
  startedRevision: number;
  initialPowers: Powers;
  startOperationId: string;
  status: 'active' | 'WIN' | 'LOSS' | 'ABANDON';
  terminalAt?: Date;
  terminalRevision?: number;
  terminalOperationId?: string;
  usage: Usage[];
  rewardEligible: boolean;
  rewardClaimOperationId?: string;
}
const usageSchema = new Schema<Usage>(
  { id: { type: Number, required: true }, power: { type: String, enum: ['bomb', 'laser', 'extraShuffle'], required: true } },
  { _id: false },
);
const attemptSchema = new Schema<GameplayAttempt>({
  attemptId: { type: String, required: true, unique: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  runId: { type: String, required: true },
  stageNumber: { type: Number, required: true },
  scenarioVersion: { type: String, required: true },
  rulesVersion: { type: String, required: true },
  startedAt: { type: Date, required: true },
  startedRevision: { type: Number, required: true },
  initialPowers: { type: Schema.Types.Mixed, required: true },
  startOperationId: { type: String, required: true },
  status: { type: String, enum: ['active', 'WIN', 'LOSS', 'ABANDON'], required: true },
  terminalAt: Date,
  terminalRevision: Number,
  terminalOperationId: String,
  usage: { type: [usageSchema], default: [] },
  rewardEligible: { type: Boolean, default: false },
  rewardClaimOperationId: String,
});
attemptSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_attempt_per_owner' });
attemptSchema.index({ ownerId: 1, runId: 1, startedAt: -1 });
export const StageAttempt = mongoose.model<GameplayAttempt>('GameplayAttempt', attemptSchema);
export interface GameplayReceipt {
  operationId: string;
  ownerId: mongoose.Types.ObjectId;
  command: 'START' | 'TERMINAL' | 'REWARD' | 'LEGACY_ABANDON';
  attemptId: string;
  payloadHash: string;
  status: 'committed';
  createdAt: Date;
  committedAt: Date;
  resultingRevision: number;
  resultSnapshot: Record<string, unknown>;
}
const receiptSchema = new Schema<GameplayReceipt>({
  operationId: { type: String, required: true, unique: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  command: { type: String, enum: ['START', 'TERMINAL', 'REWARD', 'LEGACY_ABANDON'], required: true },
  attemptId: { type: String, required: true },
  payloadHash: { type: String, required: true },
  status: { type: String, enum: ['committed'], required: true },
  createdAt: { type: Date, required: true },
  committedAt: { type: Date, required: true },
  resultingRevision: { type: Number, required: true },
  resultSnapshot: { type: Schema.Types.Mixed, required: true },
});
receiptSchema.index({ ownerId: 1, createdAt: -1 });
// No TTL: deleting receipts would reopen old operation IDs. Retained for account lifetime in this scope.
export const OperationReceipt = mongoose.model<GameplayReceipt>('GameplayOperationReceipt', receiptSchema);
