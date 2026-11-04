const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { release, fixture, isolatedServer } = require('./helpers/isolated-server.cjs');
const { convertCatalog } = require(path.join(release, 'src/riot-converter'));
const { normalizeCatalog, searchCards } = require(path.join(release, 'src/cards'));
const { createRiotAdapter } = require(path.join(release, 'src/riot-adapter'));
const { createTranslationStore } = require(path.join(release, 'src/card-translation-store'));
const { createCardTranslationEngine, createTranslationProvider, reviewTranslation } = require(path.join(release, 'src/card-translation'));
const { buildGlossary, englishSource, hash } = require(path.join(release, 'src/card-translation-core'));
const { createCardAccess } = require(path.join(release, 'src/card-access'));
const { stageTranslationCandidate } = require(path.join(release, 'src/card-translation-candidates'));
const { loadRelease } = require(path.join(release, 'src/knowledge-provider'));
const { activateRelease } = require(path.join(release, 'src/knowledge-releases'));
const originalFetch = globalThis.fetch, unplannedNetwork = [];
test.before(() => { globalThis.fetch = async () => { unplannedNetwork.push(true); throw new Error('Real external calls are disabled in translation tests.'); }; });
test.after(() => { globalThis.fetch = originalFetch; assert.equal(unplannedNetwork.length, 0); });

