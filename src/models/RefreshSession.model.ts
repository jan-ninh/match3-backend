import mongoose, { Schema } from 'mongoose';
export interface IRefreshSession {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  usedTokenHashes: string[];
  createdAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  revokedAt: Date | null;
}
const schema = new Schema<IRefreshSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  usedTokenHashes: { type: [String], default: [], index: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  rotatedAt: Date,
  revokedAt: { type: Date, default: null },
});
// Retain consumed digests until the family's absolute expiry for replay detection.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSession = mongoose.model<IRefreshSession>('RefreshSession', schema);
