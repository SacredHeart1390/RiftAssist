const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isolatedServer, fixture, release, syntheticPermittedCards } = require('./helpers/isolated-server.cjs');
const { createCardAccess } = require(path.join(release, 'src/card-access.js'));
const { normalizeCatalog } = require(path.join(release, 'src/cards.js'));
const { createStore } = require(path.join(release, 'src/operations-store.js'));
const { createSourceTranslations } = require(path.join(release, 'src/source-translations.js'));
const terminology = require(path.join(release, 'src/terminology-ko.js'));
const { createKnowledgeProvider } = require(path.join(release, 'src/knowledge-provider.js'));

const question = '같은 턴에 한 전장에서 점거로 득점한 뒤 다시 정복하면 추가 점수를 얻나요?';
const answer = { recommendation: '한 턴에 같은 전장에서 한 번만 득점합니다.',
  resolutionSteps: ['이번 턴 득점 여부를 확인합니다.', '동일한 전장에서 추가로 득점하지 않습니다.'],
  reasoning: '코어룰 472의 전장당 턴별 득점 제한에 따릅니다.', confidence: 'medium',
  evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] }, followUpQuestions: [],
  citedRuleIds: ['core-rules:472'], citedCaseIds: [], citedCardIds: [], caseTitles: [], caseComparisons: [], requiresJudge: false };
const withheldMarker = 'SYNTHETIC_WITHHELD_CARD_CONTENT';
function communityCards() {
  return { ...fixture.cards, cards: fixture.cards.cards.map(card => ({ ...card, textEn: withheldMarker,
    textKo: '합성 비공개 번역', permissions: { display: false, modelInput: false }, textVerified: false,
  })) };
}
function original(cards) { return { releaseId: 'test-release', cardCatalog: normalizeCatalog(cards) }; }
async function ownSession(server) {
  const res = await server.request('/api/health', { cookie: '' });
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const id = cookie.slice(cookie.indexOf('=') + 1).split('.')[0];
  return { cookie, owner: crypto.createHash('sha256').update(id).digest('hex') };
}

test('policy defaults/invalid modes deny all, and verified mode ignores prototype exceptions without mutating data', () => {
  const data = communityCards(), before = JSON.stringify(data), raw = original(data);
  for (const mode of [undefined, '', 'restricted', 'invalid-mode', 'true']) {
    const access = createCardAccess(mode), view = access.snapshot(raw);
    assert.equal(view.cardCatalog.cards.length, 0);
    assert.equal(view.cardAccess.mode, 'restricted');
    assert.equal(access.snapshot(raw), view, 'Reuse the per-release projection.');
  }
  assert.equal(createCardAccess('verified-only', { allowMock: true }).snapshot(raw).cardCatalog.cards.length, 0);
  const permitted = syntheticPermittedCards();
  permitted.cards[1].permissions.modelInput = false;
  permitted.cards[2].status = 'withdrawn';
  const access = createCardAccess('verified-only', { allowMock: true }), view = access.snapshot(original(permitted));
  assert.equal(view.cardCatalog.cards.length, 2);
  assert.equal(view.cardCatalog.cards[0].modelReady, true);
  assert.equal(view.cardCatalog.cards[1].modelReady, false);
  assert.equal(JSON.stringify(data), before);
  assert.equal(raw.cardCatalog.cards.length, 3);
});

