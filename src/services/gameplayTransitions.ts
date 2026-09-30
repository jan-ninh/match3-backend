import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { User } from '../models/User.model.ts';
import type { IUser, AccountActiveAttempt, Powers } from '../models/User.model.ts';
import { LeaderboardEntry } from '../models/Leaderboard.model.ts';
import { StageAttempt, OperationReceipt } from '../models/Gameplay.model.ts';
import type { GameplayReceipt, Usage } from '../models/Gameplay.model.ts';
import { currentUser } from './currentUser.ts';
import {
  RULES_VERSION,
  CAMPAIGN_VERSION,
  SCENARIOS,
  ACCOUNT_RUN_START_POWERS,
  POWER_KEYS,
  frontier,
  EXP_PER_WIN,
  EXP_PER_LEVEL,
  awardBadges,
} from './gameplayRules.ts';
import { refillHearts } from './heart.service.ts';
import { env } from '../utils/env.ts';
import { HttpError } from '../utils/httpError.ts';
import type { StartCommand, TerminalCommand, RewardCommand } from '../schemas/gameplay.schemas.ts';
type Input =
  | { kind: 'START'; body: StartCommand }
  | { kind: 'TERMINAL'; body: TerminalCommand }
  | { kind: 'REWARD'; body: RewardCommand }
  | { kind: 'LEGACY_ABANDON'; body: { operationId: string; expectedRevision: number } };