// Entirely invented cards and simulated official-locale metadata. No real API,
// RiftNaru card content, operational DB, or real license is used in these tests.
function catalog(options = {}) {
  const origin = options.origin || 'mock';
  return convertCatalog({ schema: 'riftassist-canonical-1', origin, version: options.version || 'synthetic-v1', mappingVersion: 'synthetic-mapper',
    sourceUrl: origin === 'mock' ? 'https://example.invalid/synthetic' : 'https://test.api.riotgames.com/synthetic',
    cards: [{ id: 'training', englishName: 'Training Spell', englishText: '[Action] Pay 2 [E] to draw 1 card.',
      keywords: ['Action'], cost: { energy: 2, symbols: ['[E]'] }, stats: { might: 3 }, releaseStatus: 'released', officialKoreanStatus: 'absent', ...options.card }] },
  { permissions: { display: true, modelInput: true, translation: true, ...options.permissions } });
}
function glossary() {
  const card = catalog({ origin: 'riot-api', card: { id: 'glossary', englishName: 'Glossary Fixture', englishText: 'Action.', officialKoreanText: '행동.', officialKoreanKeywords: ['행동'] } }).cards[0];
  return buildGlossary({ officialCards: [card], mappings: [{ cardId: card.id, en: 'Action', ko: '행동', kind: 'keyword', reviewReference: 'synthetic-glossary-review' }] });
}
function output(request, texts = ['[Action] [E] 2를 지불하고 카드 1장을 뽑습니다.']) {
  return { nameKo: '훈련 주문', clauses: request.clauses.map((row, i) => ({ id: row.id, textKo: texts[i] })),
    keywordsKo: request.source.keywords.map(en => ({ en, ko: request.glossary.find(t => t.en === en)?.ko || '시험 키워드' })),
    cost: structuredClone(request.source.cost), stats: structuredClone(request.source.stats), symbols: [...request.source.symbols], uncertainties: [] };
}
async function sandbox(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-translation-test-'));
  await fs.writeFile(path.join(root, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.2.0', environment: 'development' }));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function engineFor(t, { generate = request => output(request), providerMode = 'mock', providerModel = 'synthetic-model', ...settings } = {}) {
  const root = await sandbox(t), store = await createTranslationStore(root);
  const calls = [];
  const provider = createTranslationProvider({ id: 'synthetic-provider', model: providerModel, mode: providerMode,
    enabled: true, approvalReference: 'synthetic-test-only', generate: async (request, options) => { calls.push(request); return generate(request, options); } });
  const engine = createCardTranslationEngine({ store, provider, glossary: glossary(), maxNewCalls: 20, ...settings });
  return { root, store, provider, engine, calls };
}
function approve(card, options = {}) {
  return reviewTranslation(card, { proposalId: card.translationProposal.id, expectedEnglishHash: hash(englishSource(card)),
    reviewReference: 'synthetic-human-review', acknowledgeWarnings: card.translationProposal.validation.issues.map(i => i.code), ...options });
}

test('translation is a candidate: separates mechanics and provenance and requires explicit review', async t => {
  const { engine, calls } = await engineFor(t), original = catalog(), bytes = JSON.stringify(original);
  const candidate = await engine.proposeCatalog(original), card = candidate.catalog.cards[0], record = card.translationProposal;
  assert.equal(record.validation.status, 'checks-passed'); assert.equal(record.review.status, 'pending');
  assert.equal(record.authority, 'mock'); assert.equal(record.model, 'synthetic-model');
  assert.ok(Number.isFinite(Date.parse(record.generatedAt))); assert.equal(record.sourceVersion, 'synthetic-v1');
  assert.equal(record.englishHash, hash(englishSource(card))); assert.equal(card.textKo, '');
  assert.equal(card.textEn, original.cards[0].textEn); assert.deepEqual(card.cost, original.cards[0].cost);
  assert.deepEqual(card.stats, original.cards[0].stats); assert.deepEqual(calls[0].source.symbols, ['[Action]', '[E]']);
  assert.equal(JSON.stringify(original), bytes, 'Never mutate the source catalog.');
  const reviewed = approve(card); assert.equal(reviewed.textKo, record.textKo); assert.equal(reviewed.translationStatus, 'mock');
  assert.equal(reviewed.translationRecord.review.status, 'approved');
  assert.throws(() => approve(card, { expectedEnglishHash: 'stale' }), /current candidate/);
});

test('official Korean takes precedence without any provider call; locale version mismatch never falls back to AI', async t => {
  const { engine, calls } = await engineFor(t, { generate: () => { throw new Error('must not be called'); } });
  const source = catalog({ origin: 'riot-api', permissions: { translation: false, modelInput: false }, card: {
    officialKoreanName: '합성 공식 이름', officialKoreanText: '합성 공식 한국어 원문', officialKoreanKeywords: ['행동'],
  } });
  const result = await engine.translateCard(source.cards[0]);
  assert.equal(result.record.authority, 'official'); assert.equal(result.record.textKo, '합성 공식 한국어 원문');
  assert.equal(result.record.provider, 'riot-api'); assert.equal(result.record.model, null); assert.equal(result.record.generatedAt, null);
  const mismatched = catalog({ origin: 'riot-api', card: { officialKoreanText: '합성 공식 원문', officialKoreanEnglishVersion: 'older-english' } });
  const stale = await engine.translateCard(mismatched.cards[0]);
  assert.equal(stale.record.validation.status, 'blocked'); assert.equal(stale.record.authority, 'official');
  assert.equal(calls.length, 0);
});

test('official locale availability must be confirmed, and injected lookups prefer official text without AI', async t => {
  const input = catalog({ origin: 'riot-api', card: { officialKoreanStatus: undefined } });
  const unknown = await engineFor(t);
  assert.equal((await unknown.engine.translateCard(input.cards[0])).record.validation.issues[0].code, 'official-korean-availability-unknown');
  assert.equal(unknown.calls.length, 0);
  let lookups = 0;
  const lookup = await engineFor(t, { officialLookup: async request => { lookups++; return {
    status: 'available', sourceKind: 'riot-api', englishVersion: request.englishVersion, version: 'synthetic-ko-v1',
    url: 'https://test.api.riotgames.com/synthetic-ko', name: '합성 공식 이름',
    text: '[Action] [E] 2를 지불하고 카드 1장을 뽑습니다.', keywords: ['행동'],
  }; } });
  const result = await lookup.engine.proposeCatalog(input);
  assert.equal(lookups, 1); assert.equal(lookup.calls.length, 0);
  assert.equal(result.catalog.cards[0].translationProposal.authority, 'official');
  assert.equal(result.catalog.cards[0].officialKorean.version, 'synthetic-ko-v1');
  assert.equal(result.review.rows[0].officialKoreanCheck.status, 'available');
  const failed = await engineFor(t, { officialLookup: async () => { throw new Error('SYNTHETIC_LOOKUP_ERROR'); } });
  assert.equal((await failed.engine.translateCard(input.cards[0])).record.validation.issues[0].code, 'official-korean-lookup-failed');
  assert.equal(failed.calls.length, 0);
});

test('official labels and glossary evidence reject unconfirmed Korean-source URLs', async t => {
  const { engine, calls } = await engineFor(t);
  const source = catalog({ origin: 'riot-api', card: { officialKoreanText: '합성 공식 주장' } });
  source.cards[0].officialKorean.url = 'https://fan.example.invalid/korean';
  assert.equal((await engine.translateCard(source.cards[0])).record.validation.issues[0].code, 'official-korean-source-unconfirmed');
  assert.equal(calls.length, 0);
  assert.throws(() => buildGlossary({ officialCards: source.cards, mappings: [{ cardId: source.cards[0].id, en: 'Action', ko: '합성', kind: 'keyword', reviewReference: 'synthetic-review' }] }), /official-card evidence/);
  assert.deepEqual(buildGlossary({ officialCards: source.cards }).styleExamples, []);
});

test('explicit absent-locale lookup permits a candidate; fan-source locale claims are rejected', async t => {
  const input = catalog({ origin: 'riot-api', card: { officialKoreanStatus: undefined } });
  const absent = await engineFor(t, { officialLookup: async request => ({ status: 'absent', sourceKind: 'riot-api', englishVersion: request.englishVersion, url: 'https://test.api.riotgames.com/synthetic-ko' }) });
  assert.equal((await absent.engine.translateCard(input.cards[0])).record.validation.status, 'checks-passed'); assert.equal(absent.calls.length, 1);
  const fan = await engineFor(t, { officialLookup: async request => ({ status: 'available', sourceKind: 'riot-api', englishVersion: request.englishVersion, url: 'https://fan.example.invalid/ko', text: '합성 텍스트', version: 'test' }) });
  assert.equal((await fan.engine.translateCard(input.cards[0])).record.validation.issues[0].code, 'official-korean-availability-unknown'); assert.equal(fan.calls.length, 0);
});

test('official-card terms require evidence and override rule headings; unofficial sources cannot seed the official glossary', () => {
  const official = catalog({ origin: 'riot-api', card: { englishText: 'Action.', officialKoreanText: '행동.' } }).cards[0];
  const rule = { id: 'core-rules:synthetic', ruleId: 'synthetic', officialTextEn: 'Action', officialTextKo: '시험 규칙 용어', languageAlignment: 'matching-document-dates' };
  const built = buildGlossary({ rules: [rule], officialCards: [official], mappings: [{ cardId: official.id, en: 'Action', ko: '행동', kind: 'keyword', reviewReference: 'fixture-review' }] });
  assert.equal(built.entries.find(t => t.en === 'Action').authority, 'official-card');
  assert.equal(built.entries.find(t => t.en === 'Action').ko, '행동');
  assert.throws(() => buildGlossary({ officialCards: catalog().cards, mappings: [{ cardId: 'mock:training', en: 'Action', ko: '행동', kind: 'keyword', reviewReference: 'test' }] }), /official-card evidence/);
});

test('persistent cache survives engine restart and source-version-only changes without retranslating', async t => {
  const { root, engine, provider, calls } = await engineFor(t);
  const first = await engine.translateCard(catalog().cards[0]);
  const restarted = createCardTranslationEngine({ store: await createTranslationStore(root), provider, glossary: glossary() });
  const second = await restarted.translateCard(catalog({ version: 'synthetic-v2' }).cards[0]);
  assert.equal(calls.length, 1); assert.equal(second.cacheHit, true);
  assert.equal(second.record.generatedAt, first.record.generatedAt); assert.equal(second.record.sourceVersion, 'synthetic-v1');
  assert.equal(second.record.appliedToVersion, 'synthetic-v2'); assert.equal(second.record.id, first.record.id);
});

test('partial official names/keywords override AI fields and reuse the cached effect without a new call', async t => {
  const { engine, calls } = await engineFor(t, { providerMode: 'operator-adapter' });
  const first = await engine.translateCard(catalog({ origin: 'riot-api' }).cards[0]);
  const partial = catalog({ origin: 'riot-api', version: 'synthetic-v2', card: { officialKoreanName: '합성 공식 이름', officialKoreanKeywords: ['공식 행동'] } });
  const result = await engine.translateCard(partial.cards[0]);
  assert.equal(calls.length, 1); assert.equal(result.cacheHit, true);
  assert.equal(result.record.nameKo, '합성 공식 이름'); assert.equal(result.record.keywordsKo[0].ko, '공식 행동');
  assert.equal(result.record.textKo, first.record.textKo); assert.equal(result.record.authority, 'ai');
  assert.equal(result.record.fieldSources.name, 'official'); assert.equal(result.record.fieldSources.effect, 'ai');
  assert.equal(result.record.officialSource.version, 'synthetic-v2'); assert.equal(result.record.sourceVersion, 'synthetic-v1');
  assert.equal(result.record.validation.status, 'checks-passed');
});

test('official-source anomalies remain official candidates for review, never rewritten or sent to AI', async t => {
  const { engine, calls } = await engineFor(t);
  const original = catalog({ origin: 'riot-api', card: { officialKoreanText: '합성 공식 숫자 999', officialKoreanKeywords: ['행동'] } });
  const result = await engine.proposeCatalog(original), record = result.catalog.cards[0].translationProposal;
  assert.equal(record.authority, 'official'); assert.equal(record.textKo, '합성 공식 숫자 999'); assert.equal(calls.length, 0);
  assert.equal(record.validation.status, 'needs-review'); assert.ok(record.validation.issues.some(i => i.code === 'official-number-check'));
  assert.throws(() => approve(result.catalog.cards[0], { acknowledgeWarnings: [] }), /acknowledgement/);
});

test('same-source concurrent engines use one cache reservation; model/source/glossary changes invalidate it', async t => {
  const { root, store, provider, calls } = await engineFor(t, { generate: async request => { await new Promise(resolve => setTimeout(resolve, 50)); return output(request); } });
  const engines = [store, await createTranslationStore(root)].map(s => createCardTranslationEngine({ store: s, provider, glossary: glossary() }));
  const results = await Promise.all(engines.map(engine => engine.translateCard(catalog().cards[0])));
  assert.equal(calls.length, 1); assert.equal(results.filter(r => r.cacheHit).length, 1);
  const changed = catalog({ card: { englishText: '[Action] Pay 2 [E] to draw 2 cards.' } });
  await engines[0].translateCard(changed.cards[0]); assert.equal(calls.length, 2);
  const different = createTranslationProvider({ ...provider, model: 'synthetic-model-2' });
  await createCardTranslationEngine({ store, provider: different, glossary: glossary() }).translateCard(catalog().cards[0]);
  assert.equal(calls.length, 3);
  await createCardTranslationEngine({ store, provider, glossary: buildGlossary() }).translateCard(catalog().cards[0]);
  assert.equal(calls.length, 4);
});

test('provider failures are sanitized and cached; timeout and corrupt cache never trigger automatic retry', async t => {
  const { root, engine, calls, store, provider } = await engineFor(t, { generate: () => { throw new Error('SYNTHETIC_ERROR_BODY_DO_NOT_PERSIST'); } });
  const card = catalog().cards[0], one = await engine.translateCard(card), two = await engine.translateCard(card);
  assert.equal(one.record.validation.status, 'failed'); assert.equal(two.cacheHit, true); assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(one).includes('SYNTHETIC_ERROR_BODY_DO_NOT_PERSIST'));
  const cache = path.join(root, 'card-translations/cache');
  await fs.writeFile(path.join(cache, (await fs.readdir(cache))[0]), '{broken');
  const corrupt = await createCardTranslationEngine({ store, provider, glossary: glossary() }).translateCard(card);
  assert.equal(corrupt.record.validation.issues[0].code, 'translation-cache-invalid'); assert.equal(calls.length, 1);
  let aborted = false;
  const timeout = await engineFor(t, { timeoutMs: 20, generate: (_request, { signal }) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); }) });
  assert.equal((await timeout.engine.translateCard(card)).record.validation.issues[0].code, 'translation-timeout'); assert.equal(aborted, true);
});