for (const mode of [null, 'verified-only', 'invalid-mode']) {
  test(`unconfirmed cards stay out of search/detail/resolve/AI while references and reports work (${mode ?? 'unset'})`, async t => {
    const server = await isolatedServer(t, [], { cardPolicy: mode, cards: communityCards() });
    const health = await server.request('/api/health');
    assert.equal(health.body.cardCatalog.total, 0);
    assert.equal(health.body.cardCatalog.access.retainedTotal, 3);
    const browse = await server.request('/api/cards/search?browse=1');
    assert.equal(browse.status, 200); assert.deepEqual(browse.body.results, []);
    const id = fixture.cards.cards[0].id;
    assert.equal((await server.request('/api/cards/' + encodeURIComponent(id))).status, 404);
    const text = fixture.cards.cards[0].nameKo + '를 사용한 뒤 ' + question;
    const resolved = await server.request('/api/cards/resolve', { method: 'POST', body: {
      question: text, cardIds: [id], rememberedCardIds: [id], excludedCardIds: [id],
    } });
    assert.equal(resolved.status, 200); assert.equal(resolved.body.restricted, true);
    assert.deepEqual(resolved.body.cards, []); assert.deepEqual(resolved.body.references, []);
    assert.deepEqual(resolved.body.unresolved, []);
    for (const cardIds of [[], [id]]) {
      const res = await server.request('/api/ask', { method: 'POST', body: {
        clientKey: crypto.randomUUID(), question: text, language: 'ko', cardIds, excludedCardIds: [id],
      } });
      assert.equal(res.status, 200); assert.equal(res.body.status, 'card-access-restricted');
      assert.deepEqual(res.body.cards, []); assert.equal(res.body.ai.used, false);
      assert.ok(res.body.evidence.some(rule => rule.id === 'core-rules:472'));
      assert.ok(!JSON.stringify(res.body).includes(withheldMarker));
      const report = await server.request('/api/reports', { method: 'POST', body: {
        clientKey: crypto.randomUUID(), category: 'app', description: 'Synthetic restricted-mode report.', requestId: res.body.requestId,
      } });
      assert.equal(report.status, 201);
    }
    assert.equal(server.externalCalls.length, 0);
    assert.ok(server.judgeCalls.length > 0, 'External case-search fallback is preserved.');
    assert.ok(!JSON.stringify(server.judgeCalls).includes(withheldMarker));
    assert.equal((await server.request('/api/cards/resolve', { method: 'POST', body: { question: text, excludedCardIds: 'bad' } })).status, 400);
  });
}

test('verified cards retain search/selection/model input; display-only cards never become model input', async t => {
  const cards = syntheticPermittedCards();
  cards.cards[1].permissions.modelInput = false;
  cards.cards[2] = communityCards().cards[2];
  const server = await isolatedServer(t, [{ ruling: answer }], { cards });
  const listed = await server.request('/api/cards/search?browse=1');
  assert.equal(listed.body.total, 2); assert.equal(listed.body.modelReady, 1);
  assert.ok(!JSON.stringify(listed.body).includes(withheldMarker));
  const ready = cards.cards[0], displayOnly = cards.cards[1];
  const res = await server.ask(`${ready.nameKo}를 사용한 뒤 ${question}`, [ready.id]);
  assert.equal(res.body.status, 'ruling-generated');
  assert.equal(server.externalCalls.length, 1);
  const prompt = server.externalCalls[0].input.find(msg => msg.role === 'user').content.find(part => part.type === 'input_text').text;
  const supplied = JSON.parse(prompt.split('User-selected cards, resolved by the server from a versioned catalog:\n')[1].split('\n\nRetrieved official')[0]);
  assert.equal(supplied.find(card => card.id === ready.id).textEn, ready.textEn.trim());
  const paused = await server.ask(`${displayOnly.nameKo}를 사용한 뒤 ${question}`, [displayOnly.id]);
  assert.equal(paused.body.ai.used, false); assert.equal(paused.body.status, 'card-details-needed');
  assert.equal(server.externalCalls.length, 1);
});

test('general rule AI and local cases survive the default restriction; source translation excludes the hidden glossary', async t => {
  const cases = [1, 2, 3].map(id => ({ id: String(id), url: `https://app.riftjudge.com/questions/${id}`,
    question: 'Can Retreat affect scoring again on the same battlefield in the same turn?',
    answer: 'A player scores once per battlefield per turn. Already scored by holding or conquering.',
    bodyComplete: true, status: 'verified', sourceAvailability: 'available', rulesVersion: 'test' }));
  const translation = { title: '합성 번역 제목', question: '합성 질문', answer: '합성 답변', body: '' };
  const server = await isolatedServer(t, [{ ruling: answer }, { ruling: translation }], { cardPolicy: null, cards: communityCards(), judgeCases: cases });
  const res = await server.ask(question);
  assert.equal(res.body.status, 'ruling-generated'); assert.equal(res.body.cards.length, 0);
  assert.ok(res.body.judgeCases.length >= 3);
  assert.equal(server.judgeCalls.length, 0, 'Complete local cases avoid remote fallback.');
  const item = res.body.judgeCases[0];
  const translated = await server.request('/api/sources/translate', { method: 'POST', body: {
    requestId: res.body.requestId, key: item.localization.key, kind: 'case', id: item.id,
  } });
  assert.equal(translated.status, 200); assert.equal(translated.body.translation.title, translation.title);
  const input = JSON.parse(server.externalCalls[1].input.find(msg => msg.role === 'user').content);
  assert.deepEqual(input.cardNameGlossary, []);
  assert.ok(!JSON.stringify(server.externalCalls).includes(withheldMarker));
});

