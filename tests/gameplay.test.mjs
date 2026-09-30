import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://127.0.0.1:27017',
  DB_NAME: 'match3_gameplay_test',
  CLIENT_BASE_URL: 'http://localhost:5173',
  ACCESS_JWT_SECRET: randomBytes(48).toString('hex'),
  ACCESS_TOKEN_TTL: '5m',
  REFRESH_TOKEN_TTL: '1d',
  SALT_ROUNDS: '4',
  COOKIE_SAME_SITE: 'lax',
  COOKIE_SECURE: 'false',
  TRUST_PROXY_HOPS: '0',
  MONGOMS_DOWNLOAD_DIR: process.cwd() + '/.cache/mongodb',
});
const { app } = await import('../src/app.ts');
const { User } = await import('../src/models/User.model.ts');
const { StageAttempt, OperationReceipt } = await import('../src/models/Gameplay.model.ts');
const { AccountCampaignRun, CampaignBestEntry: LeaderboardEntry } = await import('../src/models/AccountCampaign.model.ts');
let mongo,
  server,
  base,
  sequence = 0;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  assert.ok(mongo.getUri().startsWith('mongodb://127.0.0.1:'));
  await mongoose.connect(mongo.getUri(), { dbName: 'match3_gameplay_test' });
  await User.init();
  await StageAttempt.init();
  await OperationReceipt.init();
  await LeaderboardEntry.init();
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo?.stop();
});
async function call(path, owner, body, origin = base) {
  const res = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(owner ? { Authorization: 'Bearer ' + owner.token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}
async function account() {
  // Isolated fixture creation avoids exercising the production registration IP limiter dozens of times.
  const n = ++sequence;
  const user = await User.create({ email: 'game' + n + '@example.test', username: 'Game' + n, password: 'isolated-unused-password' });
  const { createSession } = await import('../src/services/session.service.ts');
  const { currentUser } = await import('../src/services/currentUser.ts');
  const token = await createSession(String(user._id), { headers: {} }, { cookie: () => {} });
  return { token, id: String(user._id), snapshot: JSON.parse(JSON.stringify(currentUser(user))) };
}
async function command(owner, path, body) {
  const r = await call(path, owner, body);
  if (r.status === 200) owner.snapshot = r.data.snapshot;
  return r;
}
const startBody = (owner, stage = owner.snapshot.frontier) => ({ operationId: randomUUID(), expectedRevision: owner.snapshot.revision, stageNumber: stage });
const terminalBody = (owner, outcome = 'WIN', usage = []) => ({
  operationId: randomUUID(),
  expectedRevision: owner.snapshot.revision,
  attemptId: owner.snapshot.activeAttempt.attemptId,
  outcome,
  usage,
});
const start = (owner, stage) => command(owner, '/api/game/attempts/start', startBody(owner, stage));
const finish = (owner, outcome, usage) => command(owner, '/api/game/attempts/terminal', terminalBody(owner, outcome, usage));

test('stage permission is authoritative, strict payload rejects supplied owners/boosters; acknowledged start creates durable binding', async () => {
  const a = await account();
  assert.equal((await start(a, 2)).status, 403);
  assert.equal((await call('/api/game/attempts/start', a, { ...startBody(a), ownerId: randomUUID() })).status, 400);
  assert.equal((await call('/api/game/attempts/start', a, { ...startBody(a), stageSelectedBoosters: { bomb: 999 } })).status, 400);
  assert.equal((await call('/api/game/attempts/start', null, startBody(a))).status, 401);
  const r = await start(a);
  assert.equal(r.status, 200);
  assert.equal(r.data.receipt.command, 'START');
  assert.equal(r.data.snapshot.activeAttempt.stageNumber, 1);
  assert.equal(r.data.snapshot.revision, 1);
  const attempt = await StageAttempt.findOne({ attemptId: r.data.receipt.attemptId });
  assert.equal(String(attempt.ownerId), a.id);
  assert.deepEqual({ ...attempt.initialPowers }, { bomb: 120, laser: 120, extraShuffle: 120 });
  assert.equal(attempt.runId, a.snapshot.runId);
});
test('duplicate and concurrent identical start return one attempt/receipt and grant/reset inventory once', async () => {
  const a = await account(),
    body = startBody(a);
  const results = await Promise.all([call('/api/game/attempts/start', a, body), call('/api/game/attempts/start', a, body)]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.equal(results[0].data.receipt.attemptId, results[1].data.receipt.attemptId);
  assert.equal(await StageAttempt.countDocuments({ ownerId: a.id }), 1);
  assert.equal(await OperationReceipt.countDocuments({ ownerId: a.id }), 1);
  assert.equal((await User.findById(a.id)).gameplayRevision, 1);
  assert.equal((await call('/api/game/attempts/start', a, body)).status, 200);
  assert.equal((await call('/api/game/attempts/start', a, { ...body, stageNumber: 2 })).status, 409);
});
test('another active attempt and stale revisions conflict; gaps never unlock later stages', async () => {
  const a = await account();
  await start(a);
  assert.equal((await start(a)).status, 409);
  assert.equal((await call('/api/game/attempts/start', a, { ...startBody(a), expectedRevision: 0 })).status, 409);
  const b = await account();
  await User.updateOne({ _id: b.id }, { $set: { 'progress.stage3': { completed: true, points: 0 } } });
  assert.equal((await start(b, 4)).status, 403);
  assert.equal((await start(b, 1)).status, 200);
});
test('WIN and inventory apply once; retry cannot farm score/EXP/stats; conflicting terminal operations reject', async () => {
  const a = await account();
  await start(a);
  const body = terminalBody(a, 'WIN', [
    { id: 1, power: 'bomb' },
    { id: 2, power: 'extraShuffle' },
  ]);
  const first = await command(a, '/api/game/attempts/terminal', body);
  assert.equal(first.status, 200);
  assert.equal(a.snapshot.totalScore, 800);
  assert.equal(a.snapshot.playerExp, 1000);
  assert.equal(a.snapshot.frontier, 2);
  assert.equal(a.snapshot.powers.bomb, 119);
  assert.equal(a.snapshot.powers.extraShuffle, 119);
  const repeat = await call('/api/game/attempts/terminal', a, body);
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.data.receipt, first.data.receipt);
  assert.equal(repeat.data.snapshot.gamesWon, 1);
  assert.equal(repeat.data.snapshot.revision, 2);
  assert.equal((await call('/api/game/attempts/terminal', a, { ...body, outcome: 'LOSS' })).status, 409);
  assert.equal((await call('/api/game/attempts/terminal', a, { ...body, operationId: randomUUID(), expectedRevision: 2 })).status, 409);
  const entry = await LeaderboardEntry.findOne({ ownerId: a.id });
  assert.equal(entry, null); // In-progress score is no longer published as a finalized campaign result.
  const attempt = await StageAttempt.findOne({ attemptId: body.attemptId });
  assert.equal(attempt.status, 'WIN');
  assert.equal(attempt.usage.length, 2);
});
test('duplicate usage and overdraw reject without effects; canonical event ledger decrements every use exactly once', async () => {
  const a = await account();
  await start(a);
  const snapshot = a.snapshot;
  for (const usage of [
    [
      { id: 1, power: 'bomb' },
      { id: 1, power: 'bomb' },
    ],
    Array.from({ length: 121 }, (_, n) => ({ id: n + 1, power: 'laser' })),
  ])
    assert.equal((await finish(a, 'WIN', usage)).status, 400);
  assert.equal((await User.findById(a.id)).gameplayRevision, snapshot.revision);
  assert.equal(
    (
      await finish(a, 'WIN', [
        { id: 1, power: 'laser' },
        { id: 2, power: 'laser' },
      ])
    ).status,
    200,
  );
  assert.equal(a.snapshot.powers.laser, 118);
});
test('LOSS and ABANDON apply heart/run/score reset once, preserve meta and keep durable terminal receipt', async () => {
  for (const outcome of ['LOSS', 'ABANDON']) {
    const a = await account();
    await start(a);
    await finish(a, 'WIN');
    const runId = a.snapshot.runId;
    await start(a);
    const body = terminalBody(a, outcome, [{ id: 1, power: 'bomb' }]);
    const r = await command(a, '/api/game/attempts/terminal', body);
    assert.equal(r.status, 200);
    assert.equal(a.snapshot.frontier, 1);
    assert.equal(a.snapshot.totalScore, 0);
    assert.equal(a.snapshot.playerExp, 1000);
    assert.equal(a.snapshot.hearts, 2);
    assert.notEqual(a.snapshot.runId, runId);
    assert.equal(a.snapshot.gamesLost, 1);
    assert.deepEqual(a.snapshot.powers, { bomb: 120, laser: 120, extraShuffle: 120 });
    const repeat = await call('/api/game/attempts/terminal', a, body);
    assert.equal(repeat.status, 200);
    assert.equal(repeat.data.snapshot.hearts, 2);
    assert.equal(repeat.data.snapshot.gamesLost, 1);
    assert.equal((await StageAttempt.findOne({ attemptId: body.attemptId })).status, outcome);
  }
});
test('server-earned level-up entitlement grants fixed +2 once; arbitrary powers PATCH and boosters cannot bypass', async () => {
  const a = await account();
  for (let n = 1; n <= 3; n++) {
    await start(a);
    assert.equal((await finish(a, 'WIN')).status, 200);
  }
  assert.equal(a.snapshot.playerLevel, 2);
  assert.equal(a.snapshot.playerExp, 0);
  assert.equal(a.snapshot.pendingRewards.length, 1);
  const reward = { operationId: randomUUID(), expectedRevision: a.snapshot.revision, attemptId: a.snapshot.pendingRewards[0].attemptId, power: 'bomb' };
  const r = await command(a, '/api/game/rewards/claim', reward);
  assert.equal(r.status, 200);
  assert.equal(a.snapshot.powers.bomb, 122);
  assert.equal(a.snapshot.pendingRewards.length, 0);
  assert.equal((await call('/api/game/rewards/claim', a, reward)).status, 200);
  assert.equal((await call('/api/game/rewards/claim', a, { ...reward, operationId: randomUUID(), expectedRevision: a.snapshot.revision })).status, 409);
  const patch = await fetch(base + '/api/user/powers', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ powers: { bomb: 999 }, operation: 'add' }),
  });
  assert.equal(patch.status, 410);
  assert.equal((await User.findById(a.id)).powers.bomb, 122);
});
test('foreign attempts, receipts and operation IDs cannot be read/reconciled/terminated/reused by another owner', async () => {
  const a = await account(),
    b = await account();
  const body = startBody(a);
  const started = await command(a, '/api/game/attempts/start', body);
  assert.equal((await call('/api/game/attempts/' + started.data.receipt.attemptId, b)).status, 404);
  assert.equal((await call('/api/game/operations/' + body.operationId, b)).status, 404);
  assert.equal((await call('/api/game/attempts/start', b, body)).status, 404);
  assert.equal((await call('/api/game/attempts/terminal', b, { ...terminalBody(a), expectedRevision: 0 })).status, 404);
  assert.equal((await call('/api/game/attempts/terminal', null, terminalBody(a))).status, 401);
});
test('lost response receipt lookup returns committed result; missing receipt explicitly allows same-ID safe retry; pending/stale start blocked', async () => {
  const a = await account();
  const body = startBody(a);
  const unknown = await call('/api/game/operations/' + body.operationId, a);
  assert.equal(unknown.data.status, 'not-found');
  assert.equal(unknown.data.safeToRetry, true);
  await command(a, '/api/game/attempts/start', body);
  const finishBody = terminalBody(a);
  await call('/api/game/attempts/terminal', a, finishBody); // discard acknowledgement
  const receipt = await call('/api/game/operations/' + finishBody.operationId, a);
  assert.equal(receipt.data.status, 'committed');
  assert.equal(receipt.data.snapshot.totalScore, 800);
  assert.equal((await start(a, 2)).status, 409); // stale cached revision, not authority
  assert.equal((await call('/api/game/attempts/terminal', a, finishBody)).data.snapshot.gamesWon, 1);
});
test('transaction rollback leaves attempt retryable with same operation ID and no stranded receipt/effects', async () => {
  const a = await account();
  await start(a);
  const body = terminalBody(a);
  const original = OperationReceipt.create;
  OperationReceipt.create = async function (...args) {
    await original.apply(this, args);
    throw Error('simulated failure after receipt write before commit');
  };
  try {
    assert.equal((await call('/api/game/attempts/terminal', a, body)).status, 500);
  } finally {
    OperationReceipt.create = original;
  }
  assert.equal((await User.findById(a.id)).totalScore, 0);
  assert.equal((await StageAttempt.findOne({ attemptId: body.attemptId })).status, 'active');
  assert.equal(await OperationReceipt.countDocuments({ operationId: body.operationId }), 0);
  assert.equal((await command(a, '/api/game/attempts/terminal', body)).status, 200);
  assert.equal(a.snapshot.totalScore, 800);
});
test('an actual fresh server process recognizes committed receipt and cannot reapply effects', async () => {
  const a = await account();
  for (let stage = 1; stage <= 10; stage++) { await start(a, stage); await finish(a, 'WIN'); }
  await start(a, 11);
  const body = terminalBody(a);
  await finishWithBody();
  async function finishWithBody() {
    assert.equal((await command(a, '/api/game/attempts/terminal', body)).status, 200);
  }
  const child = spawn(process.execPath, ['--conditions', 'development', 'tests/gameplay-restart-worker.mjs'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MONGO_URI: mongo.getUri() },
  });
  let out = '';
  child.stdout.on('data', (b) => (out += b));
  child.stderr.resume();
  const until = async (fn) => {
    const end = Date.now() + 10000;
    while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fn());
  };
  try {
    await until(() => out.includes('TEST_PORT=') || child.exitCode !== null);
    const port = /TEST_PORT=(\d+)/.exec(out)?.[1];
    assert.ok(port);
    const fresh = 'http://127.0.0.1:' + port;
    const result = await call('/api/game/attempts/terminal', a, body, fresh);
    assert.equal(result.status, 200);
    assert.equal(result.data.snapshot.campaign.status, 'COMPLETED');
    assert.equal(result.data.receipt.resultSnapshot.campaign.result.score, 8800);
    assert.equal((await call('/api/leaderboard/me', a, undefined, fresh)).data.best.score, 8800);
    assert.equal(result.data.snapshot.totalScore, 8800);
    assert.equal(result.data.snapshot.gamesWon, 11);
    assert.equal((await call('/api/game/operations/' + body.operationId, a, undefined, fresh)).data.receipt.operationId, body.operationId);
  } finally {
    child.stdin.write('stop\n');
    await until(() => child.exitCode !== null).catch(() => child.kill());
  }
});
test('interrupted legacy stage requires explicit repeat-safe abandon; no automatic recovery completes a predecessor', async () => {
  const a = await account();
  await User.updateOne(
    { _id: a.id },
    {
      $set: {
        activeStageRun: {
          stageId: 'stage1',
          boosterSnapshot: { bomb: 1, laser: 1, extraShuffle: 2 },
          stageSelectedBoosters: { bomb: 0, laser: 0, extraShuffle: 0 },
        },
      },
    },
  );
  assert.equal((await start(a)).status, 409);
  const body = { operationId: randomUUID(), expectedRevision: 0 };
  assert.equal((await command(a, '/api/game/legacy-abandon', body)).status, 200);
  assert.equal(a.snapshot.frontier, 1);
  assert.equal(a.snapshot.gamesLost, 1);
  assert.equal((await call('/api/game/legacy-abandon', a, body)).status, 200);
});