test('cache publication failure retains its reservation and prevents a second provider attempt', async t => {
  const { root, provider, calls } = await engineFor(t);
  const store = await createTranslationStore(root, { waitMs: 0 });
  const engine = createCardTranslationEngine({ store, provider, glossary: glossary() });
  const original = fs.link;
  fs.link = async () => { throw new Error('Synthetic cache publication failure.'); };
  try { assert.equal((await engine.translateCard(catalog().cards[0])).record.validation.status, 'failed'); }
  finally { fs.link = original; }
  const again = await engine.translateCard(catalog().cards[0]);
  assert.equal(again.record.validation.issues[0].code, 'translation-cache-busy'); assert.equal(calls.length, 1);
  assert.equal((await fs.readdir(path.join(root, 'card-translations/locks'))).length, 1);
});

const invalid = [
  ['number', result => { result.clauses[0].textKo = '[Action] [E] 3를 지불하고 카드 1장을 뽑습니다.'; }, 'number-mismatch'],
  ['symbol', result => { result.clauses[0].textKo = '[Action] [P] 2를 지불하고 카드 1장을 뽑습니다.'; }, 'symbol-mismatch'],
  ['cost', result => { result.cost.energy = 9; }, 'cost-mismatch'],
  ['stat', result => { result.stats.might = 99; }, 'stats-mismatch'],
  ['keyword', result => { result.keywordsKo[0].ko = '잘못된 키워드'; }, 'keyword-translation'],
  ['shape', result => { result.clauses[0].id = 'wrong-clause'; }, 'clause-alignment'],
];
for (const [name, mutate, code] of invalid) test(`blocking ${name} mismatch is a cached review candidate, never approved/published`, async t => {
  const { engine, calls } = await engineFor(t, { generate: request => { const value = output(request); mutate(value); return value; } });
  const card = catalog().cards[0], result = await engine.proposeCatalog(catalog()), next = result.catalog.cards[0];
  assert.equal(next.translationProposal.validation.status, 'blocked'); assert.ok(next.translationProposal.validation.issues.some(i => i.code === code));
  assert.equal(next.textKo, ''); assert.throws(() => approve(next), /blocking translation checks/);
  await engine.translateCard(card); assert.equal(calls.length, 1);
});

