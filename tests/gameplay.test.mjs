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
const { LeaderboardEntry } = await import('../src/models/Leaderboard.model.ts');
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
  const n = ++sequence;
  const a = await call('/api/auth/register', null, {
    email: 'game' + n + '@example.test',
    username: 'Game' + n,
    password: 'Test123!',
    confirmPassword: 'Test123!',
  });
  assert.equal(a.status, 201);
  return { token: a.data.accessToken, id: a.data.user.id, snapshot: a.data.user };
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
  const entry = await LeaderboardEntry.findOne({ userId: a.id });
  assert.equal(entry.totalScore, 800);
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
  await start(a);
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
    assert.equal(result.data.snapshot.totalScore, 800);
    assert.equal(result.data.snapshot.gamesWon, 1);
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
