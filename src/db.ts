import mongoose from 'mongoose';
import { env } from './utils/env.ts';
import { User } from './models/User.model.ts';
import { RefreshSession } from './models/RefreshSession.model.ts';
import { StageAttempt, OperationReceipt } from './models/Gameplay.model.ts';
import { AccountCampaignRun, CampaignBestEntry } from './models/AccountCampaign.model.ts';
import { markInitialized, markInitializing } from './readiness.ts';
export class DatabaseReadinessError extends Error { override name = 'DatabaseReadinessError'; }
export function supportsTransactions(hello: Record<string, unknown>) {
  return hello.isWritablePrimary === true && hello.readOnly !== true && typeof hello.logicalSessionTimeoutMinutes === 'number' &&
    ((typeof hello.setName === 'string' && Number(hello.maxWireVersion) >= 7) || (hello.msg === 'isdbgrid' && Number(hello.maxWireVersion) >= 8));
}
export async function initializeDatabase() {
  markInitializing();
  const db = mongoose.connection.db;
  if (!db || !supportsTransactions(await db.command({ hello: 1 }, { timeoutMS: 5000 })))
    throw new DatabaseReadinessError('MongoDB transaction-capable replica set or sharded cluster required');
  // Additive index creation only. Never syncIndexes/drop/rebuild historical data.
  for (const model of [User, RefreshSession, StageAttempt, OperationReceipt, AccountCampaignRun, CampaignBestEntry]) {
    await model.createCollection();
    await model.createIndexes({ maxTimeMS: 15000 });
  }
  markInitialized();
}
export async function connectDB() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.DB_NAME, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 15000, bufferCommands: false, autoIndex: false });
  await initializeDatabase();
  console.log('[startup] database and required indexes ready');
}
