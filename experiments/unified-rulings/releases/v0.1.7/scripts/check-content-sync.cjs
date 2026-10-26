// Targeted, isolated readiness verification requested for safe server startup. No paid/network source calls.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork, spawnSync } = require('node:child_process');
const { APP_ROOT, DATA_ROOT } = require('../src/paths');
const { createSyncStore } = require('../src/sync-store');
const { judgeCase } = require('../src/html-content');
const { stageRelease, activateRelease } = require('../src/knowledge-releases');
const { loadRelease, createKnowledgeProvider } = require('../src/knowledge-provider');
const { buildJudgeIndex, searchJudgeIndex } = require('../src/judge-index');
const passed = [];
async function check(name, task) { await task(); passed.push(name); }
async function main() {
  const fixture = await fs.mkdtemp(path.join(DATA_ROOT, 'tmp', 'content-readiness-'));
  await check('수정된 실행 파일 구문 검사', async () => {
    for (const directory of ['src', 'scripts']) for (const name of await fs.readdir(path.join(APP_ROOT, directory))) {
      if (!/\.(?:c?js|mjs)$/u.test(name)) continue;
      const result = spawnSync(process.execPath, ['--check', path.join(APP_ROOT, directory, name)], { windowsHide: true, encoding: 'utf8' });
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    }
  });
  let sample;
  await check('실제 사례의 본문·상태 추출과 ID 불일치 차단', async () => {
    const html = await fs.readFile(path.join(DATA_ROOT, 'tmp/auto-sync-inspect/judge.html'), 'utf8');
    sample = judgeCase(html, '13000', 'https://app.riftjudge.com/questions/13000');
    assert.ok(sample.bodyComplete && sample.answer.length > 100);
    assert.ok(['verified', 'unverified', 'unknown', 'under review', 'disputed', 'deprecated'].includes(sample.status));
    assert.throws(() => judgeCase(html, '1', 'https://app.riftjudge.com/questions/1'));
    assert.ok(!sample.answer.includes('Sign in to vote'));
  });
  await check('중단 후 이어받기·변경분·삭제 확인 재시도', () => {
    const root = path.join(fixture, 'queue'); let queue = createSyncStore(root);
    queue.sitemap([{ id: sample.id, url: sample.url, lastmod: 'a' }], 'one');
    queue.success(queue.pending(1)[0], sample, {}, 'body'); queue.close(); queue = createSyncStore(root);
    assert.equal(queue.cases().length, 1); assert.equal(queue.pending(10).length, 0);
    queue.sitemap([{ id: sample.id, url: sample.url, lastmod: 'b' }], 'two');
    assert.equal(queue.pending(10).length, 1);
    const row = queue.pending(1)[0];
    queue.failure(row, Object.assign(new Error('Source HTTP 404'), { status: 404 }));
    assert.equal(queue.cases()[0].sourceAvailability, 'available');
    queue.failure({ ...row, missing_count: 1, failures: 1 }, Object.assign(new Error('Source HTTP 404'), { status: 404 }));
    assert.equal(queue.cases()[0].sourceAvailability, 'removed'); assert.equal(queue.pending(10).length, 0);
    queue.close();
  });
  await check('로컬 전체 본문 검색·폐기 사례 제외', () => {
    const index = buildJudgeIndex([sample, { ...sample, id: 'removed', sourceAvailability: 'removed' }, { ...sample, id: 'deprecated', status: 'deprecated' }]);
    assert.equal(index.docs.length, 1);
    assert.equal(searchJudgeIndex(index, sample.question, sample.question, [])[0].id, sample.id);
  });
  const sync = createSyncStore(DATA_ROOT);
  const candidate = sync.document('official-candidate'); const cases = sync.cases(); sync.close();
  assert.ok(candidate?.rules && cases.length >= 80);
  const baseline = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'knowledge-releases/2026-10-20-fc50c8d53f9f/cards.json'), 'utf8'));
  const staged = await stageRelease(fixture, { rules: candidate.rules, cards: baseline, judgeCases: cases, sources: { riftjudge: { coverage: 'partial' } } });
  await activateRelease(fixture, staged.releaseId, 'legacy-unvalidated');
  await check('영한 전체 규칙·부모 문맥·누락 방지', async () => {
    const snapshot = await loadRelease(fixture, staged.releaseId);
    assert.equal(snapshot.evidence.length, 3487);
    assert.ok(snapshot.index.byId.get('core-rules:103.3.b').officialTextKo);
    assert.ok(snapshot.index.byId.get('tournament-rules:703.4.a.5.a').officialTextKo);
    assert.match(snapshot.index.byId.get('tournament-rules:703.4.c.5').officialTextEn, /703\.4\.a\.5.*Game Loss/u);
    assert.equal(snapshot.judgeCases.length, cases.length);
  });
  await check('손상된 자료 교체 거부·현재 자료 유지', async () => {
    const provider = createKnowledgeProvider(fixture); await provider.initialize();
    const snapshot = provider.current();
    const next = await stageRelease(fixture, { rules: candidate.rules, cards: baseline, judgeCases: cases });
    await fs.writeFile(path.join(fixture, 'knowledge-releases', next.releaseId, 'judge-cases.json'), '[]');
    await assert.rejects(activateRelease(fixture, next.releaseId, staged.releaseId));
    await provider.reload(); assert.equal(provider.current(), snapshot); provider.close();
  });
  let child, childError = '';
  try {
    await check('격리 앱 시작·카드 검색·비공개 경로 차단', async () => {
      child = fork(path.join(APP_ROOT, 'src/server.js'), [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, RIFTASSI_DATA_ROOT: fixture, PORT: '39531', PUBLIC_PORT: '39531', PUBLIC_ORIGIN: '',
          APP_RELEASE_ID: 'v0.1.3', OPENAI_GENERATION_ENABLED: 'false', OPENAI_API_KEY: '' } });
      child.stdout.on('data', () => {}); child.stderr.on('data', c => { childError = (childError + c).slice(-2000); });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Isolated startup timeout: ' + childError)), 25000);
        child.once('error', reject); child.once('exit', () => { clearTimeout(timeout); reject(new Error('Isolated app exited: ' + childError)); });
        child.on('message', m => { if (m.type === 'ready') { clearTimeout(timeout); resolve(); } });
      });
      const base = 'http://127.0.0.1:39531';
      const health = await (await fetch(base + '/api/health')).json();
      assert.equal(health.version, '0.1.3'); assert.equal(health.aiEnabled, false); assert.equal(health.knowledge.judgeCases, cases.length);
      const cards = await (await fetch(base + '/api/cards/search?q=' + encodeURIComponent('포로'))).json(); assert.ok(cards.results.length);
      for (const endpoint of ['/.env', '/api/knowledge', '/source-updates/content.sqlite']) assert.equal((await fetch(base + endpoint)).status, 404);
    });
  } finally {
    if (child && child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.send({ type: 'shutdown' });
    });
  }
  const result = { checkedAt: new Date().toISOString(), count: passed.length, passed, cases: cases.length, rules: candidate.rules.length,
    paidCalls: 0, productionAppStarted: false, productionTunnelStarted: false, fixture };
  await fs.writeFile(path.join(APP_ROOT, 'content-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