export function receiptDTO(r: GameplayReceipt) {
  return {
    operationId: r.operationId,
    command: r.command,
    attemptId: r.attemptId,
    status: r.status,
    createdAt: r.createdAt,
    committedAt: r.committedAt,
    resultingRevision: r.resultingRevision,
    resultSnapshot: r.resultSnapshot,
  };
}
const safeJSON = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
function resetRun(user: IUser) {
  user.powers = { ...ACCOUNT_RUN_START_POWERS };
  user.totalScore = 0;
  user.progress.clear();
  user.progress.set('stage1', { completed: false, points: 0 });
  user.activeStageRun = undefined;
  user.activeAttempt = undefined;
  user.pendingRewards = [];
  user.gameplayRunId = randomUUID();
}
function lose(user: IUser) {
  const refill = refillHearts(user.hearts, user.lastHeartRefillAt ?? new Date(), 3);
  user.hearts = Math.max(0, refill.hearts - 1);
  user.lastHeartRefillAt = refill.lastRefillAt;
  resetRun(user);
  user.gamesPlayed++;
  user.gamesLost++;
}
function validUsage(usage: Usage[], initial: Powers, stage: number) {
  const ids = new Set<number>(),
    counts: Powers = { bomb: 0, laser: 0, extraShuffle: 0 };
  for (const event of usage) {
    if (ids.has(event.id)) throw new HttpError(400, 'Duplicate usage event');
    ids.add(event.id);
    counts[event.power]++;
  }
  const infinite = SCENARIOS[stage - 1] === 'laserrow-match4-training';
  for (const key of POWER_KEYS) if (!infinite && counts[key] > initial[key]) throw new HttpError(400, 'Usage exceeds acknowledged inventory');
  return { counts, infinite };
}
export async function executeGameplay(ownerId: string, input: Input) {
  // Normalize observations before hashing, so order-only changes are identical replays.
  if (input.kind === 'TERMINAL') input = { ...input, body: { ...input.body, usage: [...input.body.usage].sort((a, b) => a.id - b.id) } };
  const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const operationId = input.body.operationId;
  // Do not serve writes before the uniqueness indexes establishing these invariants are ready.
  await StageAttempt.init();
  await OperationReceipt.init();
  await LeaderboardEntry.init();
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        const previous = await OperationReceipt.findOne({ operationId }).session(session);
        const user = await User.findById(ownerId).session(session);
        if (!user) throw new HttpError(401, 'Account unavailable');
        if (previous) {
          if (String(previous.ownerId) !== ownerId) throw new HttpError(404, 'Operation not found');
          if (previous.payloadHash !== payloadHash) throw new HttpError(409, 'Operation payload conflicts with receipt');
          return { receipt: receiptDTO(previous), snapshot: currentUser(user) };
        }
        const revision = user.gameplayRevision ?? 0;
        if ((input.kind !== 'TERMINAL' && revision !== input.body.expectedRevision) || input.body.expectedRevision > revision)
          throw new HttpError(409, 'Account revision changed; reconcile first');
        const now = new Date();
        let attemptId: string;
        if (input.kind === 'START') {
          const { stageNumber } = input.body;
          if (user.activeAttempt) throw new HttpError(409, 'An account attempt is already active; abandon it explicitly');
          if (user.activeStageRun) throw new HttpError(409, 'An interrupted legacy stage must be abandoned explicitly');
          const devSkip = env.NODE_ENV === 'development' && process.env.ALLOW_STAGE_SKIP === '1';
          if (!devSkip && stageNumber !== frontier(user.progress)) throw new HttpError(403, 'Stage is not currently playable');
          // Development may select a stage, but never fabricates predecessor completion.
          user.gameplayRunId ||= randomUUID();
          if (stageNumber === 1) user.powers = { ...ACCOUNT_RUN_START_POWERS };
          for (const key of POWER_KEYS)
            if (!Number.isSafeInteger(user.powers[key]) || user.powers[key] < 0) throw new HttpError(409, 'Invalid account inventory');
          attemptId = randomUUID();
          const binding: AccountActiveAttempt = {
            attemptId,
            runId: user.gameplayRunId,
            stageNumber,
            scenarioVersion: CAMPAIGN_VERSION + ':' + SCENARIOS[stageNumber - 1],
            startedAt: now,
            startedRevision: revision + 1,
            startOperationId: operationId,
            initialPowers: { ...user.powers },
          };
          user.activeAttempt = binding;
          await StageAttempt.create([{ ...binding, ownerId: user._id, rulesVersion: RULES_VERSION, status: 'active', usage: [], rewardEligible: false }], {
            session,
          });
        } else if (input.kind === 'LEGACY_ABANDON') {
          if (user.activeAttempt || !user.activeStageRun) throw new HttpError(409, 'No interrupted legacy stage');
          const stage = Number(user.activeStageRun.stageId.replace('stage', ''));
          if (!Number.isInteger(stage) || stage < 1 || stage > 12) throw new HttpError(409, 'Legacy stage requires manual data repair');
          attemptId = randomUUID();
          const runId = user.gameplayRunId ?? randomUUID();
          await StageAttempt.create(
            [
              {
                attemptId,
                ownerId: user._id,
                runId,
                stageNumber: stage,
                scenarioVersion: 'legacy-unversioned',
                rulesVersion: RULES_VERSION,
                startedAt: now,
                startedRevision: revision,
                initialPowers: { ...user.powers },
                startOperationId: operationId,
                status: 'ABANDON',
                terminalAt: now,
                terminalRevision: revision + 1,
                terminalOperationId: operationId,
                usage: [],
                rewardEligible: false,
              },
            ],
            { session },
          );
          lose(user);
        } else {
          attemptId = input.body.attemptId;
          const attempt = await StageAttempt.findOne({ attemptId, ownerId }).session(session);
          if (!attempt) throw new HttpError(404, 'Attempt not found');
          if (input.kind === 'REWARD') {
            const entitlement = user.pendingRewards.find((r) => r.attemptId === attemptId && r.runId === attempt.runId);
            if (user.activeAttempt) throw new HttpError(409, 'Finish or abandon active attempt before claiming reward');
            if (attempt.status !== 'WIN' || !attempt.rewardEligible || attempt.rewardClaimOperationId || !entitlement)
              throw new HttpError(409, 'Reward not available');
            user.powers[input.body.power] += entitlement.quantity;
            user.pendingRewards = user.pendingRewards.filter((r) => r.attemptId !== attemptId);
            attempt.rewardClaimOperationId = operationId;
            await attempt.save({ session });
          } else {
            if (attempt.status !== 'active' || user.activeAttempt?.attemptId !== attemptId || user.gameplayRunId !== attempt.runId)
              throw new HttpError(409, 'Attempt already terminal or no longer active');
            if (attempt.rulesVersion !== RULES_VERSION) throw new HttpError(409, 'Attempt rules version changed');
            if (input.body.expectedRevision < attempt.startedRevision) throw new HttpError(409, 'Revision predates attempt');
            const { counts, infinite } = validUsage(input.body.usage, attempt.initialPowers, attempt.stageNumber);
            // No competing inventory writer may alter a live attempt's baseline.
            for (const key of POWER_KEYS) {
              if (user.powers[key] !== attempt.initialPowers[key]) throw new HttpError(409, 'Attempt inventory baseline changed');
              if (!infinite) user.powers[key] -= counts[key];
            }
            const outcome = input.body.outcome;
            if (outcome === 'WIN') {
              const stageKey = 'stage' + attempt.stageNumber,
                old = user.progress.get(stageKey);
              const points = old?.completed ? 400 : 800;
              const usedPower = input.body.usage.at(-1)?.power;
              user.progress.set(stageKey, { completed: true, points, lastCompletedAt: now, ...(usedPower ? { usedPower } : {}) });
              if (attempt.stageNumber < 12 && !user.progress.has('stage' + (attempt.stageNumber + 1)))
                user.progress.set('stage' + (attempt.stageNumber + 1), { completed: false, points: 0 });
              user.totalScore += points;
              const oldLevel = user.playerLevel;
              const exp = user.playerExp + EXP_PER_WIN;
              user.playerLevel += Math.floor(exp / EXP_PER_LEVEL);
              user.playerExp = exp % EXP_PER_LEVEL;
              if (user.playerLevel > oldLevel) {
                attempt.rewardEligible = true;
                user.pendingRewards.push({ attemptId, runId: attempt.runId, quantity: 2 });
              }
              awardBadges(user);
              user.gamesPlayed++;
              user.gamesWon++;
              user.activeAttempt = undefined;
              user.activeStageRun = undefined;
            } else lose(user);
            attempt.status = outcome;
            attempt.terminalAt = now;
            attempt.terminalRevision = revision + 1;
            attempt.terminalOperationId = operationId;
            attempt.usage = input.body.usage;
            await attempt.save({ session });
          }
        }
        user.gameplayRevision = revision + 1;
        await user.save({ session });
        if (input.kind === 'TERMINAL' || input.kind === 'LEGACY_ABANDON')
          await LeaderboardEntry.findOneAndUpdate(
            { userId: user._id },
            { username: user.username, totalScore: user.totalScore, gamesWon: user.gamesWon, gamesLost: user.gamesLost },
            { upsert: true, session },
          );
        const resultSnapshot = safeJSON(currentUser(user));
        const [receipt] = await OperationReceipt.create(
          [
            {
              operationId,
              ownerId: user._id,
              command: input.kind,
              attemptId,
              payloadHash,
              status: 'committed',
              createdAt: now,
              committedAt: now,
              resultingRevision: user.gameplayRevision,
              resultSnapshot,
            },
          ],
          { session },
        );
        return { receipt: receiptDTO(receipt!), snapshot: currentUser(user) };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000, timeoutMS: 10000 },
    );
    if (!result) throw new HttpError(503, 'Gameplay commit could not be confirmed');
    return result;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      // Concurrent same-ID requests can lose a unique-index race after the winner commits.
      const existing = await OperationReceipt.findOne({ operationId });
      if (existing && String(existing.ownerId) === ownerId && existing.payloadHash === payloadHash) {
        const user = await User.findById(ownerId);
        if (user) return { receipt: receiptDTO(existing), snapshot: currentUser(user) };
      }
      throw new HttpError(409, 'Conflicting gameplay operation; reconcile first');
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 20)
      throw new HttpError(503, 'Gameplay transactions require a MongoDB replica set');
    throw error;
  } finally {
    await session.endSession();
  }
}
export async function readOperation(ownerId: string, operationId: string) {
  const receipt = await OperationReceipt.findOne({ operationId, ownerId }).readConcern('majority');
  if (!receipt && (await OperationReceipt.exists({ operationId }))) throw new HttpError(404, 'Operation not found');
  const user = await User.findById(ownerId).readConcern('majority');
  if (!user) throw new HttpError(401, 'Account unavailable');
  return receipt
    ? { status: 'committed' as const, receipt: receiptDTO(receipt), snapshot: currentUser(user) }
    : { status: 'not-found' as const, safeToRetry: true, snapshot: currentUser(user) };
}
