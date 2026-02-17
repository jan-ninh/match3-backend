// src/controllers/game.controller.ts
import type { RequestHandler } from 'express';
import { User, LeaderboardEntry, type PowerKey } from '#models';
import { refillHearts } from '#services';

const BASE_POINTS = 800;
const REPLAY_POINTS = 400;
const RUN_START_POWERS = { bomb: 120, laser: 120, extraShuffle: 120 } as const; // 1,1,2
const STAGE1_RESET_PROGRESS = { completed: false, points: 0 } as const;
const FINAL_STAGE = 12;

function parseStageNumberFromKey(key: string): number | null {
  if (!key.startsWith('stage')) return null;
  const n = Number.parseInt(key.slice(5), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getAllowedStageFromProgress(progress: Map<string, { completed: boolean }>): number {
  let highestCompleted = 0;

  for (const [key, value] of progress.entries()) {
    if (!value?.completed) continue;
    const n = parseStageNumberFromKey(key);
    if (n === null) continue;
    if (n > highestCompleted) highestCompleted = n;
  }

  if (highestCompleted >= FINAL_STAGE) return FINAL_STAGE;
  return highestCompleted + 1;
}

function resetRunStateToStage1(user: {
  powers: { bomb: number; laser: number; extraShuffle: number };
  progress: Map<string, { completed: boolean; points: number; lastCompletedAt?: Date; usedPower?: PowerKey }>;
  totalScore: number;
  activeStageRun?: unknown;
}) {
  user.powers = { ...RUN_START_POWERS };
  user.progress.clear();
  user.progress.set('stage1', { ...STAGE1_RESET_PROGRESS });
  user.totalScore = 0;
  user.activeStageRun = undefined;
}

export const startStage: RequestHandler = async (req, res, next) => {
  try {
    const { id, stageNumber } = req.params as unknown as { id: string; stageNumber: string };
    const stageNum = parseInt(stageNumber, 10);
    const { stageSelectedBoosters } = req.body as { stageSelectedBoosters?: Record<PowerKey, number> };

    const stageId = `stage${stageNum}`;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Only the user's current frontier stage can be played.
    // Disallow both previous stages and not-yet-unlocked future stages.
    const allowedStage = getAllowedStageFromProgress(user.progress);
    if (stageNum !== allowedStage) {
      return res.status(403).json({
        error: 'Stage is not currently playable',
        allowedStage,
      });
    }

    if (stageNum > 1) {
      const prevStageKey = `stage${stageNum - 1}`;
      const prevProgress = user.progress.get(prevStageKey);
      if (!prevProgress?.completed) {
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    // Hard rule:
    // Whenever stage 1 starts (under any condition), powers must reset to RUN_START_POWERS.
    if (stageNum === 1) {
      const stageBoosters = { bomb: 0, laser: 0, extraShuffle: 0 };

      user.powers = { ...RUN_START_POWERS };
      user.activeStageRun = {
        stageId,
        boosterSnapshot: { ...RUN_START_POWERS },
        stageSelectedBoosters: stageBoosters as any,
      };

      await user.save();

      return res.json({
        message: 'Stage started',
        stage: stageId,
        boosters: user.powers,
        activeStageRun: user.activeStageRun,
      });
    }

    // Idempotency guard:
    // If the same stage is already active, do not re-apply reset/boosters.
    if (user.activeStageRun?.stageId === stageId) {
      return res.json({
        message: 'Stage already active',
        stage: stageId,
        boosters: user.powers,
        activeStageRun: user.activeStageRun,
      });
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

    // Best-effort consume:
    // Do not block progression if frontend sends a stale/invalid usedPower signal.
    if (usedPower && user.powers[usedPower] > 0) {
      user.powers[usedPower]--;
    }

    user.progress.set(stageKey, {
      completed: true,
      points,
      lastCompletedAt: new Date(),
      usedPower,
    });

    // Materialize next stage row in progress table for clear backend state.
    // This ensures stage2 (after winning stage1), etc. exists explicitly in DB.
    const isFinalStage = stageNum >= FINAL_STAGE;
    if (!isFinalStage) {
      const nextStageKey = `stage${stageNum + 1}`;
      const existingNext = user.progress.get(nextStageKey);
      if (!existingNext) {
        user.progress.set(nextStageKey, { completed: false, points: 0 });
      }
    }

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
    const isFinalStageResponse = stageNum === FINAL_STAGE;
    const showPowerSelection = !isFinalStageResponse;

    res.json({
      message: 'Stage completed',
      stage: stageKey,
      points,
      totalScore: user.totalScore,
      powers: user.powers,
      newBadges: user.badges.filter((b) => b.achievedAt > new Date(Date.now() - 1000)),
      showPowerSelection,
      nextStage: !isFinalStageResponse ? `stage${stageNum + 1}` : null,
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

    // Roguelite reset: keep only stage1 (reset), remove every other stage record.
    resetRunStateToStage1(user);

    user.gamesPlayed += 1;
    user.gamesLost += 1;

    await user.save();

    await LeaderboardEntry.findOneAndUpdate(
      { userId: user._id },
      { username: user.username, totalScore: user.totalScore, gamesWon: user.gamesWon, gamesLost: user.gamesLost },
      { upsert: true },
    );

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

    // Roguelite reset: keep only stage1 (reset), remove every other stage record.
    resetRunStateToStage1(user);

    user.gamesPlayed += 1;
    user.gamesLost += 1;

    await user.save();

    await LeaderboardEntry.findOneAndUpdate(
      { userId: user._id },
      { username: user.username, totalScore: user.totalScore, gamesWon: user.gamesWon, gamesLost: user.gamesLost },
      { upsert: true },
    );

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

    const allowedStage = getAllowedStageFromProgress(user.progress);

    res.json({
      hearts: currentHearts,
      maxHearts,
      powers: user.powers,
      allowedStage,
      nextRefillAt,
    });
  } catch (err) {
    next(err);
  }
};
