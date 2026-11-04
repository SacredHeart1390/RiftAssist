const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { isolatedServer, release, freePort } = require('./helpers/isolated-server.cjs');
const { createStore } = require(path.join(release, 'src/operations-store.js'));

const question = '같은 턴에 같은 전장에서 점거로 득점한 뒤 다시 정복하면 추가 점수를 얻나요?';
const answer = { recommendation: '같은 턴 같은 전장에서는 추가 득점하지 않습니다.',
  resolutionSteps: ['이번 턴 해당 전장에서 이미 득점했는지 확인합니다.', '다시 정복해도 추가 점수를 얻지 않습니다.'],
  reasoning: '코어룰 472의 전장당 턴별 득점 제한을 따릅니다.', confidence: 'medium',
  evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] }, followUpQuestions: [],
  citedRuleIds: ['core-rules:472'], citedCaseIds: [], citedCardIds: [], caseTitles: [], caseComparisons: [], requiresJudge: false };

async function managerFor(t, server) {
  const port = await freePort(), appPort = await freePort();
  // All files and keys are synthetic, under the same disposable fixture as the public test server.
  // A live test-process marker prevents manager startup from spawning any real source collector.
  await fs.mkdir(path.join(server.dataRoot, 'source-updates'), { recursive: true });
  await fs.writeFile(path.join(server.dataRoot, 'source-updates/monitor.json'), JSON.stringify({ pid: process.pid }));
  const dummyKey = crypto.randomBytes(32).toString('hex');
  await fs.writeFile(path.join(server.dataRoot, 'private/manager.key'), dummyKey, { mode: 0o600 });
  const plan = path.join(server.dataRoot, 'manager-empty-plan.json');
  await fs.writeFile(plan, '[]');
  const child = fork(path.join(release, 'src/manager.js'), [], {
    cwd: server.dataRoot, silent: true,
    env: { RIFTASSI_DATA_ROOT: server.dataRoot, MANAGER_PORT: String(port), APP_PORT: String(appPort), RIFTASSI_TEST_PLAN: plan },
    execArgv: ['--require', path.join(__dirname, 'helpers/mock-external.cjs')],
  });
  child.stdout.resume(); child.stderr.resume();
  const unexpected = [];
  child.on('message', value => { if (value.type === 'unexpected-network') unexpected.push(value.url); });
  server.addCleanup(async () => {
    if (child.exitCode === null) {
      const ended = once(child, 'exit');
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      try { await ended; } finally { clearTimeout(force); }
    }
    assert.deepEqual(unexpected, []);
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).status === 200) break; } catch { /* startup only */ }
    assert.equal(child.exitCode, null, 'Isolated manager exited during startup.');
    assert.ok(i < 99, 'Isolated manager failed to start.');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  let cookie;
  async function request(route, body, headers = {}) {
    const res = await fetch(base + route, { method: body ? 'POST' : 'GET',
      headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json(), headers: res.headers };
  }
  assert.equal((await request('/api/status')).status, 401);
  assert.equal((await request('/api/login', { key: 'invalid-test-credential' })).status, 403);
  const login = await request('/api/login', { key: dummyKey });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  return { request };
}

