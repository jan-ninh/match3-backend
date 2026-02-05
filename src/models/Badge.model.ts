// src/models/Badge.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBadge extends Document {
  key: string; // e.g. first_win, two_wins
  title: string;
  description: string;
  icon?: string;
}

const badgeSchema = new Schema<IBadge>({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String },
});

export const Badge: Model<IBadge> = mongoose.model<IBadge>('Badge', badgeSchema);
