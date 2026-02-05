import mongoose from 'mongoose';

export async function connectDB() {
  const uri = envOrThrow('MONGO_URI');
  try {
    await mongoose.connect(uri, { dbName: 'Match3DB' });
    console.log('\x1b[35mMongoDB connected via Mongoose\x1b[0m');
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

function envOrThrow(key: string) {
  if (!process.env[key]) throw new Error(`${key} is missing in .env`);
  return process.env[key];
}
