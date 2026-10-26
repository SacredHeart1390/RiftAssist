// Explicit, local-only checks. Fixtures never use the production database or API key.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT, APP_ROOT } = require('../src/paths');
const { loadRelease, createKnowledgeProvider } = require('../src/knowledge-provider');
const { stageRelease, activateRelease } = require('../src/knowledge-releases');
const { search } = require('../src/retrieval');
const { createAppHost } = require('../src/app-host');
const passed = [];
async function check(name, work) { await work(); passed.push(name); }
async function main() {
  const fixture = await fs.mkdtemp(path.join(DATA_ROOT, 'tmp', 'release-check-'));
  const sourceId = process.argv[2];
  const source = path.join(DATA_ROOT, 'knowledge-releases', sourceId);
  await fs.mkdir(path.join(fixture, 'knowledge-releases'), { recursive: true });
  await fs.cp(source, path.join(fixture, 'knowledge-releases', sourceId), { recursive: true });
  const snapshot = await loadRelease(fixture, sourceId);
  await check('정상 자료의 해시와 구조', () => {
    assert.equal(snapshot.cardCatalog.cards.length, 1527);
    assert.ok(snapshot.index.byId.get('core-rules:103.3.b').officialTextEn.includes('3 copies'));
    assert.match(snapshot.index.byId.get('tournament-rules:703.4.a.5').officialTextEn, /Promotional cards/);
    assert.match(snapshot.index.byId.get('tournament-rules:703.4.c.5').officialTextEn, /703\.4\.a\.5.*Game Loss/);
  });
  const question = '상대의 폐기장에 이미 3장의 점멸이 있는 상태에서 상대가 4장째 점멸을 패에서 사용했습니다. 어떻게 대처해야 하나요?';
  await check('점멸 4장 질문과 기본 규칙 연결', () => {
    const result = search(snapshot.index, question, [{ modelReady: true, textEn: 'Move up to 2 friendly units to your base. Reaction.' }]);
    assert.ok(result.evidence.some(i => i.id === 'core-rules:103.3.b'));
    assert.ok(result.intent.deckConstruction); assert.equal(result.intent.needsCardText, false);
    assert.equal(result.trace.missingRequired.length, 0);
    assert.ok(result.evidence.length <= 8);
    assert.ok(result.evidence.find(i => i.id === 'core-rules:103.3.b').parentContext.length);
  });
  await check('명시 조항·대회 절차·카드 효과 구분', () => {
    assert.ok(search(snapshot.index, '코어룰 103.3b가 적용되나요?').evidence.some(i => i.id === 'core-rules:103.3.b'));
    const event = search(snapshot.index, '공식 대회입니다. ' + question);
    assert.ok(event.evidence.some(i => i.id === 'tournament-rules:703.4.e'));
    assert.equal(event.trace.missingRequired.length, 0);
    assert.equal(search(snapshot.index, '쌍권총 난사에 추가 힘 10개를 지불할 때 반항으로 무효화할 수 있나요?').intent.needsCardText, true);
  });
  await activateRelease(fixture, sourceId, 'legacy-unvalidated', { acknowledgeReview: true });
  const provider = createKnowledgeProvider(fixture);
  await provider.initialize();
  try {
    const oldSnapshot = provider.current();
    const cards = JSON.parse(await fs.readFile(path.join(source, 'cards.json'), 'utf8'));
    const next = await stageRelease(fixture, { rules: snapshot.evidence, cards: { ...cards, version: 'fixture-new-version' }, reviewRequired: true });
    await check('검토·경합 차단과 요청별 자료 유지', async () => {
      await assert.rejects(activateRelease(fixture, next.releaseId, sourceId));
      await assert.rejects(activateRelease(fixture, next.releaseId, 'wrong-version', { acknowledgeReview: true }));
      await activateRelease(fixture, next.releaseId, sourceId, { acknowledgeReview: true });
      await provider.reload();
      assert.equal(provider.current().releaseId, next.releaseId);
      assert.equal(oldSnapshot.releaseId, sourceId);
    });
    await check('손상 자료 거절·정상 자료 유지·복구', async () => {
      const damaged = path.join(fixture, 'knowledge-releases', sourceId, 'cards.json');
      const original = await fs.readFile(damaged);
      await fs.writeFile(damaged, '{}');
      await assert.rejects(activateRelease(fixture, sourceId, next.releaseId, { acknowledgeReview: true }));
      await fs.writeFile(path.join(fixture, 'knowledge-releases', 'active.json'), JSON.stringify({ releaseId: sourceId }));
      await provider.reload();
      assert.equal(provider.current().releaseId, next.releaseId);
      assert.ok(provider.status().lastError);
      await fs.writeFile(damaged, original);
      await provider.reload();
      assert.equal(provider.current().releaseId, sourceId);
      assert.equal(provider.status().lastError, null);
    });
  } finally { provider.close(); }
  const host = createAppHost({ root: fixture, port: 39521, workerPorts: [39522, 39523] });
  const base = 'http://127.0.0.1:39521';
  const stub = `const http=require('node:http');const id=process.env.APP_RELEASE_ID;
    const s=http.createServer((q,r)=>{r.setHeader('content-type','application/json');if(q.url==='/api/health')return r.end(JSON.stringify({appReleaseId:id,knowledge:{releaseId:'fixture'},indexedRuleCount:1}));
    setTimeout(()=>r.end(JSON.stringify({release:id})),q.url==='/slow'?1800:0);});s.listen(process.env.PORT,'127.0.0.1',()=>process.send({type:'ready'}));
    process.on('message',m=>{if(m.type==='shutdown')s.close(()=>process.exit(0));if(m.type==='set-public-origin')process.send({type:'public-origin-set',origin:m.origin});});`;
  for (const id of ['fixture-a', 'fixture-b', 'fixture-fails']) {
    const directory = path.join(fixture, 'releases', id);
    await fs.mkdir(path.join(directory, 'src'), { recursive: true });
    await fs.writeFile(path.join(directory, 'app-release.json'), JSON.stringify({ releaseId: id, dataSchema: 2, ready: true }));
    await fs.writeFile(path.join(directory, 'src', 'server.js'), id === 'fixture-fails' ? 'process.exit(1);' : stub);
  }
  try {
    await host.deploy('fixture-a');
    await check('진행 중 응답 유지와 새 앱 전환', async () => {
      const slow = fetch(base + '/slow').then(r => r.json());
      const deadline = Date.now() + 3000;
      while (!host.status().activeRequests && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
      assert.equal(host.status().activeRequests, 1);
      const switchPromise = host.deploy('fixture-b');
      assert.equal((await slow).release, 'fixture-a');
      await switchPromise;
      assert.equal((await (await fetch(base + '/')).json()).release, 'fixture-b');
    });
    await check('실패한 앱 전환 시 기존 앱 유지', async () => {
      await assert.rejects(host.deploy('fixture-fails'));
      assert.equal((await (await fetch(base + '/')).json()).release, 'fixture-b');
    });
    await check('공개 주소 전달', () => host.setPublicOrigin('https://example.invalid'));
  } finally { await host.stop(); }
  // Actual server in a completely separate directory; AI generation is forcibly disabled.
  const actual = path.join(fixture, 'releases', 'actual');
  await fs.mkdir(actual, { recursive: true });
  for (const name of ['src', 'public']) await fs.cp(path.join(APP_ROOT, name), path.join(actual, name), { recursive: true });
  await fs.writeFile(path.join(actual, 'app-release.json'), JSON.stringify({ releaseId: 'actual', dataSchema: 2, ready: true }));
  const originalEnabled = process.env.OPENAI_GENERATION_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_GENERATION_ENABLED = 'false'; delete process.env.OPENAI_API_KEY;
  const realHost = createAppHost({ root: fixture, port: 39521, workerPorts: [39522, 39523] });
  try {
    await realHost.deploy('actual');
    await check('실제 앱·카드검색·하단 안내', async () => {
      const health = await (await fetch(base + '/api/health')).json();
      assert.equal(health.version, '0.1.2'); assert.equal(health.aiEnabled, false);
      assert.equal(health.knowledge.releaseId, sourceId);
      const cardsResult = await (await fetch(base + '/api/cards/search?q=' + encodeURIComponent('점멸'))).json();
      assert.ok(cardsResult.results.length > 0);
      const html = await (await fetch(base + '/')).text();
      assert.ok(html.includes('app-r2.js'));
      assert.ok(html.includes('footerDisclaimer'));
    });
    await check('관리·비밀 파일 미공개와 다른 사이트 요청 차단', async () => {
      for (const endpoint of ['/.env', '/private/storage.key', '/api/knowledge', '/api/status']) assert.equal((await fetch(base + endpoint)).status, 404);
      const response = await fetch(base + '/api/ask', { method: 'POST', headers: { Origin: 'https://bad.invalid', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 403);
    });
  } finally {
    await realHost.stop();
    if (originalEnabled === undefined) delete process.env.OPENAI_GENERATION_ENABLED; else process.env.OPENAI_GENERATION_ENABLED = originalEnabled;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
  const report = { checkedAt: new Date().toISOString(), passed, count: passed.length, paidCalls: 0, productionDbTouched: false, fixture };
  await fs.writeFile(path.join(APP_ROOT, 'verification-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