test('old idempotency responses are rejected without altering records; current retries still reuse one answer', async t => {
  const server = await isolatedServer(t, [{ ruling: answer }], { cardPolicy: null, cards: communityCards() });
  const session = await ownSession(server), store = createStore(server.dataRoot);
  server.addCleanup(() => store.close());
  const oldKey = crypto.randomUUID();
  const oldFingerprint = store.hash(JSON.stringify({ question, language: 'ko', cardIds: [], image: null }));
  const row = store.beginQuestion(session.owner, oldKey, question, oldFingerprint, {});
  store.finishQuestion(row.id, { status: 'ruling-generated', recommendation: withheldMarker, cards: communityCards().cards }, {});
  const before = store.getQuestion(row.id, session.owner);
  const replay = await server.request('/api/ask', { method: 'POST', cookie: session.cookie,
    body: { clientKey: oldKey, question, language: 'ko', cardIds: [] } });
  assert.equal(replay.status, 409); assert.ok(!JSON.stringify(replay.body).includes(withheldMarker));
  assert.deepEqual(store.getQuestion(row.id, session.owner), before);
  const body = { clientKey: crypto.randomUUID(), question, language: 'ko', cardIds: [] };
  const first = await server.request('/api/ask', { method: 'POST', body });
  const second = await server.request('/api/ask', { method: 'POST', body });
  assert.equal(first.body.status, 'ruling-generated'); assert.equal(second.body.requestId, first.body.requestId);
  assert.equal(server.externalCalls.length, 1);
});

test('historical translation keys containing unconfirmed card glossaries are denied without paid calls', async t => {
  const server = await isolatedServer(t, [], { cardPolicy: null, cards: communityCards() });
  const session = await ownSession(server), store = createStore(server.dataRoot);
  server.addCleanup(() => store.close());
  const item = { id: 'old-case', question: 'Retreat and scoring?', answer: 'A public synthetic source.', url: 'https://app.riftjudge.com/questions/1', rulesVersion: 'test' };
  const translations = createSourceTranslations({ root: server.dataRoot, model: 'regression-mocked-model',
    getTerminology: () => terminology.glossary(fixture.rules) });
  const previous = await translations.prepare('case', item, [{ en: 'Retreat', ko: '합성 제한 번역' }]);
  const row = store.beginQuestion(session.owner, crypto.randomUUID(), question, store.hash('old'), {});
  store.finishQuestion(row.id, { status: 'done', judgeCases: [{ ...item, localization: previous }] }, {});
  const res = await server.request('/api/sources/translate', { method: 'POST', cookie: session.cookie,
    body: { requestId: row.id, kind: 'case', id: item.id, key: previous.key } });
  assert.equal(res.status, 403); assert.equal(res.body.code, 'source_permissions_changed');
  assert.equal(server.externalCalls.length, 0);
});

test('knowledge-release reload creates a new policy view and invalidates the previous response scope', async t => {
  const server = await isolatedServer(t, [], { cards: communityCards() });
  const provider = createKnowledgeProvider(server.dataRoot);
  await provider.initialize(); server.addCleanup(() => provider.close());
  const access = createCardAccess('verified-only', { allowMock: true }), initial = access.snapshot(provider.current());
  const dir = path.join(server.dataRoot, 'knowledge-releases/synthetic-next');
  await fs.mkdir(dir);
  const hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': fixture.rules, 'cards.json': syntheticPermittedCards(), 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(dir, name), bytes);
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, compatibleSchema: 2, validationStatus: 'validated', releaseId: 'synthetic-next', hashes }));
  await fs.writeFile(path.join(server.dataRoot, 'knowledge-releases/active.json'), JSON.stringify({ releaseId: 'synthetic-next' }));
  await provider.reload();
  const next = access.snapshot(provider.current());
  assert.equal(initial.cardCatalog.cards.length, 0); assert.equal(next.cardCatalog.cards.length, 3);
  assert.notEqual(initial.cardCacheScope, next.cardCacheScope);
  assert.equal(initial.rawCardCatalog.cards.length, 3, 'Old in-flight snapshot remains intact.');
});
