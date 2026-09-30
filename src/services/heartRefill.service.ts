import schedule from 'node-schedule';
import { User } from '#models';
import { refillHearts } from '#services';

export function startHeartRefillScheduler() {
  // هر 30 دقیقه یکبار بررسی کن
  schedule.scheduleJob('*/30 * * * *', async () => {
    try {
      console.log('[heartRefill] Starting scheduled heart refill check...');
      const users = await User.find({ hearts: { $lt: 3 } });

      let updatedCount = 0;
      for (const user of users) {
        const { hearts: newHearts, lastRefillAt: newLastRefillAt } = refillHearts(user.hearts, user.lastHeartRefillAt || new Date(), 3);

        if (newHearts !== user.hearts) {
          const changed = await User.updateOne(
            { _id: user._id, hearts: user.hearts, lastHeartRefillAt: user.lastHeartRefillAt ?? null },
            { $set: { hearts: newHearts, lastHeartRefillAt: newLastRefillAt }, $inc: { gameplayRevision: 1 } },
          );
          updatedCount += changed.modifiedCount;
        }
      }

      console.log(`[heartRefill] Updated ${updatedCount} users with refilled hearts`);
    } catch (err) {
      console.error('[heartRefill] Scheduler error:', err);
    }
  });
}
