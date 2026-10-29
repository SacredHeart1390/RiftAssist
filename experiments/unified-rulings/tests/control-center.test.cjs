const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { reviewFixture } = require('./helpers/card-review-fixture.cjs');
const { release } = require('./helpers/isolated-server.cjs');
const project = path.resolve(release, '../../control-center');
for (const [name, script] of [['Node/C# public signing vectors', 'protocol-vectors.cjs'], ['packaged backend source hashes', 'backend-manifest.cjs']]) test(name, () => {
  const result = spawnSync(process.execPath, [path.join(project, 'scripts', script)], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 0, result.stderr);
});
test('stdin bootstrap supports coalesced UTF-8 private bootstrap and signed requests without exposing credentials', async t => {
  const s = await reviewFixture(t); const auth = s.authentication(); delete auth.now;
  const child = spawn(process.execPath, [path.join(release, 'scripts/card-review-control.cjs'), '--bootstrap-stdin'],
    { env: { RIFTASSI_DATA_ROOT: s.root }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '', errors = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
  const ended = once(child, 'exit');
  child.stdin.end(JSON.stringify(auth) + '\n' + JSON.stringify(s.request('register', { candidateId: s.candidateId,
    knowledgeReleaseId: s.knowledgeReleaseId, reason: '한글 사유 🙂 / "기호"' })) + '\n');
  const [code] = await ended; assert.equal(code, 0, errors);
  const result = JSON.parse(output.trim()); assert.equal(result.ok, true); assert.equal(result.protocol, 'riftassist-control-1');
  for (const row of auth.credentials) assert.ok(!output.includes(row.secret) && !errors.includes(row.secret));
});
test('unknown bootstrap flags and oversized bootstrap fail before creating a review session', async t => {
  const s = await reviewFixture(t);
  for (const [args, input] of [[['--invalid'], ''], [['--bootstrap-stdin'], 'x'.repeat(32769) + '\n']]) {
    const result = spawnSync(process.execPath, [path.join(release, 'scripts/card-review-control.cjs'), ...args], {
      env: { RIFTASSI_DATA_ROOT: s.root }, input, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('signature'));
  }
});
test('Control Center scenario refuses an unowned sandbox and preserves its active data', async t => {
  const s = await reviewFixture(t), pointer = await fs.readFile(path.join(s.root, 'knowledge-releases/active.json'));
  const result = spawnSync(process.execPath, [path.join(release, 'scripts/prepare-control-center-demo.cjs')], { env: { RIFTASSI_DATA_ROOT: s.root }, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
  assert.deepEqual(await fs.readFile(path.join(s.root, 'knowledge-releases/active.json')), pointer);
});