test('checks catch negation, ownership, timing/conditions, per-clause amount swaps and provider uncertainty', async t => {
  const examples = [
    ['Target friendly unit cannot attack until end of turn.', '상대 유닛을 대상으로 턴이 끝날 때까지 공격할 수 있습니다.', ['missing-negation', 'ownership-reversal']],
    ['If you draw 2 cards, you may draw up to 3 cards after combat.', '카드 2장을 뽑고 카드 3장을 뽑습니다.', ['missing-condition', 'missing-optional', 'missing-up-to', 'missing-after']],
    ['Draw 2 cards. Deal 3 damage to target unit.', '카드 3장을 뽑습니다. 유닛을 대상으로 피해 2를 입힙니다.', ['number-mismatch']],
    ['Draw 2 cards and deal 3 damage.', '카드 3장을 뽑고 피해 2를 입힙니다.', ['draw-amount-mismatch', 'deal-amount-mismatch']],
  ];
  for (const [en, ko, expected] of examples) {
    const texts = ko.split(/(?<=\.) /u);
    const { engine } = await engineFor(t, { generate: request => output(request, texts) });
    const result = await engine.translateCard(catalog({ card: { englishText: en, keywords: [], cost: {}, symbols: [] } }).cards[0]);
    for (const code of expected) assert.ok(result.record.validation.issues.some(i => i.code === code), code);
  }
  const uncertain = await engineFor(t, { generate: request => ({ ...output(request), uncertainties: ['Synthetic ambiguity.'] }) });
  const pending = (await uncertain.engine.proposeCatalog(catalog())).catalog.cards[0];
  assert.equal(pending.translationProposal.validation.status, 'needs-review');
  assert.throws(() => approve(pending, { acknowledgeWarnings: [] }), /acknowledgement/);
});

