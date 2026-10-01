import mongoose from 'mongoose';
if (process.env.NODE_ENV !== 'test' || !process.env.MONGO_URI?.startsWith('mongodb://127.0.0.1:')) throw Error('Isolated test configuration required');
const { app } = await import('../src/app.ts');
await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
const server = app.listen(0, '127.0.0.1', () => process.stdout.write('TEST_PORT=' + server.address().port + '\n'));
process.stdin.once('data', () =>
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  }),
);