test('legal pages are public static documents; private/admin routes stay inaccessible', async t => {
  const server = await isolatedServer(t, []);
  for (const route of ['/', '/privacy.html', '/terms.html']) {
    const res = await fetch(server.baseURL + route);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.ok(res.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.equal(res.headers.get('set-cookie'), null, 'Static legal navigation must not require or create a session.');
    const html = await res.text();
    assert.ok(html.includes('RiftAssist was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.'));
  }
  for (const route of ['/.env', '/private/storage.key', '/private/operations.sqlite', '/api/status', '/api/knowledge', '/api/card-reviews', '/api/card-review/activate']) {
    assert.equal((await fetch(server.baseURL + route)).status, 404);
  }
  assert.equal((await fetch(server.baseURL + '/api/reports')).status, 401);
  assert.equal(server.externalCalls.length, 0);
});

test('card APIs, AI, linked reports and authenticated manager review work together', async t => {
  const server = await isolatedServer(t, [{ ruling: answer }]);
  const health = await server.request('/api/health');
  assert.deepEqual(health.body.retention, { questionDays: 7, metadataDays: 30, reportDays: 90, imagesStored: false });
  const search = await server.request('/api/cards/search?q=' + encodeURIComponent('유성'));
  assert.equal(search.status, 200); assert.ok(search.body.results.length);
  const id = search.body.results[0].id;
  assert.equal((await server.request('/api/cards/' + encodeURIComponent(id))).body.card.id, id);
  const resolved = await server.request('/api/cards/resolve', { method: 'POST', body: { question: '유성으로 처리', cardIds: [id] } });
  assert.equal(resolved.status, 200);
  const result = await server.ask(question);
  assert.equal(result.status, 200); assert.equal(result.body.status, 'ruling-generated');
  assert.equal(server.externalCalls.length, 1);
  assert.equal(server.externalCalls[0].store, false);
  const body = { clientKey: crypto.randomUUID(), requestId: result.body.requestId,
    category: 'ruling', description: 'Synthetic report for isolated integration review.', expected: 'Synthetic expectation.', tags: ['wrong-answer'], language: 'en' };
  const report = await server.request('/api/reports', { method: 'POST', body });
  assert.equal(report.status, 201);
  assert.equal((await server.request('/api/reports', { method: 'POST', body })).body.id, report.body.id);
  assert.equal((await server.request('/api/reports')).body.reports.length, 1);
  const other = await fetch(server.baseURL + '/api/health');
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await server.request('/api/reports', { cookie: otherCookie })).body.reports.length, 0);
  const ownSnapshotAttempt = await server.request('/api/reports', { method: 'POST', cookie: otherCookie, body: { ...body, clientKey: crypto.randomUUID() } });
  assert.equal(ownSnapshotAttempt.status, 404, 'Another session must not attach this question.');
  const manager = await managerFor(t, server);
  const discover = await manager.request('/api/knowledge/discover', {});
  assert.equal(discover.status, 409);
  assert.match(discover.body.error, /riot:preview/);
  const detail = await manager.request('/api/reports/' + report.body.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.content.description, body.description);
  assert.equal(detail.body.snapshot.question, question);
  assert.equal(detail.body.snapshot.response.recommendation, answer.recommendation);
  assert.equal((await manager.request('/api/reports/' + report.body.id, { status: 'triaged', note: 'Synthetic review note.' })).status, 200);
  assert.equal((await manager.request('/api/reports/' + report.body.id)).body.history.at(-1).status, 'triaged');
  assert.equal((await manager.request('/api/ai', { enabled: false })).status, 200);
  assert.equal((await server.request('/api/health')).body.aiEnabled, false);
  assert.equal((await manager.request('/api/status', null, { 'X-Forwarded-For': '127.0.0.1' })).status, 403);
  assert.equal((await server.request('/api/reports', { method: 'POST', body: { ...body, clientKey: crypto.randomUUID(), category: 'invalid' } })).status, 400);
});

test('documented encryption, 7/30/90-day purge and independent backup snapshots match the store', async t => {
  const server = await isolatedServer(t, []);
  const store = createStore(server.dataRoot);
  const db = new DatabaseSync(path.join(server.dataRoot, 'private/operations.sqlite'));
  server.addCleanup(() => { db.close(); store.close(); });
  const marker = 'Synthetic privacy test content, not user data.';
  const owner = store.hash('synthetic-session');
  const records = [8, 31, 1].map(age => {
    const req = store.beginQuestion(owner, crypto.randomUUID(), marker, store.hash(String(age)), {});
    store.finishQuestion(req.id, { status: 'done', recommendation: marker }, { repairQueries: [marker] });
    const rep = store.report(owner, { clientKey: crypto.randomUUID(), requestId: req.id, category: 'app', description: marker });
    return { age, req: req.id, rep: rep.id };
  });
  const raw = db.prepare('SELECT question,response,trace FROM requests LIMIT 1').get();
  assert.ok(Object.values(raw).every(value => !value.includes(marker)), 'Content is not stored as plaintext.');
  const day = 86400000;
  for (const record of records) db.prepare('UPDATE requests SET created=? WHERE id=?').run(Date.now() - record.age * day, record.req);
  db.prepare('UPDATE reports SET created=? WHERE id=?').run(Date.now() - 91 * day, records[1].rep);
  const backup = await store.makeBackup(); // purge runs before backup; operates only on the fixture
  const old = db.prepare('SELECT question,response,trace FROM requests WHERE id=?').get(records[0].req);
  assert.equal(old.question, null); assert.equal(old.response, null); assert.ok(old.trace);
  assert.equal(db.prepare('SELECT id FROM requests WHERE id=?').get(records[1].req), undefined);
  assert.ok(store.reportDetail(records[0].rep).snapshot.question === marker, '7-day cleanup does not erase a linked report copy.');
  assert.equal(db.prepare('SELECT id FROM reports WHERE id=?').get(records[1].rep), undefined);
  assert.equal(db.prepare('SELECT id FROM report_history WHERE report_id=?').get(records[1].rep), undefined);
  db.prepare('UPDATE reports SET created=? WHERE id=?').run(Date.now() - 91 * day, records[0].rep);
  store.purge();
  assert.equal(db.prepare('SELECT id FROM reports WHERE id=?').get(records[0].rep), undefined);
  const snapshot = new DatabaseSync(path.join(backup.folder, 'operations.sqlite'), { readOnly: true });
  try { assert.ok(snapshot.prepare('SELECT id FROM reports WHERE id=?').get(records[0].rep), 'Backup copies do not auto-purge.'); }
  finally { snapshot.close(); }
});