test('inconsistent keywords across a batch block both proposals without rewriting cache evidence', async t => {
  const { engine } = await engineFor(t, { generate: request => ({ ...output(request), keywordsKo: [{ en: 'Focus', ko: request.source.name.endsWith('A') ? '집중' : '초점' }] }) });
  const first = catalog({ card: { id: 'a', englishName: 'Training A', keywords: ['Focus'] } });
  const second = catalog({ card: { id: 'b', englishName: 'Training B', keywords: ['Focus'] } });
  const candidate = await engine.proposeCatalog({ ...first, cards: [...first.cards, ...second.cards] });
  assert.ok(candidate.catalog.cards.every(card => card.translationProposal.validation.issues.some(i => i.code === 'batch-keyword-inconsistent')));
  for (const card of candidate.catalog.cards) assert.throws(() => approve(card), /blocking/);
});

test('rights and explicit operator-provider/budget gates block generation; provider cannot mutate the source', async t => {
  const { engine, calls } = await engineFor(t);
  const input = catalog({ origin: 'riot-api', permissions: { translation: false } });
  assert.equal((await engine.translateCard(input.cards[0])).record.validation.status, 'failed'); assert.equal(calls.length, 0);
  const root = await sandbox(t), store = await createTranslationStore(root);
  let invoked = 0;
  const disabled = createTranslationProvider({ id: 'future-adapter', model: 'future-model', generate: () => { invoked++; } });
  const refused = createCardTranslationEngine({ store, provider: disabled });
  assert.equal((await refused.translateCard(catalog().cards[0])).record.validation.issues[0].code, 'translation-provider-disabled');
  const enabled = createTranslationProvider({ ...disabled, enabled: true, approvalReference: 'synthetic-only' });
  assert.equal((await createCardTranslationEngine({ store, provider: enabled }).translateCard(catalog().cards[0])).record.validation.issues[0].code, 'translation-budget');
  assert.equal(invoked, 0);
  const mutation = await engineFor(t, { generate: request => { request.source.stats.might = 999; return output(request); } });
  const card = catalog().cards[0];
  assert.ok((await mutation.engine.translateCard(card)).record.validation.issues.some(i => i.code === 'stats-mismatch'));
  assert.equal(card.stats.might, 3);
});

