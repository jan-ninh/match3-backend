// src/controllers/game.controller.ts
import type { RequestHandler } from 'express';
import { User, LeaderboardEntry, type PowerKey } from '#models';

const BASE_POINTS = 800; // first time
const REPLAY_POINTS = 400; // subsequent times

export const startStage: RequestHandler = async (req, res, next) => {
  try {
    const { id, stageNumber } = req.params as unknown as { id: string; stageNumber: string };
    const stageNum = parseInt(stageNumber, 10);
    const { stageSelectedBoosters } = req.body as { stageSelectedBoosters?: Record<PowerKey, number> };

    const stageId = `stage${stageNum}`;

    // 1. Get user
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. Check if stage is unlocked
    if (stageNum > 1) {
      const prevStageKey = `stage${stageNum - 1}`;
      const prevProgress = user.progress.get(prevStageKey);
      if (!prevProgress?.completed) {
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    // 3. Take snapshot of current boosters
    const boosterSnapshot = { ...user.powers };

    // 4. Validate and add stage-selected boosters
    const stageBoosters = stageSelectedBoosters || { bomb: 0, rocket: 0, extraTime: 0 };
    if (stageBoosters.bomb && stageBoosters.bomb > 0) user.powers.bomb += stageBoosters.bomb;
    if (stageBoosters.rocket && stageBoosters.rocket > 0) user.powers.rocket += stageBoosters.rocket;
    if (stageBoosters.extraTime && stageBoosters.extraTime > 0) user.powers.extraTime += stageBoosters.extraTime;

    // 5. Store active stage run
    user.activeStageRun = {
      stageId,
      boosterSnapshot,
      stageSelectedBoosters: stageBoosters as any,
    };

    await user.save();

    res.json({
      message: 'Stage started',
      stage: stageId,
      boosters: user.powers,
      activeStageRun: user.activeStageRun,
    });
  } catch (err) {
    next(err);
  }
};

export const completeStage: RequestHandler = async (req, res, next) => {
  try {
    const { id, stageNumber } = req.params as unknown as { id: string; stageNumber: string };
    const stageNum = parseInt(stageNumber, 10);
    const { usedPower } = req.body as { usedPower?: PowerKey };

    const stageKey = `stage${stageNum}`;

    // 1. Get user
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. Check if stage is unlocked (stage1 always unlocked, others require previous stage completed)
    if (stageNum > 1) {
      const prevStageKey = `stage${stageNum - 1}`;
      const prevProgress = user.progress.get(prevStageKey);
      if (!prevProgress?.completed) {
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    // 3. Get current stage progress
    const currentProgress = user.progress.get(stageKey) || { completed: false, points: 0 };

    // 4. Calculate points
    const points = currentProgress.completed ? REPLAY_POINTS : BASE_POINTS;

    // 5. Handle power usage
    if (usedPower && user.powers[usedPower] > 0) {
      user.powers[usedPower]--;
    } else if (usedPower) {
      return res.status(400).json({ error: `No ${usedPower} available` });
    }

    // 6. Update progress
    user.progress.set(stageKey, {
      completed: true,
      points,
      lastCompletedAt: new Date(),
      usedPower,
    });

    // 7. Update total score
    user.totalScore += points;

    // 8. Check badges
    checkAndAwardBadges(user);

    // 9. Log game as won
    user.gamesPlayed++;
    user.gamesWon++;

    // 10. Commit: Clear active stage run (WIN = keep boosters as-is)
    user.activeStageRun = undefined;

    // 11. Save user
    await user.save();

    // 12. Update leaderboard
    await LeaderboardEntry.findOneAndUpdate({ userId: user._id }, { username: user.username, totalScore: user.totalScore }, { upsert: true });

    res.json({
      message: 'Stage completed',
      stage: stageKey,
      points,
      totalScore: user.totalScore,
      powers: user.powers,
      newBadges: user.badges.filter((b) => b.achievedAt > new Date(Date.now() - 1000)),
    });
  } catch (err) {
    next(err);
  }
};

function checkAndAwardBadges(user: any) {
  const badgeKeys = user.badges.map((b: any) => b.badgeKey);

  // Badge 1: first 500 points
  if (user.totalScore >= 500 && !badgeKeys.includes('first500points')) {
    user.badges.push({ badgeKey: 'first500points', achievedAt: new Date() });
  }

  // Badge 2: two consecutive wins
  const completedStages = Array.from(user.progress.values()).filter((p: any) => p.completed);
  if (completedStages.length >= 2 && !badgeKeys.includes('twoWinsInRow')) {
    user.badges.push({ badgeKey: 'twoWinsInRow', achievedAt: new Date() });
  }

  // Badge 3: played 5 stages
  if (completedStages.length >= 5 && !badgeKeys.includes('played5Stages')) {
    user.badges.push({ badgeKey: 'played5Stages', achievedAt: new Date() });
  }

  // Badge 4: used Rocket
  const usedRocket = Array.from(user.progress.values()).some((p: any) => p.usedPower === 'rocket');
  if (usedRocket && !badgeKeys.includes('usedRocket')) {
    user.badges.push({ badgeKey: 'usedRocket', achievedAt: new Date() });
  }

  // Badge 5: won stage 3
  const stage3 = user.progress.get('stage3');
  if (stage3?.completed && !badgeKeys.includes('wonStage3')) {
    user.badges.push({ badgeKey: 'wonStage3', achievedAt: new Date() });
  }

  // Badge 6: special event (example: 1000 points)
  if (user.totalScore >= 1000 && !badgeKeys.includes('specialEvent')) {
    user.badges.push({ badgeKey: 'specialEvent', achievedAt: new Date() });
  }
}

export const loseGame: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as unknown as { id: string };
    const { usedPower } = req.body as { usedPower?: PowerKey };

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Decrease hearts by 1 (min 0)
    if (user.hearts > 0) {
      user.hearts--;
    }

    // Handle power usage
    if (usedPower && user.powers[usedPower] > 0) {
      user.powers[usedPower]--;
    } else if (usedPower) {
      return res.status(400).json({ error: `No ${usedPower} available` });
    }

    // Log game loss
    user.gamesPlayed++;
    user.gamesLost++;

    // Rollback: Only remove stage-selected boosters, keep previous booster usage as-is
    if (user.activeStageRun) {
      user.powers.bomb -= user.activeStageRun.stageSelectedBoosters.bomb;
      user.powers.rocket -= user.activeStageRun.stageSelectedBoosters.rocket;
      user.powers.extraTime -= user.activeStageRun.stageSelectedBoosters.extraTime;

      // Ensure no negative values
      user.powers.bomb = Math.max(0, user.powers.bomb);
      user.powers.rocket = Math.max(0, user.powers.rocket);
      user.powers.extraTime = Math.max(0, user.powers.extraTime);

      user.activeStageRun = undefined;
    }

    await user.save();

    res.json({
      message: 'Game lost, heart decreased and stage-selected boosters removed',
      hearts: user.hearts,
      powers: user.powers,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
    });
  } catch (err) {
    next(err);
  }
};

export const abandonGame: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as unknown as { id: string };
    const { usedPower } = req.body as { usedPower?: PowerKey };

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Decrease hearts by 1 (min 0)
    if (user.hearts > 0) {
      user.hearts--;
    }

    // Handle power usage
    if (usedPower && user.powers[usedPower] > 0) {
      user.powers[usedPower]--;
    } else if (usedPower) {
      return res.status(400).json({ error: `No ${usedPower} available` });
    }

    // Log game as abandoned (counts as loss)
    user.gamesPlayed++;
    user.gamesLost++;

    // Rollback: Only remove stage-selected boosters, keep previous booster usage as-is
    if (user.activeStageRun) {
      user.powers.bomb -= user.activeStageRun.stageSelectedBoosters.bomb;
      user.powers.rocket -= user.activeStageRun.stageSelectedBoosters.rocket;
      user.powers.extraTime -= user.activeStageRun.stageSelectedBoosters.extraTime;

      // Ensure no negative values
      user.powers.bomb = Math.max(0, user.powers.bomb);
      user.powers.rocket = Math.max(0, user.powers.rocket);
      user.powers.extraTime = Math.max(0, user.powers.extraTime);

      user.activeStageRun = undefined;
    }

    await user.save();

    res.json({
      message: 'Game abandoned, heart decreased and stage-selected boosters removed',
      hearts: user.hearts,
      powers: user.powers,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
    });
  } catch (err) {
    next(err);
  }
};
