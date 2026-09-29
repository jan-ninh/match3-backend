import mongoose from 'mongoose';
import { env } from './utils/env.ts';
export async function connectDB() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.DB_NAME, serverSelectionTimeoutMS: 5000, bufferCommands: false });
  console.log('MongoDB connected');
}