test('oversized translation prompts are cached as blocked work without invoking the provider', async t => {
  const { store, provider, calls } = await engineFor(t);
  const large = { ...glossary(), digest: hash('synthetic-oversized-glossary'), entries: Array.from({ length: 500 }, (_, i) => ({ en: `Term${i}`, ko: '가'.repeat(100), reference: 'x'.repeat(100) })) };
  const engine = createCardTranslationEngine({ store, provider, glossary: large });
  const first = await engine.translateCard(catalog().cards[0]), second = await engine.translateCard(catalog().cards[0]);
  assert.equal(first.record.validation.issues[0].code, 'translation-input-budget'); assert.equal(second.cacheHit, true);
  assert.equal(calls.length, 0); assert.equal(engine.stats().newCalls, 0);
});

test('unrevealed or unofficial previews are rejected by collection/conversion before translation', async t => {
  assert.throws(() => catalog({ card: { preview: true, releaseStatus: 'preview-unreleased' } }), /public reveal/);
  assert.throws(() => catalog({ origin: 'riot-api', card: { preview: true, releaseStatus: 'preview-unreleased', publication: { publiclyRevealed: true, url: 'https://fan.example.invalid/reveal', version: 'test' } } }), /public reveal/);
  const good = catalog({ origin: 'riot-api', card: { preview: true, releaseStatus: 'preview-unreleased', publication: { publiclyRevealed: true, url: 'https://playriftbound.com/synthetic-test-only', version: 'synthetic-v1' } } });
  assert.equal(good.cards[0].status, 'preview-unreleased');
  let calls = 0;
  const adapter = createRiotAdapter({ mode: 'riot-api', config: { enabled: true, approvedAppReference: 'synthetic', mappingVersion: 'test', endpoint: 'https://test.api.riotgames.com/synthetic' },
    getApiKey: () => 'synthetic-token', fetchImpl: async () => { calls++; return Response.json({}); },
    decodeOfficial: () => ({ version: 'test', cards: [{ preview: true, releaseStatus: 'preview-unreleased' }] }) });
  await assert.rejects(adapter.collect(), /public reveal/); assert.equal(calls, 1); // Fake transport only.
  const { engine } = await engineFor(t); good.cards[0].publication.publiclyRevealed = false;
  assert.equal((await engine.translateCard(good.cards[0])).called, false);
});