test('concurrent same terminal command commits once; heart-only revision advances do not invalidate the unchanged active attempt', async () => {
  const a = await account();
  await start(a);
  const body = terminalBody(a, 'WIN', [{ id: 1, power: 'bomb' }]);
  await User.updateOne({ _id: a.id }, { $inc: { gameplayRevision: 1 }, $set: { hearts: 3 } });
  const results = await Promise.all([call('/api/game/attempts/terminal', a, body), call('/api/game/attempts/terminal', a, body)]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.equal((await User.findById(a.id)).gamesWon, 1);
  assert.equal((await User.findById(a.id)).powers.bomb, 119);
  assert.equal(await OperationReceipt.countDocuments({ operationId: body.operationId }), 1);
});
test('training uses the catalog infinite-item policy without decrement; reward cannot mutate a live inventory baseline', async () => {
  const a = await account();
  for (let n = 1; n <= 5; n++) {
    await start(a);
    await finish(a, 'WIN');
  }
  const entitlement = a.snapshot.pendingRewards[0];
  await start(a, 6);
  assert.equal(
    (
      await call('/api/game/rewards/claim', a, {
        operationId: randomUUID(),
        expectedRevision: a.snapshot.revision,
        attemptId: entitlement.attemptId,
        power: 'bomb',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await finish(
        a,
        'WIN',
        Array.from({ length: 121 }, (_, n) => ({ id: n + 1, power: 'laser' })),
      )
    ).status,
    200,
  );
  assert.equal(a.snapshot.powers.laser, 120);
});

const through = async (a, n) => {
  for (let stage = a.snapshot.frontier; stage <= n; stage++) {
    assert.equal((await start(a, stage)).status, 200);
    assert.equal((await finish(a, 'WIN')).status, 200);
  }
};
const newRun = (a) => command(a, '/api/game/new-run', { operationId: randomUUID(), expectedRevision: a.snapshot.revision });
test('canonical run identity spans authoritative stages and reads, without route/session-created campaigns', async () => {
  const a = await account();
  await through(a, 3);
  const id = a.snapshot.runId;
  assert.equal(a.snapshot.campaign.runId, id);
  assert.deepEqual(a.snapshot.campaign.completedStages, [1, 2, 3]);
  for (const path of ['/api/auth/me', '/api/game/snapshot', '/api/campaign/current']) {
    const r = await call(path, a);
    assert.equal(r.data.runId, id);
    assert.equal(r.data.campaign.score, 2400);
  }
  assert.equal(await AccountCampaignRun.countDocuments({ ownerId: a.id }), 1);
  assert.equal((await call('/api/campaign/start', a, {})).status, 410);
  assert.equal(await AccountCampaignRun.countDocuments({ ownerId: a.id }), 1);
});
test('stage 11 concurrent/duplicate WIN finalizes one immutable result, best entry and receipt; lost acknowledgement reconciles it', async () => {
  const a = await account();
  await through(a, 10);
  await start(a, 11);
  const body = terminalBody(a),
    id = a.snapshot.runId;
  const replies = await Promise.all([call('/api/game/attempts/terminal', a, body), call('/api/game/attempts/terminal', a, body)]);
  assert.deepEqual(
    replies.map((r) => r.status),
    [200, 200],
  );
  assert.deepEqual(replies[0].data.receipt, replies[1].data.receipt);
  const restored = await call('/api/game/operations/' + body.operationId, a);
  a.snapshot = restored.data.snapshot;
  assert.equal(a.snapshot.campaign.status, 'COMPLETED');
  assert.equal(a.snapshot.campaign.result.score, 8800);
  assert.equal(a.snapshot.sandboxUnlocked, true);
  assert.equal(a.snapshot.frontier, 12);
  assert.equal(await AccountCampaignRun.countDocuments({ runId: id, status: 'COMPLETED' }), 1);
  assert.equal(await LeaderboardEntry.countDocuments({ ownerId: a.id }), 1);
  assert.equal((await call('/api/game/attempts/terminal', a, body)).data.snapshot.campaign.result.score, 8800);
  assert.equal((await start(a, 11)).status, 403);
  assert.equal((await start(a, 1)).status, 403);
  assert.equal((await call('/api/game/attempts/terminal', a, { ...body, operationId: randomUUID(), expectedRevision: a.snapshot.revision })).status, 409);
});
test('stage 12 sandbox WIN/LOSS/ABANDON cannot alter finalized run, best score or create a campaign; subsequent regular run is explicit', async () => {
  for (const outcome of ['WIN', 'LOSS', 'ABANDON']) {
    const a = await account();
    await through(a, 11);
    const run = await AccountCampaignRun.findOne({ runId: a.snapshot.runId }).lean(),
      entry = await LeaderboardEntry.findOne({ ownerId: a.id }).lean();
    await start(a, 12);
    assert.equal((await finish(a, outcome)).status, 200);
    assert.deepEqual(await AccountCampaignRun.findOne({ runId: run.runId }).lean(), run);
    assert.deepEqual(await LeaderboardEntry.findOne({ ownerId: a.id }).lean(), entry);
    assert.deepEqual(a.snapshot.campaign.result, JSON.parse(JSON.stringify(run.result)));
    if (outcome === 'WIN') {
      const id = a.snapshot.runId;
      await newRun(a);
      assert.notEqual(a.snapshot.runId, id);
      assert.equal(a.snapshot.frontier, 1);
      assert.equal(a.snapshot.sandboxUnlocked, false);
    } else assert.equal(a.snapshot.frontier, 1);
    await start(a, 1);
    assert.equal(a.snapshot.campaign.status, 'ACTIVE');
    assert.equal(await AccountCampaignRun.countDocuments({ ownerId: a.id }), 2);
    assert.equal((await LeaderboardEntry.findOne({ ownerId: a.id })).score, 8800);
  }
});
test('LOSS/ABANDON close ACTIVE run as RESET without publishing; NEW_RUN is repeat-safe without heart or meta penalty', async () => {
  for (const outcome of ['LOSS', 'ABANDON']) {
    const a = await account();
    await through(a, 2);
    const id = a.snapshot.runId;
    await start(a, 3);
    await finish(a, outcome);
    const run = await AccountCampaignRun.findOne({ runId: id });
    assert.equal(run.status, 'RESET');
    assert.equal(run.resetReason, outcome);
    assert.equal(run.result, null);
    assert.equal(await LeaderboardEntry.countDocuments({ ownerId: a.id }), 0);
  }
  const a = await account();
  await through(a, 1);
  const body = { operationId: randomUUID(), expectedRevision: a.snapshot.revision },
    id = a.snapshot.runId;
  const r = await command(a, '/api/game/new-run', body);
  assert.equal(r.status, 200);
  assert.equal(r.data.receipt.attemptId, null);
  assert.equal(a.snapshot.hearts, 3);
  assert.equal(a.snapshot.playerExp, 1000);
  assert.equal(a.snapshot.gamesLost, 0);
  assert.equal((await AccountCampaignRun.findOne({ runId: id })).resetReason, 'NEW_RUN');
  const again = await call('/api/game/new-run', a, body);
  assert.equal(again.data.snapshot.runId, a.snapshot.runId);
  await start(a, 1);
  assert.equal((await newRun(a)).status, 409);
});
test('best-result comparison preserves higher or earlier equal history; better score replaces once; lower results remain immutable history', async () => {
  for (const { score, replace } of [
    { score: 9000, replace: false },
    { score: 8800, replace: false },
    { score: 8000, replace: true },
  ]) {
    const a = await account(),
      oldId = randomUUID();
    await LeaderboardEntry.create({
      ownerId: a.id,
      runId: oldId,
      score,
      finalizedAt: new Date(0),
      scoreVersion: 'regular-campaign-points-v1',
      username: 'Previous',
      avatar: 'default.png',
    });
    await through(a, 11);
    const best = await LeaderboardEntry.findOne({ ownerId: a.id });
    assert.equal(best.runId, replace ? a.snapshot.runId : oldId);
    assert.equal(best.score, replace ? 8800 : score);
    assert.equal(await AccountCampaignRun.countDocuments({ ownerId: a.id, status: 'COMPLETED' }), 1);
    const op = (await AccountCampaignRun.findOne({ runId: a.snapshot.runId })).finalOperationId;
    const receipt = await call('/api/game/operations/' + op, a);
    assert.equal(receipt.data.snapshot.campaign.result.score, 8800);
    assert.equal(await LeaderboardEntry.countDocuments({ ownerId: a.id }), 1);
  }
});
test('public top is bounded, deterministic and safe; verified rank uses all results rather than top-ten subset and aliases share one truth', async () => {
  const a = await account(),
    b = await account();
  const date = new Date('2020-01-01');
  const owners = [a.id, b.id, ...Array.from({ length: 11 }, () => String(new mongoose.Types.ObjectId()))];
  for (let i = 0; i < owners.length; i++)
    await LeaderboardEntry.create({
      ownerId: owners[i],
      runId: randomUUID(),
      score: 20000 - i * 100,
      finalizedAt: date,
      scoreVersion: 'regular-campaign-points-v1',
      username: 'Public' + i,
      avatar: 'default.png',
    });
  const last = owners.at(-1);
  await LeaderboardEntry.updateOne({ ownerId: a.id }, { $set: { score: 21000 } });
  await LeaderboardEntry.updateOne({ ownerId: b.id }, { $set: { score: 21000 } });
  const top = (await call('/api/leaderboard/top')).data;
  assert.equal(top.entries.length, 10);
  assert.deepEqual(
    top.entries.slice(0, 2).map((e) => e.accountId),
    [a.id, b.id].sort(),
  );
  assert.deepEqual(
    top.entries.map((e) => e.rank),
    Array.from({ length: 10 }, (_, i) => i + 1),
  );
  for (const row of top.entries) assert.deepEqual(Object.keys(row).sort(), ['accountId', 'avatar', 'finalizedAt', 'rank', 'score', 'scoreVersion', 'username']);
  assert.deepEqual((await call('/api/leaderboard/top10')).data, top);
  const own = await call('/api/leaderboard/me', b);
  assert.equal(own.status, 200);
  assert.equal(own.data.best.accountId, b.id);
  assert.equal(own.data.rank, [a.id, b.id].sort().indexOf(b.id) + 1);
  assert.equal((await call('/api/leaderboard/rank/' + a.id, b)).status, 403);
  await LeaderboardEntry.updateOne({ ownerId: b.id }, { $set: { score: 1 } });
  assert.ok((await call('/api/leaderboard/me', b)).data.rank > 10);
  assert.equal((await call('/api/leaderboard/me')).status, 401);
  const empty = await account();
  assert.deepEqual((await call('/api/leaderboard/me', empty)).data, { rank: null, best: null, scoreVersion: 'regular-campaign-points-v1' });
});
test('campaign privacy and legacy source quarantine: supplied IDs, foreign receipt and telemetry cannot publish another truth', async () => {
  const a = await account(),
    b = await account();
  await through(a, 10);
  await start(a, 11);
  const body = terminalBody(a);
  assert.equal((await call('/api/game/attempts/terminal', b, { ...body, expectedRevision: 0 })).status, 404);
  assert.equal((await call('/api/game/attempts/terminal', a, { ...body, ownerId: b.id })).status, 400);
  assert.equal((await call('/api/campaign/current', b)).data.campaign, null);
  assert.equal((await call('/api/campaign/current')).status, 401);
  for (const path of ['/start', '/levelEnd', '/levelAbort'])
    assert.equal((await call('/api/campaign' + path, a, { CAMPAIGN_ID: a.snapshot.runId, OUTCOME: 'WIN', LEVEL_INDEX: 12 })).status, 410);
  const { LeaderboardEntry: LegacyEntry } = await import('../src/models/Leaderboard.model.ts');
  await LegacyEntry.create({ userId: a.id, username: 'Legacy999', totalScore: 999999 });
  assert.equal(
    (await call('/api/leaderboard/top')).data.entries.some((e) => e.username === 'Legacy999'),
    false,
  );
  assert.equal((await finish(a, 'WIN')).status, 200);
  const finalOperation = (await AccountCampaignRun.findOne({ runId: a.snapshot.runId })).finalOperationId;
  assert.equal((await call('/api/game/operations/' + finalOperation, b)).status, 404);
});
test('finalization failure rolls back gameplay, campaign and best together; same-ID retry recovers complete result', async () => {
  const a = await account();
  await through(a, 10);
  await start(a, 11);
  const body = terminalBody(a),
    original = OperationReceipt.create;
  OperationReceipt.create = async function (...args) {
    await original.apply(this, args);
    throw Error('fail after campaign and best, before commit');
  };
  try {
    assert.equal((await call('/api/game/attempts/terminal', a, body)).status, 500);
  } finally {
    OperationReceipt.create = original;
  }
  assert.equal((await AccountCampaignRun.findOne({ runId: a.snapshot.runId })).status, 'ACTIVE');
  assert.equal(await LeaderboardEntry.countDocuments({ ownerId: a.id }), 0);
  assert.equal((await StageAttempt.findOne({ attemptId: body.attemptId })).status, 'active');
  assert.equal((await command(a, '/api/game/attempts/terminal', body)).data.snapshot.campaign.status, 'COMPLETED');
});
test('historical partial progress cannot silently become a canonical ranking result; explicit new run restores campaign eligibility', async () => {
  const a = await account();
  await User.updateOne({ _id: a.id }, { $set: { 'progress.stage1': { completed: true, points: 800 }, gameplayRunId: randomUUID() } });
  a.snapshot = (await call('/api/auth/me', a)).data;
  assert.equal(a.snapshot.campaignNeedsReset, true);
  assert.equal((await start(a, 2)).status, 409);
  assert.equal((await newRun(a)).status, 200);
  assert.equal((await start(a, 1)).status, 200);
  assert.equal(a.snapshot.campaign.score, 0);
});
