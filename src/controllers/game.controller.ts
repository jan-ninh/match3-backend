// src/controllers/game.controller.ts
import type { RequestHandler } from 'express';
import { User } from '../models/User.model.ts';
import { LeaderboardEntry } from '../models/Leaderboard.model.ts';
import type { PowerKey } from '../models/User.model.ts';

const BASE_POINTS = 800; // first time
const REPLAY_POINTS = 400; // subsequent times

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

    // 9. Save user
    await user.save();

    // 10. Update leaderboard
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

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Decrease hearts by 1 (min 0)
    if (user.hearts > 0) {
      user.hearts--;
    }

    await user.save();

    res.json({
      message: 'Game lost, heart decreased',
      hearts: user.hearts,
    });
  } catch (err) {
    next(err);
  }
};

export const abandonGame: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as unknown as { id: string };

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Decrease hearts by 1 (min 0)
    if (user.hearts > 0) {
      user.hearts--;
    }

    await user.save();

    res.json({
      message: 'Game abandoned, heart decreased',
      hearts: user.hearts,
    });
  } catch (err) {
    next(err);
  }
};
