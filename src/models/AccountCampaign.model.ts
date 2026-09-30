import mongoose, { Schema } from 'mongoose';
export const CAMPAIGN_SCORE_VERSION = 'regular-campaign-points-v1';
export type CampaignResult = {
  runId: string;
  score: number;
  finalizedAt: Date;
  finalizedRevision: number;
  rulesVersion: string;
  catalogVersion: string;
  scoreVersion: string;
  regularStages: 11;
};
export type CampaignStage = { stageNumber: number; attemptId: string; operationId: string; points: number; completedAt: Date };
export type CampaignProjection = {
  runId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'RESET';
  startedAt: Date;
  closedAt?: Date;
  resetReason?: string;
  score: number;
  completedStages: number[];
  result: CampaignResult | null;
};
export interface AccountCampaignRecord {
  runId: string;
  ownerId: mongoose.Types.ObjectId;
  status: 'ACTIVE' | 'COMPLETED' | 'RESET';
  rulesVersion: string;
  catalogVersion: string;
  scoreVersion: string;
  startedAt: Date;
  startedRevision: number;
  updatedRevision: number;
  closedAt?: Date;
  resetReason?: string;
  score: number;
  stages: CampaignStage[];
  result: CampaignResult | null;
  finalOperationId?: string;
  finalAttemptId?: string;
}
const stageSchema = new Schema<CampaignStage>(
  {
    stageNumber: { type: Number, required: true },
    attemptId: { type: String, required: true },
    operationId: { type: String, required: true },
    points: { type: Number, required: true },
    completedAt: { type: Date, required: true },
  },
  { _id: false },
);
const schema = new Schema<AccountCampaignRecord>({
  runId: { type: String, required: true, unique: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'RESET'], required: true },
  rulesVersion: { type: String, required: true },
  catalogVersion: { type: String, required: true },
  scoreVersion: { type: String, required: true },
  startedAt: { type: Date, required: true },
  startedRevision: { type: Number, required: true },
  updatedRevision: { type: Number, required: true },
  closedAt: Date,
  resetReason: String,
  score: { type: Number, required: true },
  stages: { type: [stageSchema], default: [] },
  result: { type: Schema.Types.Mixed, default: null },
  finalOperationId: String,
  finalAttemptId: String,
});
schema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_campaign_per_owner' });
schema.index({ ownerId: 1, startedAt: -1 });
export const AccountCampaignRun = mongoose.model<AccountCampaignRecord>('AccountCampaignRun', schema);
export interface BestCampaignRecord {
  ownerId: mongoose.Types.ObjectId;
  runId: string;
  score: number;
  finalizedAt: Date;
  scoreVersion: string;
  username: string;
  avatar: string;
}
const bestSchema = new Schema<BestCampaignRecord>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  runId: { type: String, required: true },
  score: { type: Number, required: true },
  finalizedAt: { type: Date, required: true },
  scoreVersion: { type: String, required: true },
  username: { type: String, required: true },
  avatar: { type: String, required: true },
});
bestSchema.index({ score: -1, finalizedAt: 1, ownerId: 1 });
export const CampaignBestEntry = mongoose.model<BestCampaignRecord>('CampaignBestEntry', bestSchema);
