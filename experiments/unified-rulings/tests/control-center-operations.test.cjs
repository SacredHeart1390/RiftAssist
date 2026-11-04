const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const release = path.resolve(__dirname, '../releases/v0.2.0');
const { signRequest } = require(path.join(release, 'src/card-review-auth'));
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-cc-ops-'));
  const root = path.join(home, crypto.randomUUID());
  t.after(() => fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const result = spawnSync(process.execPath, [path.join(release, 'scripts/prepare-development.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  await fs.writeFile(path.join(root, '.riftassist-control-center.json'), JSON.stringify({ schemaVersion: 1, purpose: 'synthetic-control-center', id: path.basename(root) }));
  return root;
}
async function run(t, root, scopes, requests) {
  const secret = crypto.randomBytes(32).toString('hex'), sessionId = crypto.randomUUID();
  const auth = { sessionId, credentials: [{ id: 'synthetic-operations', actor: 'synthetic-operator', scopes, secret }] };
  const lines = requests.map(row => {
    const request = { protocol: 'riftassist-control-1', sessionId, credentialId: auth.credentials[0].id,
      requestId: crypto.randomUUID(), nonce: crypto.randomUUID(), issuedAt: Date.now(), params: {}, ...row };
    return { ...request, signature: row.signature ?? signRequest(request, secret) };
  });
  const child = spawn(process.execPath, [path.join(release, 'scripts/control-center-operations.cjs'), '--bootstrap-stdin'], {
    env: { RIFTASSI_DATA_ROOT: root, RIFTASSI_EXTERNAL_MODE: 'mock', OPENAI_GENERATION_ENABLED: 'false' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let output = '', errors = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
  const ended = once(child, 'exit'); child.stdin.end([auth, ...lines].map(x => JSON.stringify(x)).join('\n') + '\n');
  const [code] = await ended; assert.equal(code, 0, 'Owned operations child should stop cleanly.');
  assert.ok(!output.includes(secret) && !errors.includes(secret));
  return output.trim().split('\n').map(line => JSON.parse(line));
}
test('operations wrapper refuses missing ownership before creating a private store', async t => {
  const root = await fixture(t); await fs.unlink(path.join(root, '.riftassist-control-center.json'));
  const result = spawnSync(process.execPath, [path.join(release, 'scripts/control-center-operations.cjs'), '--bootstrap-stdin'], { input: '{}\n', env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); await assert.rejects(fs.stat(path.join(root, 'private')));
});
test('operations reader uses existing authenticated manager API and cannot control it', async t => {
  const root = await fixture(t), result = await run(t, root, ['operations:read'], [{ method: 'status' }, { method: 'start', params: { reason: '한글 권한 차단 확인' } }]);
  assert.equal(result[0].ok, true); assert.equal(result[0].result.controlCenterMode, 'synthetic-development'); assert.equal(result[0].result.appRunning, false);
  assert.equal(result[1].error.code, 'review-forbidden');
});
test('card review credentials do not authorize development admin requests', async t => {
  const root = await fixture(t), [result] = await run(t, root, ['review:read', 'review:decide'], [{ method: 'status' }]);
  assert.equal(result.error.code, 'review-forbidden');
});
test('operations protocol rejects unsigned requests and arbitrary shell/URL methods', async t => {
  const root = await fixture(t), result = await run(t, root, ['operations:read', 'operations:write'], [{ method: 'shell' }, { method: 'https://example.invalid/api/start' }, { method: 'status', credentialId: 'unknown' }, { method: 'status', signature: '' }]);
  assert.deepEqual(result.map(r => r.error.code), ['review-operations-method', 'review-operations-method', 'review-unauthorized', 'review-unauthorized']);
});
test('completed operation IDs cannot be reused with a fresh valid signature', async t => {
  const root = await fixture(t), id = crypto.randomUUID();
  const result = await run(t, root, ['operations:read', 'operations:write'], [{ requestId: id, method: 'ai', params: { enabled: false, reason: '합성 AI 중지 🙂' } }, { requestId: id, method: 'ai', params: { enabled: true, reason: '중복 변경 차단' } }, { method: 'status' }]);
  assert.equal(result[0].ok, true); assert.equal(result[1].error.code, 'review-operation-conflict'); assert.equal(result[2].result.stats.aiEnabled, false);
  const records = await fs.readdir(path.join(root, 'control-center-operations/events')); assert.equal(records.length, 1);
});
test('invalid Control Center worker settings fail before opening an operations database', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [path.join(release, 'src/manager.js')], { env: { RIFTASSI_DATA_ROOT: root, RIFTASSI_CC_WORKER_PORTS: '[3200,3200]' }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0); await assert.rejects(fs.stat(path.join(root, 'private')));
});
test('operations credentials cannot approve cards or read the card review interface', async t => {
  const { reviewFixture } = require('./helpers/card-review-fixture.cjs');
  const { createReviewControl } = require(path.join(release, 'src/card-review-control'));
  const fixture = await reviewFixture(t), auth = fixture.authentication();
  auth.credentials = auth.credentials.map(row => ({ ...row, scopes: ['operations:read', 'operations:write'] }));
  const control = await createReviewControl({ root: fixture.root, authentication: auth });
  for (const method of ['list', 'decide', 'activate']) assert.equal((await control.dispatch(fixture.request(method))).error.code, 'review-forbidden');
});
test('an existing development manager lock blocks a second manager before any private DB opens', async t => {
  const root = await fixture(t), folder = path.join(root, 'control-center-operations'); await fs.mkdir(folder);
  const lock = path.join(folder, 'manager.lock'); const bytes = JSON.stringify({ purpose: 'synthetic-existing-lock' }); await fs.writeFile(lock, bytes);
  const auth = { sessionId: crypto.randomUUID(), credentials: [{ id: 'synthetic', actor: 'synthetic', scopes: ['operations:read'], secret: crypto.randomBytes(32).toString('hex') }] };
  const result = spawnSync(process.execPath, [path.join(release, 'scripts/control-center-operations.cjs'), '--bootstrap-stdin'], { input: JSON.stringify(auth) + '\n', env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.equal(await fs.readFile(lock, 'utf8'), bytes); await assert.rejects(fs.stat(path.join(root, 'private')));
});
