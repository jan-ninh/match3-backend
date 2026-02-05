// src/services/badge.service.ts
import { User } from '../models/User.model.ts';
// import { Badge } from '../models/Badge.model.ts';
import mongoose from 'mongoose';

/**
  Badge keys we'll use (examples):
  - first_win
  - two_wins_in_row
  - reach_500_points
  - collect_10_powers_total (example)
  - complete_stage_1 (example)
  - loyal_player (e.g., play 7 different days)
*/

const BADGE_KEYS = {
  FIRST_WIN: 'first_win',
  TWO_WINS: 'two_wins_in_row',
  REACH_500: 'reach_500_points',
  // add more keys as needed
};

export async function awardBadgesIfNeeded(userId: mongoose.Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user) return [];

  const awarded: string[] = [];

  // helper
  const hasBadge = (key: string) => user.badges.some((b) => b.badgeKey === key);

  // 1) first win
  const totalCompleted = Array.from(user.progress.values()).filter((p) => p.completed).length;
  if (totalCompleted >= 1 && !hasBadge(BADGE_KEYS.FIRST_WIN)) {
    user.badges.push({ badgeKey: BADGE_KEYS.FIRST_WIN, achievedAt: new Date() });
    awarded.push(BADGE_KEYS.FIRST_WIN);
  }

  // 2) two wins in a row
  if (!hasBadge(BADGE_KEYS.TWO_WINS)) {
    const keys = Array.from(user.progress.keys()).sort((a, b) => {
      const na = Number(a.replace('stage', ''));
      const nb = Number(b.replace('stage', ''));
      return na - nb;
    });
    for (let i = 0; i < keys.length - 1; i++) {
      const key1 = keys[i];
      const key2 = keys[i + 1];
      if (key1 && key2) {
        const n1 = user.progress.get(key1);
        const n2 = user.progress.get(key2);
        if (n1?.completed && n2?.completed) {
          user.badges.push({ badgeKey: BADGE_KEYS.TWO_WINS, achievedAt: new Date() });
          awarded.push(BADGE_KEYS.TWO_WINS);
          break;
        }
      }
    }
  }

  // 3) reach 500 total points
  if (user.totalScore >= 500 && !hasBadge(BADGE_KEYS.REACH_500)) {
    user.badges.push({ badgeKey: BADGE_KEYS.REACH_500, achievedAt: new Date() });
    awarded.push(BADGE_KEYS.REACH_500);
  }

  if (awarded.length > 0) {
    await user.save();
  }

  return awarded;
}