test('later official translation creates a replacement candidate, preserves old records and requires review', async t => {
  const { engine, store, calls } = await engineFor(t, { providerMode: 'operator-adapter' });
  const english = catalog({ origin: 'riot-api' }), one = await engine.proposeCatalog(english);
  const ai = approve(one.catalog.cards[0]); assert.equal(ai.translationStatus, 'unofficial-ai-reviewed');
  const previous = normalizeCatalog({ ...english, cards: [ai] });
  const newOfficial = catalog({ origin: 'riot-api', version: 'synthetic-v2', card: { officialKoreanName: '합성 공식 훈련', officialKoreanText: '[Action] [E] 2를 지불하고 카드 1장을 뽑습니다.', officialKoreanKeywords: ['행동'] } });
  const replacement = await engine.proposeCatalog(newOfficial, { previousCatalog: previous });
  assert.equal(calls.length, 1); assert.equal(replacement.review.rows[0].change, 'official-replacement');
  assert.equal(replacement.catalog.cards[0].translationRecord.authority, 'ai', 'Existing current text remains until review.');
  assert.equal(replacement.catalog.cards[0].translationProposal.authority, 'official');
  assert.equal(replacement.review.rows[0].before.id, ai.translationRecord.id);
  assert.deepEqual(replacement.review.rows[0].previousEnglish, englishSource(ai));
  const saved = await store.writeCandidate(replacement), archive = await fs.readFile(path.join(saved.folder, 'translation-review.json'), 'utf8');
  const reviewed = approve(replacement.catalog.cards[0]); assert.equal(reviewed.translationStatus, 'official');
  assert.ok(reviewed.translationHistory.includes(ai.translationRecord.id));
  assert.equal(await fs.readFile(path.join(saved.folder, 'translation-review.json'), 'utf8'), archive);
  const unchanged = await engine.proposeCatalog(newOfficial, { previousCatalog: normalizeCatalog({ ...newOfficial, cards: [reviewed] }) });
  assert.equal(unchanged.review.rows[0].change, 'unchanged');
});

test('unreviewed/stale proposals never leak through the public catalog; approved Korean remains searchable', async t => {
  const { engine } = await engineFor(t, { providerMode: 'operator-adapter' });
  const proposed = await engine.proposeCatalog(catalog({ origin: 'riot-api' }));
  const policy = createCardAccess('verified-only'), view = policy.snapshot({ releaseId: 'test', cardCatalog: proposed.catalog });
  assert.equal(view.cardCatalog.cards[0].textKo, ''); assert.equal(view.cardCatalog.cards[0].translationProposal, undefined);
  assert.equal(view.cardCatalog.cards[0].translationHistory, undefined);
  const good = approve(proposed.catalog.cards[0]), reviewed = normalizeCatalog({ ...proposed.catalog, cards: [good] });
  const published = policy.snapshot({ releaseId: 'reviewed', cardCatalog: reviewed });
  assert.equal(searchCards(published.cardCatalog, '훈련 주문').length, 1);
  assert.equal(published.cardCatalog.cards[0].translationStatus, 'unofficial-ai-reviewed');
  const stale = normalizeCatalog({ ...reviewed, cards: [{ ...good, textEn: good.textEn + ' Draw 2 cards.' }] });
  assert.equal(policy.snapshot({ releaseId: 'stale', cardCatalog: stale }).cardCatalog.cards[0].textKo, '');
});

