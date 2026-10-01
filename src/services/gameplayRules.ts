import type { IUser, Powers } from '../models/User.model.ts';
export const RULES_VERSION = 'account-gameplay-v1';
export const CAMPAIGN_VERSION = 'stage-catalog-2026-09-29-v1';
export const SCENARIOS = [
  'clean-room',
  'breach-protocol',
  'tiberium-run',
  'signal-breach',
  'match-rush',
  'laserrow-match4-training',
  'patch-the-hole',
  'false-identity',
  'stone-tiles-intro',
  'firewall-sweep-bossroom',
  'enemy-turn-trace',
  'sandbox',
] as const;
// Preserve the active backend account baseline; Guest defaults remain independently 1/1/2.
export const ACCOUNT_RUN_START_POWERS: Powers = { bomb: 120, laser: 120, extraShuffle: 120 };
export const POWER_KEYS = ['bomb', 'laser', 'extraShuffle'] as const;
export const EXP_PER_WIN = 1000,
  EXP_PER_LEVEL = 3000;
export function frontier(progress: IUser['progress']) {
  // A gap never grants access to a later stage, even in legacy/noncontiguous data.
  for (let n = 1; n <= 12; n++) if (!progress.get('stage' + n)?.completed) return n;
  return 12;
}
export function awardBadges(user: IUser) {
  const has = (key: string) => user.badges.some((b) => b.badgeKey === key);
  const add = (key: string, test: boolean) => {
    if (test && !has(key)) user.badges.push({ badgeKey: key, achievedAt: new Date() });
  };
  const completed = [...user.progress.values()].filter((p) => p.completed);
  add('first500points', user.totalScore >= 500);
  add('twoWinsInRow', completed.length >= 2);
  add('played5Stages', completed.length >= 5);
  add(
    'usedLaser',
    [...user.progress.values()].some((p) => p.usedPower === 'laser'),
  );
  add('wonStage3', !!user.progress.get('stage3')?.completed);
  add('specialEvent', user.totalScore >= 1000);
}
