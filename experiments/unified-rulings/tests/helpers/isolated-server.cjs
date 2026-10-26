const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { once } = require('node:events');
const fixture = require('../fixtures/rules-2026-10-09.json');
const project = path.resolve(__dirname, '../..');
const releaseId = process.env.RIFTASSI_TEST_RELEASE || 'v0.1.7';
if (!/^v\d+\.\d+\.\d+$/.test(releaseId)) throw new Error('Expected a release version, not a filesystem path.');
const release = path.join(project, 'releases', releaseId);

async function freePort() {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
function localRequest(port, route, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: route, method,
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(text) }); }
        catch (error) { reject(new Error(`Invalid test server response: ${text.slice(0, 150)}`, { cause: error })); }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error('Local regression request timed out.')));
    request.on('error', reject);
    request.end(body ? JSON.stringify(body) : undefined);
  });
}
async function isolatedServer(t, plans) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-rules-test-'));
  let child, output = '', cookie = '';
  const externalCalls = [], unexpected = [];
  t.after(async () => {
    if (child && child.exitCode === null) {
      const ended = once(child, 'exit');
      const force = setTimeout(() => child.kill(), 3000);
      if (child.connected) child.send({ type: 'shutdown' }, () => {}); else child.kill();
      try { await ended; } finally { clearTimeout(force); }
    }
    // Resolve and bound this disposable directory before recursive cleanup on Windows.
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('riftassist-rules-test-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    assert.deepEqual(unexpected, [], 'The test attempted an unplanned external request.');
  });
  const dataId = 'regression-2026-10-09';
  const dir = path.join(directory, 'knowledge-releases', dataId);
  await fs.mkdir(dir, { recursive: true });
  const hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': fixture.rules, 'cards.json': fixture.cards, 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value);
    hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(dir, name), bytes);
  }
  const manifest = { schemaVersion: 1, compatibleSchema: 2, releaseId: dataId, validationStatus: 'validated', hashes,
    sources: { core: { version: fixture.provenance.coreVersion }, officialSync: { checkedAt: '2026-10-23T00:00:00.000Z' }, riftjudge: { coverage: 'complete' } } };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(directory, 'knowledge-releases/active.json'), JSON.stringify({ releaseId: dataId }));
  const planPath = path.join(directory, 'mock-plan.json');
  await fs.writeFile(planPath, JSON.stringify(plans));
  const port = await freePort();
  // No inherited API credentials, NODE_OPTIONS or project .env. Only this temporary DATA_ROOT is read.
  const env = { RIFTASSI_DATA_ROOT: directory, RIFTASSI_TEST_PLAN: planPath,
    PORT: String(port), PUBLIC_PORT: String(port), OPENAI_API_KEY: 'sk-regression-dummy-not-a-real-key',
    OPENAI_GENERATION_ENABLED: 'true', OPENAI_MODEL: 'regression-mocked-model', OPENAI_REASONING_EFFORT: 'low',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  child = fork(path.join(release, 'src/server.js'), [], { cwd: directory, env,
    execArgv: ['--require', path.join(__dirname, 'mock-external.cjs')], silent: true, windowsHide: true });
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-3000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-3000); });
  child.on('message', value => {
    if (value.type === 'mock-openai') externalCalls.push(value.body);
    if (value.type === 'unexpected-network') unexpected.push(value.url);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Test server readiness timeout: ${output}`)), 10000);
    const onExit = code => finish(new Error(`Test server exited (${code}): ${output}`));
    const onMessage = value => { if (value.type === 'ready') finish(); };
    function finish(error) {
      clearTimeout(timer); child.off('exit', onExit); child.off('error', finish); child.off('message', onMessage);
      error ? reject(error) : resolve();
    }
    child.once('exit', onExit); child.once('error', finish); child.on('message', onMessage);
  });
  const health = await localRequest(port, '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body.knowledge.unresolvedRuleAnchors, [], 'Fixture lacks a required current-rule anchor.');
  cookie = health.headers['set-cookie'][0].split(';')[0];
  return {
    baseURL: `http://127.0.0.1:${port}`,
    externalCalls,
    async ask(question, cardIds = []) {
      return localRequest(port, '/api/ask', { method: 'POST', cookie,
        body: { question, cardIds, language: 'ko', clientKey: crypto.randomUUID() } });
    },
    calls() {
      const db = new DatabaseSync(path.join(directory, 'private/operations.sqlite'), { readOnly: true });
      try { return db.prepare('SELECT kind,input_tokens,output_tokens,error,finished FROM calls ORDER BY created').all(); }
      finally { db.close(); }
    },
    async trace(requestId) {
      const db = new DatabaseSync(path.join(directory, 'private/operations.sqlite'), { readOnly: true });
      let row;
      try { row = db.prepare('SELECT trace FROM requests WHERE id=?').get(requestId); } finally { db.close(); }
      const key = await fs.readFile(path.join(directory, 'private/storage.key'));
      const bytes = Buffer.from(row.trace, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    },
  };
}
module.exports = { isolatedServer, fixture, release };
