import { frontier, RULES_VERSION, CAMPAIGN_VERSION } from './gameplayRules.ts';
import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../models/User.model.ts';
export function currentUser(user: HydratedDocument<IUser>) {
  return {
    id: String(user._id),
    revision: user.gameplayRevision ?? 0,
    rulesVersion: RULES_VERSION,
    campaignVersion: CAMPAIGN_VERSION,
    runId: user.gameplayRunId ?? null,
    frontier: frontier(user.progress),
    campaign: user.campaign ?? null,
    sandboxUnlocked: user.campaign?.status === 'COMPLETED' && user.campaign.runId === user.gameplayRunId,
    campaignNeedsReset: !user.campaign && frontier(user.progress) > 1,
    activeAttempt: user.activeAttempt ?? null,
    pendingRewards: user.pendingRewards ?? [],
    legacyInterrupted: !!user.activeStageRun && !user.activeAttempt,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    powers: { bomb: user.powers.bomb, laser: user.powers.laser, extraShuffle: user.powers.extraShuffle },
    hearts: user.hearts,
    totalScore: user.totalScore,
    progress: Object.fromEntries(user.progress),
    badges: user.badges,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesLost: user.gamesLost,
    playerLevel: Math.max(1, Math.floor(user.playerLevel || 1)),
    playerExp: Math.max(0, Math.floor(user.playerExp || 0)),
    activeStageRun: user.activeStageRun ?? null,
  };
}
