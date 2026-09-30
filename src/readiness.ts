import mongoose from 'mongoose';
let initialized = false;
let stopping = false;
export function markInitializing() { initialized = false; }
export function markInitialized() { initialized = true; }
export function markStopping() { stopping = true; }
export async function isReady() {
  if (!initialized || stopping || mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 1500 });
    return mongoose.connection.readyState === 1 && !stopping;
  } catch { return false; }
}
