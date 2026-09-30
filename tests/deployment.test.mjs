import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
const config = { NODE_ENV: 'production', MONGO_URI: 'mongodb://127.0.0.1:27017', DB_NAME: 'deployment_test', CLIENT_BASE_URL: 'https://frontend.example', ACCESS_JWT_SECRET: randomBytes(48).toString('hex'), ACCESS_TOKEN_TTL: '15m', REFRESH_TOKEN_TTL: '7d', COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'true', TRUST_PROXY_HOPS: '1', SALT_ROUNDS: '10', ALLOW_STAGE_SKIP: '0', MONGOMS_DOWNLOAD_DIR: process.cwd() + '/.cache/mongodb' };
Object.assign(process.env, config);
const { loadConfig } = await import('../src/utils/env.ts');
const { app } = await import('../src/app.ts');
const { connectDB, initializeDatabase, supportsTransactions } = await import('../src/db.ts');
const { User } = await import('../src/models/User.model.ts');
let mongo, standalone, server, base;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } });
  standalone = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  assert.ok(mongo.getUri().startsWith('mongodb://127.0.0.1:'));
  // env is immutable; this test uses an isolated connection then the same startup prerequisites.
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); await mongo.stop(); await standalone.stop();
});
test('production configuration rejects missing/unsafe inputs without exposing values; exact origins/proxy/dev gate validated', () => {
  assert.throws(() => loadConfig({ RENDER: 'true' }), /NODE_ENV/);
  const c = loadConfig(config); assert.equal(c.trustProxyHops, 1); assert.equal(c.cookie.secure, true); assert.equal(c.allowStageSkip, false);
  for (const key of ['MONGO_URI', 'DB_NAME', 'CLIENT_BASE_URL', 'ACCESS_JWT_SECRET', 'COOKIE_SAME_SITE', 'TRUST_PROXY_HOPS']) {
    const next = { ...config }; delete next[key]; assert.throws(() => loadConfig(next), new RegExp(key));
  }
  for (const [key, value] of [['ACCESS_JWT_SECRET', 'REPLACE_WITH_PRODUCTION_SECRET_LONG_ENOUGH'], ['ACCESS_JWT_SECRET', 'a'.repeat(64)], ['CLIENT_BASE_URL', '*'], ['CLIENT_BASE_URL', 'https://*.example'], ['CLIENT_BASE_URL', 'http://frontend.example'], ['CLIENT_BASE_URL', 'https://frontend.example/path'], ['COOKIE_SECURE', 'false'], ['COOKIE_SAME_SITE', 'bad'], ['TRUST_PROXY_HOPS', '-1'], ['TRUST_PROXY_HOPS', 'true'], ['ALLOW_STAGE_SKIP', '1'], ['SALT_ROUNDS', '4'], ['PORT', '0'], ['MONGO_URI', 'mongodb://REPLACE_USER:REPLACE_PASSWORD@cluster']]) {
    assert.throws(() => loadConfig({ ...config, [key]: value }), error => error.message.includes(key) && !error.message.includes(value));
  }
  assert.equal(loadConfig({ ...config, NODE_ENV: 'development', ALLOW_STAGE_SKIP: '1' }).allowStageSkip, true);
  assert.equal(loadConfig({ ...config, COOKIE_SAME_SITE: 'lax' }).cookie.sameSite, 'lax');
});
test('read-only topology check rejects standalone/secondary/no sessions and accepts writable replica set or mongos', () => {
  assert.equal(supportsTransactions({ isWritablePrimary: true, maxWireVersion: 17 }), false);
  const h = { isWritablePrimary: true, setName: 'rs', logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 };
  assert.equal(supportsTransactions(h), true); assert.equal(supportsTransactions({ ...h, isWritablePrimary: false }), false);
  assert.equal(supportsTransactions({ ...h, readOnly: true }), false);
  assert.equal(supportsTransactions({ isWritablePrimary: true, msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 }), true);
});
test('health is lightweight; readiness follows DB/index initialization, disconnect and recovery; DB_NAME overrides URI database', async () => {
  const read = async path => { const r = await fetch(base + path); return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }; };
  assert.equal((await read('/health')).status, 200); assert.equal((await read('/ready')).status, 503);
  await mongoose.connect(mongo.getUri('uri_database'), { dbName: config.DB_NAME, autoIndex: false, bufferCommands: false, serverSelectionTimeoutMS: 1500 });
  assert.equal(mongoose.connection.name, config.DB_NAME);
  await initializeDatabase(); assert.deepEqual(await read('/ready'), { status: 200, body: { ready: true }, cache: 'no-store' });
  for (const collection of ['users', 'refreshsessions', 'gameplayattempts', 'gameplayoperationreceipts', 'accountcampaignruns', 'campaignbestentries']) {
    const indexes = await mongoose.connection.db.collection(collection).indexes(); assert.ok(indexes.length > 1, collection);
  }
  assert.equal(await User.countDocuments(), 0); // No transaction probe/gameplay mutation.
  const original = User.createIndexes;
  User.createIndexes = async () => { throw Error('test index failure'); };
  try { await assert.rejects(initializeDatabase()); assert.equal((await read('/ready')).status, 503); } finally { User.createIndexes = original; }
  await initializeDatabase(); await mongoose.disconnect();
  assert.equal((await read('/ready')).status, 503); assert.equal((await read('/health')).status, 200);
  await mongoose.connect(mongo.getUri(), { dbName: config.DB_NAME, autoIndex: false }); await initializeDatabase();
  assert.equal((await read('/ready')).status, 200);
});
const wait = async predicate => { const end = Date.now() + 15000; while (!predicate() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(predicate(), 'local lifecycle timeout'); };
function child(env, worker = false) {
  const compiled = process.env.MATCH3_COMPILED === '1';
  const args = [...(compiled ? [] : ['--conditions', 'development']), worker ? 'tests/lifecycle-worker.mjs' : compiled ? 'dist/server.js' : 'src/server.ts'];
  const proc = spawn(process.execPath, args, { env: { ...process.env, ...config, ...env }, windowsHide: true, stdio: worker ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'] });
  let output = ''; proc.stdout.on('data', b => output += b); proc.stderr.on('data', b => output += b);
  return { proc, output: () => output };
}
test('real startup exits non-zero for missing secret, unsafe secret and standalone; never logs credential input', async () => {
  for (const env of [{ ACCESS_JWT_SECRET: '' }, { ACCESS_JWT_SECRET: 'REPLACE_WITH_LONG_RANDOM_SECRET_NOW' }, { MONGO_URI: standalone.getUri() }]) {
    const c = child(env); try { await wait(() => c.proc.exitCode !== null); assert.equal(c.proc.exitCode, 1); assert.ok(!c.output().includes('listening on port')); assert.ok(!c.output().includes(env.ACCESS_JWT_SECRET || standalone.getUri())); } finally { if (c.proc.exitCode === null) c.proc.kill(); }
  }
});
test('real production bootstrap initializes before HTTP, handles repeated SIGTERM/SIGINT and closes gracefully', async () => {
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await new Promise(resolve => reserve.once('listening', resolve)); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const c = child({ MONGO_URI: mongo.getUri('ignored_uri_database'), DB_NAME: 'lifecycle_test', PORT: String(port) }, true);
  try {
    await wait(() => c.output().includes('[server] listening') || c.proc.exitCode !== null);
    assert.equal(c.proc.exitCode, null, c.output()); assert.ok(c.output().indexOf('indexes ready') < c.output().indexOf('[server] listening'));
    assert.equal((await fetch('http://127.0.0.1:' + port + '/ready')).status, 200);
    c.proc.send('SIGTERM'); c.proc.send('SIGINT'); await wait(() => c.proc.exitCode !== null);
    assert.equal(c.proc.exitCode, 0); assert.equal(c.output().split('[shutdown] HTTP and database closed').length, 2);
  } finally { if (c.proc.exitCode === null) c.proc.kill(); }
});
