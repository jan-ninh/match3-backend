import { once } from 'node:events';
import mongoose from 'mongoose';
import schedule from 'node-schedule';
import { markStopping } from './readiness.ts';
async function start() {
  try {
    // Dynamic imports place configuration validation inside the sanitized startup boundary.
    const { env } = await import('./utils/env.ts');
    const { app } = await import('./app.ts');
    const { connectDB } = await import('./db.ts');
    const { startHeartRefillScheduler } = await import('./services/heartRefill.service.ts');
    await connectDB();
    const server = app.listen(env.PORT, '0.0.0.0');
    await once(server, 'listening');
    startHeartRefillScheduler();
    console.log('[server] listening on port ' + env.PORT);
    let shutdown: Promise<void> | undefined;
    const stop = () => {
      if (shutdown) return;
      markStopping();
      const deadline = setTimeout(() => {
        console.error('[shutdown] deadline exceeded');
        server.closeAllConnections();
        process.exit(1);
      }, 20000);
      shutdown = (async () => {
        await Promise.all([
          new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
          schedule.gracefulShutdown(),
        ]);
        await mongoose.disconnect();
        clearTimeout(deadline);
        console.log('[shutdown] HTTP and database closed');
      })();
      void shutdown.then(() => process.exit(0), () => {
        console.error('[shutdown] could not close cleanly');
        process.exit(1);
      });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    server.on('error', () => { console.error('[server] HTTP service failed'); stop(); });
  } catch (error) {
    console.error(error instanceof Error && ['ConfigurationError', 'DatabaseReadinessError'].includes(error.name)
      ? '[startup] ' + error.message
      : '[startup] database, indexes or HTTP startup failed; check configuration and availability');
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
void start();