async function baseKnowledge(root) {
  const folder = path.join(root, 'knowledge-releases/base'); await fs.mkdir(folder, { recursive: true });
  const hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': fixture.rules, 'cards.json': catalog(), 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex'); await fs.writeFile(path.join(folder, name), bytes);
  }
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ schemaVersion: 1, compatibleSchema: 2, releaseId: 'base', validationStatus: 'validated', hashes }));
  await fs.writeFile(path.join(root, 'knowledge-releases/active.json'), '{"releaseId":"base"}\n');
}
test('knowledge-release integration stages review-required copies and preserves the active pointer/base bytes', async t => {
  const { root, engine, store } = await engineFor(t); await baseKnowledge(root);
  const before = await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8');
  const base = await loadRelease(root, 'base'), candidate = await engine.proposeCatalog(catalog());
  await store.writeCandidate(candidate);
  const staged = await stageTranslationCandidate(root, candidate, { baseReleaseId: 'base' });
  assert.equal(staged.reviewRequired, true); assert.equal(staged.sources.cardTranslation.automaticActivation, false);
  const loaded = await loadRelease(root, staged.releaseId);
  assert.equal(loaded.cardCatalog.cards[0].translationProposal.review.status, 'pending');
  assert.equal(loaded.cardCatalog.cards[0].textKo, ''); assert.deepEqual(loaded.evidence, base.evidence);
  assert.equal(await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8'), before);
  await assert.rejects(activateRelease(root, staged.releaseId, 'base'), /operator review/);
  // An explicitly reviewed but now-stale base is rejected, rather than overwriting a newer pointer.
  await fs.cp(path.join(root, 'knowledge-releases/base'), path.join(root, 'knowledge-releases/other'), { recursive: true });
  const other = JSON.parse(await fs.readFile(path.join(root, 'knowledge-releases/other/manifest.json'), 'utf8')); other.releaseId = 'other';
  await fs.writeFile(path.join(root, 'knowledge-releases/other/manifest.json'), JSON.stringify(other));
  await fs.writeFile(path.join(root, 'knowledge-releases/active.json'), '{"releaseId":"other"}');
  await assert.rejects(activateRelease(root, staged.releaseId, 'other', { acknowledgeReview: true }), /base changed/);
});

test('cache/candidate stores refuse links and never use an unmarked or shared production root', async t => {
  const root = await sandbox(t), other = await sandbox(t);
  await fs.symlink(other, path.join(root, 'card-translations'), 'dir');
  await assert.rejects(createTranslationStore(root), /symlink/);
  await assert.rejects(createTranslationStore(path.resolve(release, '../..')), /production data tree/);
});

test('reviewed translation retains English authority and provenance in the existing AI question API', async t => {
  const { engine } = await engineFor(t, { providerMode: 'operator-adapter' });
  const proposed = await engine.proposeCatalog(catalog({ origin: 'riot-api' }));
  const reviewed = normalizeCatalog({ ...proposed.catalog, cards: [approve(proposed.catalog.cards[0])] });
  const answer = { recommendation: '같은 전장에서는 한 턴에 한 번만 득점합니다.', resolutionSteps: ['이 턴의 득점 여부를 확인합니다.'], reasoning: '472의 제한입니다.', confidence: 'medium',
    evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] }, followUpQuestions: [], citedRuleIds: ['core-rules:472'], citedCaseIds: [], citedCardIds: [], caseTitles: [], caseComparisons: [], requiresJudge: false };
  const server = await isolatedServer(t, [{ ruling: answer }], { cards: reviewed });
  const res = await server.ask('훈련 주문을 사용한 뒤 같은 턴 같은 전장에서 다시 득점하나요?', [reviewed.cards[0].id]);
  assert.equal(res.body.status, 'ruling-generated');
  const prompt = server.externalCalls[0].input.find(row => row.role === 'user').content.find(row => row.type === 'input_text').text;
  const sent = JSON.parse(prompt.split('User-selected cards, resolved by the server from a versioned catalog:\n')[1].split('\n\nRetrieved official')[0])[0];
  assert.equal(sent.textEn, reviewed.cards[0].textEn); assert.equal(sent.textKo, undefined);
  assert.equal(sent.translation.authority, 'ai'); assert.equal(sent.translation.status, 'unofficial-ai-reviewed');
  assert.deepEqual(sent.cost, reviewed.cards[0].cost);
});
