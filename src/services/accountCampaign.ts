import type { ClientSession, HydratedDocument } from 'mongoose';
import { AccountCampaignRun, CampaignBestEntry, CAMPAIGN_SCORE_VERSION } from '../models/AccountCampaign.model.ts';
import type { AccountCampaignRecord, CampaignResult } from '../models/AccountCampaign.model.ts';
import type { IUser } from '../models/User.model.ts';
import type { GameplayAttempt } from '../models/Gameplay.model.ts';
import { RULES_VERSION, CAMPAIGN_VERSION } from './gameplayRules.ts';
import { HttpError } from '../utils/httpError.ts';
export function projectCampaign(run: AccountCampaignRecord) {
  return {
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    ...(run.closedAt ? { closedAt: run.closedAt } : {}),
    ...(run.resetReason ? { resetReason: run.resetReason } : {}),
    score: run.score,
    completedStages: run.stages.map((s) => s.stageNumber),
    result: run.result,
  };
}
export function betterResult(a: { score: number; finalizedAt: Date }, b: { score: number; finalizedAt: Date }) {
  return a.score > b.score || (a.score === b.score && a.finalizedAt.getTime() < b.finalizedAt.getTime());
}
export async function beginCampaign(user: HydratedDocument<IUser>, stage: number, now: Date, revision: number, session: ClientSession) {
  let run = await AccountCampaignRun.findOne({ runId: user.gameplayRunId, ownerId: user._id }).session(session);
  if (stage === 12) {
    if (!run || run.status !== 'COMPLETED') throw new HttpError(403, 'Complete the regular campaign before sandbox');
    return;
  }
  if (!run) {
    if (stage !== 1 || user.progress.get('stage1')?.completed) throw new HttpError(409, 'Historical progress needs an explicit new campaign');
    const [created] = await AccountCampaignRun.create(
      [
        {
          runId: user.gameplayRunId,
          ownerId: user._id,
          status: 'ACTIVE',
          rulesVersion: RULES_VERSION,
          catalogVersion: CAMPAIGN_VERSION,
          scoreVersion: CAMPAIGN_SCORE_VERSION,
          startedAt: now,
          startedRevision: revision + 1,
          updatedRevision: revision + 1,
          score: 0,
          stages: [],
          result: null,
        },
      ],
      { session },
    );
    run = created!;
  }
  if (run.status !== 'ACTIVE' || stage !== run.stages.length + 1) throw new HttpError(403, 'Stage is not the regular campaign frontier');
  user.campaign = projectCampaign(run);
}
export async function closeCampaign(user: HydratedDocument<IUser>, reason: string, now: Date, revision: number, session: ClientSession) {
  const run = await AccountCampaignRun.findOne({ runId: user.gameplayRunId, ownerId: user._id }).session(session);
  if (run?.status === 'ACTIVE') {
    run.status = 'RESET';
    run.closedAt = now;
    run.resetReason = reason;
    run.updatedRevision = revision + 1;
    await run.save({ session });
    user.campaign = projectCampaign(run);
  }
  // Completed history is immutable, including sandbox LOSS/ABANDON and explicit new-run action.
}
export async function winCampaign(
  user: HydratedDocument<IUser>,
  attempt: HydratedDocument<GameplayAttempt>,
  operationId: string,
  points: number,
  now: Date,
  revision: number,
  session: ClientSession,
) {
  if (attempt.stageNumber === 12) return;
  const run = await AccountCampaignRun.findOne({ runId: attempt.runId, ownerId: user._id }).session(session);
  if (!run || run.status !== 'ACTIVE' || attempt.stageNumber !== run.stages.length + 1)
    throw new HttpError(409, 'Campaign sequence needs reconciliation or explicit abandon');
  run.stages.push({ stageNumber: attempt.stageNumber, attemptId: attempt.attemptId, operationId, points, completedAt: now });
  run.score += points;
  run.updatedRevision = revision + 1;
  if (attempt.stageNumber === 11) {
    if (run.stages.length !== 11 || !run.stages.every((s, i) => s.stageNumber === i + 1)) throw new HttpError(409, 'Campaign completion sequence invalid');
    run.status = 'COMPLETED';
    run.closedAt = now;
    run.finalAttemptId = attempt.attemptId;
    run.finalOperationId = operationId;
    const result: CampaignResult = {
      runId: run.runId,
      score: run.score,
      finalizedAt: now,
      finalizedRevision: revision + 1,
      rulesVersion: run.rulesVersion,
      catalogVersion: run.catalogVersion,
      scoreVersion: run.scoreVersion,
      regularStages: 11,
    };
    run.result = result;
    const previous = await CampaignBestEntry.findOne({ ownerId: user._id }).session(session);
    if (!previous || betterResult(result, previous))
      await CampaignBestEntry.findOneAndUpdate(
        { ownerId: user._id },
        { $set: { runId: run.runId, score: run.score, finalizedAt: now, scoreVersion: run.scoreVersion, username: user.username, avatar: user.avatar } },
        { upsert: true, session },
      );
  }
  await run.save({ session });
  user.campaign = projectCampaign(run);
}
