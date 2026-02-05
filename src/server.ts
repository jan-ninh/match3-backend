// src/server.ts
import { app } from './app.ts';
import { env } from './utils/env.ts';
import { connectDB } from './db.ts';

const PORT = env.PORT ?? 3000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] listening on \x1b[34mMain app listening at http://localhost:${PORT}\x1b[0m`);
    });
  } catch (err) {
    console.error('[server] failed to start', err);
    process.exit(1);
  }
}

start();
