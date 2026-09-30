import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
// Do not load .env. Override all sensitive/configuration input before importing the app.
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://127.0.0.1:27017',
  DB_NAME: 'match3_auth_test',
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
const { env, loadConfig } = await import('../src/utils/env.ts');
const { User } = await import('../src/models/User.model.ts');
const { RefreshSession } = await import('../src/models/RefreshSession.model.ts');
const { CampaignRun } = await import('../src/models/Campaign.model.ts');
const { tokenDigest } = await import('../src/services/session.service.ts');
let mongo, server, base;
before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'match3_auth_test' } });
  assert.ok(mongo.getUri().startsWith('mongodb://127.0.0.1:'));
  await mongoose.connect(mongo.getUri(), { dbName: 'match3_auth_test', serverSelectionTimeoutMS: 3000 });
  await User.init();
  await RefreshSession.init();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo?.stop();
});
async function call(path, { token, cookie, origin = 'http://localhost:5173', method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (cookie) headers.Cookie = cookie;
  if (origin !== null) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return {
    status: res.status,
    cookie: res.headers.get('set-cookie'),
    headers: res.headers,
    data: res.status === 204 ? undefined : await res.json(),
  };
}
const creds = (name) => ({
  email: name + '@example.test',
  username: name,
  password: 'Test password 123!',
  confirmPassword: 'Test password 123!',
});
const register = (name) => call('/api/auth/register', { method: 'POST', body: creds(name) });
const pair = (response) => response.cookie.split(';')[0];
const raw = (response) => pair(response).split('=')[1];
let alice, bob;
test('register/login issue safe DTO, signed token and hashed-only refresh session; invalid credentials rejected', async () => {
  alice = await register('Alice');
  bob = await register('Bobby');
  assert.equal(alice.status, 201);
  assert.equal(alice.data.user.username, 'Alice');
  assert.equal('password' in alice.data.user, false);
  assert.equal('tokenHash' in alice.data.user, false);
  const document = await RefreshSession.findOne({ tokenHash: tokenDigest(raw(alice)) }).lean();
  assert.ok(document);
  assert.equal(JSON.stringify(document).includes(raw(alice)), false);
  assert.equal((await User.findById(alice.data.user.id)).password, undefined);
  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'ALICE@example.test', password: creds('Alice').password } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, alice.data.user.id);
  alice = login;
  for (const email of ['Alice@example.test', 'missing@example.test'])
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong' } })).status, 401);
});
test('/me only accepts signed, unexpired access claims, fixed issuer/audience/algorithm and live session', async () => {
  assert.equal((await call('/api/auth/me')).status, 401);
  const me = await call('/api/auth/me?userId=' + bob.data.user.id, { token: alice.data.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.id, alice.data.user.id);
  assert.equal('password' in me.data, false);
  const claims = jwt.decode(alice.data.accessToken);
  const invalids = [
    'invalid',
    jwt.sign({ sid: claims.sid, type: 'access' }, env.ACCESS_JWT_SECRET, {
      subject: claims.sub,
      expiresIn: -1,
      issuer: env.issuer,
      audience: env.audience,
    }),
    jwt.sign({ sid: claims.sid, type: 'access' }, env.ACCESS_JWT_SECRET, {
      subject: claims.sub,
      expiresIn: 60,
      issuer: 'wrong',
      audience: env.audience,
    }),
    jwt.sign({ sid: claims.sid, type: 'access' }, env.ACCESS_JWT_SECRET, {
      algorithm: 'HS384',
      subject: claims.sub,
      expiresIn: 60,
      issuer: env.issuer,
      audience: env.audience,
    }),
  ];
  for (const token of invalids) assert.equal((await call('/api/auth/me', { token })).status, 401);
});
test('profile/avatar/powers/game/rank compatibility IDs cannot select another account; canonical mutation targets verified owner', async () => {
  for (const [path, method, body] of [
    ['/api/user/profile/', 'GET'],
    ['/api/user/avatar/', 'PATCH', { avatar: 'avatar1.png' }],
    ['/api/user/powers/', 'PATCH', { powers: { bomb: 2 } }],
    ['/api/game/lose/', 'POST'],
    ['/api/game/abandon/', 'POST'],
    ['/api/leaderboard/rank/', 'GET'],
  ])
    assert.equal((await call(path + bob.data.user.id, { method, body, token: alice.data.accessToken })).status, 403);
  assert.equal((await call('/api/game/start/' + bob.data.user.id + '/1', { method: 'POST', body: {}, token: alice.data.accessToken })).status, 403);
  assert.equal((await call('/api/game/completeStage/' + bob.data.user.id + '/1', { method: 'POST', body: {}, token: alice.data.accessToken })).status, 403);
  assert.equal((await call('/api/game/' + bob.data.user.id + '/status', { token: alice.data.accessToken })).status, 403);
  assert.equal(
    (
      await call('/api/user/avatar', {
        method: 'PATCH',
        body: { avatar: 'avatar1.png', userId: bob.data.user.id },
        token: alice.data.accessToken,
      })
    ).status,
    200,
  );
  assert.equal((await User.findById(alice.data.user.id)).avatar, 'avatar1.png');
  assert.equal((await User.findById(bob.data.user.id)).avatar, 'default.png');
  assert.equal(
    (
      await call('/api/user/powers', {
        method: 'PATCH',
        body: { powers: { bomb: 3 }, userId: bob.data.user.id },
        token: alice.data.accessToken,
      })
    ).status,
    410,
  );
  assert.equal((await User.findById(bob.data.user.id)).powers.bomb, 0);
  assert.equal((await call('/api/game/start/1', { method: 'POST', body: {}, token: alice.data.accessToken })).status, 410);
  assert.equal((await User.findById(bob.data.user.id)).activeStageRun, undefined);
  for (const path of ['/api/user/profile/' + alice.data.user.id, '/api/game/status', '/api/campaign/start'])
    assert.equal((await call(path, { method: path.includes('/campaign/') ? 'POST' : 'GET', body: path.includes('/campaign/') ? {} : undefined })).status, 401);
});
test('deprecated campaign telemetry cannot mutate account or ranking state and still requires verified identity', async () => {
  for (const path of ['/api/campaign/start', '/api/campaign/levelEnd', '/api/campaign/levelAbort']) {
    assert.equal((await call(path, { method: 'POST', body: { ACCOUNT_ID: bob.data.user.id }, token: alice.data.accessToken })).status, 410);
    assert.equal((await call(path, { method: 'POST', body: {} })).status, 401);
  }
  assert.equal(await CampaignRun.countDocuments(), 0);
});
test('refresh rotates atomically, old token reuse revokes family and existing access tokens', async () => {
  const first = await register('Rotate');
  const refreshed = await call('/api/auth/refresh', { method: 'POST', cookie: pair(first) });
  assert.equal(refreshed.status, 200);
  assert.notEqual(raw(first), raw(refreshed));
  const doc = await RefreshSession.findOne({ tokenHash: tokenDigest(raw(refreshed)) });
  assert.deepEqual(doc.usedTokenHashes, [tokenDigest(raw(first))]);
  assert.equal((await call('/api/auth/me', { token: refreshed.data.accessToken })).status, 200);
  assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: pair(first) })).status, 401);
  assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: pair(refreshed) })).status, 401);
  assert.equal((await call('/api/auth/me', { token: refreshed.data.accessToken })).status, 401);
});
test('concurrent refresh has one CAS winner; replay invalidates the family', async () => {
  const first = await register('Concurrent');
  const results = await Promise.all([1, 2].map(() => call('/api/auth/refresh', { method: 'POST', cookie: pair(first) })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  const winner = results.find((r) => r.status === 200);
  assert.equal((await call('/api/auth/me', { token: winner.data.accessToken })).status, 401);
});
test('expired/revoked refresh fails; logout revokes current family and consistently clears cookie; repeated logout safe', async () => {
  const expired = await register('Expired');
  await RefreshSession.updateOne({ tokenHash: tokenDigest(raw(expired)) }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: pair(expired) })).status, 401);
  const fresh = await register('Logout');
  const logged = await call('/api/auth/logout', { method: 'POST', cookie: pair(fresh) });
  assert.equal(logged.status, 204);
  assert.match(logged.cookie, /Path=\/api\/auth/);
  assert.match(logged.cookie, /HttpOnly/);
  assert.match(logged.cookie, /SameSite=Lax/);
  assert.match(logged.cookie, /Expires=Thu, 01 Jan 1970/);
  assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: pair(fresh) })).status, 401);
  assert.equal((await call('/api/auth/me', { token: fresh.data.accessToken })).status, 401);
  assert.equal((await call('/api/auth/logout', { method: 'POST' })).status, 204);
});
test('Origin allowlist protects refresh/logout/login/register even with ambient cookie; CORS has exact credentials policy', async () => {
  const c = await register('Origin');
  assert.match(c.cookie, /HttpOnly/);
  assert.match(c.cookie, /SameSite=Lax/);
  assert.doesNotMatch(c.cookie, /Domain=/);
  for (const path of ['/api/auth/refresh', '/api/auth/logout', '/api/auth/login', '/api/auth/register'])
    for (const origin of [null, 'null', 'https://attacker.test', 'http://localhost:5173.attacker.test']) {
      const r = await call(path, { method: 'POST', origin, cookie: pair(c), body: {} });
      assert.equal(r.status, 403);
    }
  const allowed = await call('/api/auth/refresh', { method: 'POST', cookie: pair(c) });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
});
test('production config requires secrets/origins/database and enforces secure cookie policy; no values in errors', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /Missing required configuration/);
  const production = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://127.0.0.1:27017',
    DB_NAME: 'auth_test',
    CLIENT_BASE_URL: 'https://frontend.example',
    COOKIE_SAME_SITE: 'none', TRUST_PROXY_HOPS: '1',
    ACCESS_JWT_SECRET: randomBytes(48).toString('hex'),
  };
  const c = loadConfig(production);
  assert.equal(c.cookie.secure, true);
  assert.equal(c.cookie.sameSite, 'none');
  assert.equal(c.cookie.httpOnly, true);
  assert.equal(c.cookieName, '__Secure-match3_refresh');
  assert.throws(() => loadConfig({ ...production, CLIENT_BASE_URL: '*' }));
  assert.throws(() => loadConfig({ ...production, COOKIE_SECURE: 'false' }));
  assert.throws(() => loadConfig({ ...production, ACCESS_JWT_SECRET: 'bad' }));
});

test('standalone MongoDB rejects gameplay transactions without partially committing account state', async () => {
  const result = await call('/api/game/attempts/start', {
    token: alice.data.accessToken,
    method: 'POST',
    body: { operationId: crypto.randomUUID(), expectedRevision: 0, stageNumber: 1 },
  });
  assert.equal(result.status, 503);
  assert.equal((await User.findById(alice.data.user.id)).activeAttempt, undefined);
  const { StageAttempt, OperationReceipt } = await import('../src/models/Gameplay.model.ts');
  assert.equal(await StageAttempt.countDocuments(), 0);
  assert.equal(await OperationReceipt.countDocuments(), 0);
});
