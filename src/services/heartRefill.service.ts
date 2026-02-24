import schedule from 'node-schedule';
import { User } from '#models';
import { refillHearts } from '#services';

export function startHeartRefillScheduler() {
  schedule.scheduleJob('*/30 * * * *', async () => {
    try {
      console.log('[heartRefill] Starting scheduled heart refill check...');
      const users = await User.find({ hearts: { $lt: 3 } });

      let updatedCount = 0;
      for (const user of users) {
        const { hearts: newHearts, lastRefillAt: newLastRefillAt } = refillHearts(user.hearts, user.lastHeartRefillAt || new Date(), 3);

        if (newHearts !== user.hearts) {
          user.hearts = newHearts;
          user.lastHeartRefillAt = newLastRefillAt;
          await user.save();
          updatedCount++;
        }
      }

      console.log(`[heartRefill] Updated ${updatedCount} users with refilled hearts`);
    } catch (err) {
      console.error('[heartRefill] Scheduler error:', err);
    }
  });
}
