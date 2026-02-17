// src/services/campaignRanking.ts
import crypto from 'node:crypto';

export type Outcome = 'WIN' | 'LOSS';

export type AbortReason = 'disconnect' | 'quit' | 'crash' | 'timeout' | 'unknown';

export const CAMPAIGN_META_VERSION = 1;

export const LOSS_MIN_FRACTION = 0.8;

export const DISPLAY_SCORE = {
  MAX_SCORE: 10_000,
  LEVEL_STEP: 500,
  META_STEP: 30,
  MOVES_STEP: 200,
} as const;

// NOTE: server-side budgets (SSOT). Adjust to match your level design.
const MOVE_BUDGET_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 20,
  2: 20,
  3: 20,
  4: 20,
  5: 20,
  6: 20,
  7: 20,
  8: 20,
  9: 20,
  10: 20,
  11: 20,
  12: 20,
};

export function getMoveBudget(levelIndex: number): number {
  return MOVE_BUDGET_BY_LEVEL[levelIndex] ?? 20;
}

export function normalizeMovesUsedRaw(movesUsedRaw: number): number {
  if (!Number.isFinite(movesUsedRaw)) return 0;
  if (movesUsedRaw < 0) return 0;
  // Keep as int (frontend sends int, but don't trust it)
  return Math.floor(movesUsedRaw);
}

export function computeMovesCounted(outcome: Outcome, movesUsedRaw: number, moveBudget: number): number {
  const raw = normalizeMovesUsedRaw(movesUsedRaw);

  if (outcome === 'LOSS') {
    const minLoss = Math.ceil(LOSS_MIN_FRACTION * moveBudget);
    return Math.max(raw, minLoss);
  }

  return raw;
}

export function computeRatio(movesCounted: number, moveBudget: number): number {
  if (moveBudget <= 0) return 1;
  return movesCounted / moveBudget;
}

export type RankKey = Readonly<{
  totalLevelsPlayed: number;
  metaTier: number;
  movesMetric: number; // int (avgRatio * 1_000_000)
  finishedAtMs: number; // epoch ms
  runId: string;
}>;

export function makeRankKey(args: {
  totalLevelsPlayed: number;
  metaTier: number;
  avgRatio: number;
  finishedAt: Date;
  runId: string;
}): RankKey {
  const movesMetric = Math.round(args.avgRatio * 1_000_000);

  return {
    totalLevelsPlayed: args.totalLevelsPlayed,
    metaTier: args.metaTier,
    movesMetric,
    finishedAtMs: args.finishedAt.getTime(),
    runId: args.runId,
  };
}

/**
 * Lexicographic compare, smaller is better.
 * Returns -1 if a is better, 0 if equal, 1 if worse.
 */
export function compareRankKey(a: RankKey, b: RankKey): -1 | 0 | 1 {
  if (a.totalLevelsPlayed !== b.totalLevelsPlayed) return a.totalLevelsPlayed < b.totalLevelsPlayed ? -1 : 1;
  if (a.metaTier !== b.metaTier) return a.metaTier < b.metaTier ? -1 : 1;
  if (a.movesMetric !== b.movesMetric) return a.movesMetric < b.movesMetric ? -1 : 1;
  if (a.finishedAtMs !== b.finishedAtMs) return a.finishedAtMs < b.finishedAtMs ? -1 : 1;
  if (a.runId !== b.runId) return a.runId < b.runId ? -1 : 1;
  return 0;
}

export type DisplayScoreBreakdown = Readonly<{
  displayScore: number;
  levelPenalty: number;
  metaPenalty: number;
  movesPenalty: number;
}>;

export function computeDisplayScore(args: { totalLevelsPlayed: number; metaTier: number; avgRatio: number }): DisplayScoreBreakdown {
  const extraLevels = Math.max(0, args.totalLevelsPlayed - 12);

  const levelPenalty = extraLevels * DISPLAY_SCORE.LEVEL_STEP;
  const metaPenalty = args.metaTier * DISPLAY_SCORE.META_STEP;
  const movesPenalty = Math.round(args.avgRatio * DISPLAY_SCORE.MOVES_STEP);

  const raw = DISPLAY_SCORE.MAX_SCORE - levelPenalty - metaPenalty - movesPenalty;
  const displayScore = Math.max(0, Math.min(DISPLAY_SCORE.MAX_SCORE, raw));

  return { displayScore, levelPenalty, metaPenalty, movesPenalty };
}

export function newCampaignId(): string {
  return crypto.randomUUID();
}

export function newRunId(): string {
  return crypto.randomUUID();
}
