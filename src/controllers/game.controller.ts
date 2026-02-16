// src/controllers/game.controller.ts
import type { RequestHandler } from 'express';
import { User, LeaderboardEntry, type PowerKey } from '#models';
import { refillHearts } from '#services';

const BASE_POINTS = 800;
const REPLAY_POINTS = 400;

export const startStage: RequestHandler = async (req, res, next) => {
  try {
    const { id, stageNumber } = req.params as unknown as { id: string; stageNumber: string };
    const stageNum = parseInt(stageNumber, 10);
    const { stageSelectedBoosters } = req.body as { stageSelectedBoosters?: Record<PowerKey, number> };

    const stageId = `stage${stageNum}`;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (stageNum > 1) {
      const prevStageKey = `stage${stageNum - 1}`;
      const prevProgress = user.progress.get(prevStageKey);
      if (!prevProgress?.completed) {
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    const boosterSnapshot = { ...user.powers };

    const stageBoosters = stageSelectedBoosters || { bomb: 0, laser: 0, extraShuffle: 0 };
    if (stageBoosters.bomb && stageBoosters.bomb > 0) user.powers.bomb += stageBoosters.bomb;
    if (stageBoosters.laser && stageBoosters.laser > 0) user.powers.laser += stageBoosters.laser;
    if (stageBoosters.extraShuffle && stageBoosters.extraShuffle > 0) user.powers.extraShuffle += stageBoosters.extraShuffle;

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

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (stageNum > 1) {
      const prevStageKey = `stage${stageNum - 1}`;
      const prevProgress = user.progress.get(prevStageKey);
      if (!prevProgress?.completed) {
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    const currentProgress = user.progress.get(stageKey) || { completed: false, points: 0 };

    const points = currentProgress.completed ? REPLAY_POINTS : BASE_POINTS;

    if (usedPower && user.powers[usedPower] > 0) {
      user.powers[usedPower]--;
    } else if (usedPower) {
      return res.status(400).json({ error: `No ${usedPower} available` });
    }

    user.progress.set(stageKey, {
      completed: true,
      points,
      lastCompletedAt: new Date(),
      usedPower,
    });

    user.totalScore += points;

    checkAndAwardBadges(user);

    user.gamesPlayed++;
    user.gamesWon++;

    user.activeStageRun = undefined;

    await user.save();

    await LeaderboardEntry.findOneAndUpdate(
      { userId: user._id },
      { username: user.username, totalScore: user.totalScore, gamesWon: user.gamesWon, gamesLost: user.gamesLost },
      { upsert: true },
    );

    // Check if this is the final stage (stage 12) - if not, show power selection screen
    const isFinalStage = stageNum === 12;
    const showPowerSelection = !isFinalStage;

    res.json({
      message: 'Stage completed',
      stage: stageKey,
      points,
      totalScore: user.totalScore,
      powers: user.powers,
      newBadges: user.badges.filter((b) => b.achievedAt > new Date(Date.now() - 1000)),
      showPowerSelection,
      nextStage: !isFinalStage ? `stage${stageNum + 1}` : null,
    });
  } catch (err) {
    next(err);
  }
};

function checkAndAwardBadges(user: any) {
  const badgeKeys = user.badges.map((b: any) => b.badgeKey);

  if (user.totalScore >= 500 && !badgeKeys.includes('first500points')) {
    user.badges.push({ badgeKey: 'first500points', achievedAt: new Date() });
  }

  const completedStages = Array.from(user.progress.values()).filter((p: any) => p.completed);
  if (completedStages.length >= 2 && !badgeKeys.includes('twoWinsInRow')) {
    user.badges.push({ badgeKey: 'twoWinsInRow', achievedAt: new Date() });
  }

  if (completedStages.length >= 5 && !badgeKeys.includes('played5Stages')) {
    user.badges.push({ badgeKey: 'played5Stages', achievedAt: new Date() });
  }

  const usedLaser = Array.from(user.progress.values()).some((p: any) => p.usedPower === 'laser');
  if (usedLaser && !badgeKeys.includes('usedLaser')) {
    user.badges.push({ badgeKey: 'usedLaser', achievedAt: new Date() });
  }

  const stage3 = user.progress.get('stage3');
  if (stage3?.completed && !badgeKeys.includes('wonStage3')) {
    user.badges.push({ badgeKey: 'wonStage3', achievedAt: new Date() });
  }

  if (user.totalScore >= 1000 && !badgeKeys.includes('specialEvent')) {
    user.badges.push({ badgeKey: 'specialEvent', achievedAt: new Date() });
  }
}

export const loseGame: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { hearts: reffilledHearts, lastRefillAt: newLastRefillAt } = refillHearts(user.hearts, user.lastHeartRefillAt || new Date(), 3);
    user.hearts = reffilledHearts;
    user.lastHeartRefillAt = newLastRefillAt;

    if (user.hearts > 0) {
      user.hearts -= 1;
    }

    // Roguelite logic: Reset run progression on loss
    // Clear all powers (collected during current run)
    user.powers = { bomb: 0, laser: 0, extraShuffle: 0 };

    // Reset progress map - only keep stage1 structure for next run
    user.progress.clear();

    // Reset total score (run-specific, not cumulative stats)
    user.totalScore = 0;

    // Clear active stage run
    user.activeStageRun = undefined;

    user.gamesPlayed += 1;
    user.gamesLost += 1;

    await user.save();

    await LeaderboardEntry.findOneAndUpdate({ userId: id }, { username: user.username, gamesWon: user.gamesWon, gamesLost: user.gamesLost }, { upsert: true });

    res.json({
      message: 'Game lost - Roguelite reset: all progress, powers, and score reset to start new run from stage 1',
      hearts: user.hearts,
      powers: user.powers,
      totalScore: user.totalScore,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      restartFrom: 'stage1',
    });
  } catch (err) {
    next(err);
  }
};

export const abandonGame: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { usedPower } = req.body as { usedPower?: PowerKey };

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { hearts: reffilledHearts, lastRefillAt: newLastRefillAt } = refillHearts(user.hearts, user.lastHeartRefillAt || new Date(), 3);
    user.hearts = reffilledHearts;
    user.lastHeartRefillAt = newLastRefillAt;

    if (user.hearts > 0) {
      user.hearts -= 1;
    }

    // Roguelite logic: Reset run progression on abandon (same as lose)
    // Clear all powers (collected during current run)
    user.powers = { bomb: 0, laser: 0, extraShuffle: 0 };

    // Reset progress map - only keep stage1 structure for next run
    user.progress.clear();

    // Reset total score (run-specific, not cumulative stats)
    user.totalScore = 0;

    // Clear active stage run
    user.activeStageRun = undefined;

    user.gamesPlayed += 1;
    user.gamesLost += 1;

    await user.save();

    await LeaderboardEntry.findOneAndUpdate({ userId: id }, { username: user.username, gamesWon: user.gamesWon, gamesLost: user.gamesLost }, { upsert: true });

    res.json({
      message: 'Game abandoned - Roguelite reset: all progress, powers, and score reset to start new run from stage 1',
      hearts: user.hearts,
      powers: user.powers,
      totalScore: user.totalScore,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      restartFrom: 'stage1',
    });
  } catch (err) {
    next(err);
  }
};

export const getStatus: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const maxHearts = 3;
    const { hearts: currentHearts, lastRefillAt: newLastRefillAt } = refillHearts(user.hearts, user.lastHeartRefillAt || new Date(), maxHearts);

    // Update user if hearts were refilled
    if (currentHearts !== user.hearts) {
      user.hearts = currentHearts;
      user.lastHeartRefillAt = newLastRefillAt;
      await user.save();
    }

    // Calculate next refill time
    let nextRefillAt = null;
    if (currentHearts < maxHearts) {
      const refillInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
      nextRefillAt = new Date(newLastRefillAt.getTime() + refillInterval);
    }

    res.json({
      hearts: currentHearts,
      maxHearts,
      nextRefillAt,
    });
  } catch (err) {
    next(err);
  }
};
