const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { release, fixture, isolatedServer } = require('./helpers/isolated-server.cjs');
const from = name => require(path.join(release, 'src', name));
const { createRiotAdapter } = from('riot-adapter');
const { convertCatalog } = from('riot-converter');
const { compareCardCatalogs } = from('card-sync-diff');
const { createCardSyncStore } = from('card-sync-store');
const { createCardSyncEngine, startCardSyncScheduler } = from('card-sync');
const { createTranslationStore } = from('card-translation-store');
const { createCardTranslationEngine, createTranslationProvider, reviewTranslation } = from('card-translation');
const { hash, englishSource } = from('card-translation-core');
const { normalizeCatalog } = from('cards');
const { loadRelease, createKnowledgeProvider } = from('knowledge-provider');
const originalFetch = globalThis.fetch; let forbiddenCalls = 0;
test.before(() => { globalThis.fetch = async () => { forbiddenCalls++; throw new Error('Unexpected external call.'); }; });
test.after(() => { globalThis.fetch = originalFetch; assert.equal(forbiddenCalls, 0); });
const publishedAt = '2026-10-28T00:00:00.000Z';
function card(id = 'alpha', changes = {}) {
  return { id, englishName: `Training ${id}`, englishText: 'Draw 1 card.', releaseStatus: 'released',
    cardVersion: 'card-1', cardRevision: 1, publishedAt, updatedAt: publishedAt, cost: { energy: 1 }, ...changes };
}
function page(cards = [card()], changes = {}) {
  return { snapshotId: 'snapshot-1', revision: 1, version: 'synthetic-1', publishedAt,
    sourceUrl: 'https://example.invalid/sync', expectedCount: cards.length, complete: true, nextCursor: null, cards, ...changes };
}
async function system(t, { cards = [card()], approved = false, enabled = false, intervalMs = 60000 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-card-sync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.3.0', environment: 'development' }));
  let clock = Date.parse('2026-10-28T12:00:00.000Z'), source = async () => page(cards), pageCalls = 0;
  const now = () => new Date(clock).toISOString();
  const adapter = createRiotAdapter({ now, mockPageSource: async (...args) => { pageCalls++; return source(...args); } });
  const snapshot = await adapter.collectSnapshot(), initial = convertCatalog(snapshot);
  const store = await createCardSyncStore(root), translationStore = await createTranslationStore(root);
  const paidMock = [], translationBatches = [];
  const provider = createTranslationProvider({ id: 'synthetic-sync', model: 'synthetic-sync-1', mode: 'mock', generate: async request => {
    paidMock.push(request);
    return { nameKo: `시험 ${request.source.name}`, clauses: request.clauses.map(row => ({ id: row.id, textKo: `카드 ${row.text.match(/\d+/u)?.[0] || '1'}장을 뽑습니다.` })),
      cost: request.source.cost, stats: request.source.stats, symbols: request.source.symbols, keywordsKo: [], uncertainties: [] };
  } });
  const inner = createCardTranslationEngine({ store: translationStore, provider, now });
  let baseCards = initial;
  if (approved) {
    const result = await inner.proposeCatalog(initial);
    baseCards = normalizeCatalog({ ...result.catalog, cards: result.catalog.cards.map(c => reviewTranslation(c, {
      proposalId: c.translationProposal.id, expectedEnglishHash: hash(englishSource(c)), reviewReference: 'synthetic-sync-review', at: now(),
    })) });
  }
  const translator = { async proposeCatalog(catalog, options) { translationBatches.push(structuredClone(options)); return inner.proposeCatalog(catalog, options); } };
  const base = path.join(root, 'knowledge-releases/base'); await fs.mkdir(base, { recursive: true });
  const hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': fixture.rules, 'cards.json': baseCards, 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex'); await fs.writeFile(path.join(base, name), bytes);
  }
  await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify({ schemaVersion: 1, compatibleSchema: 2, releaseId: 'base', validationStatus: 'validated', hashes }));
  await fs.writeFile(path.join(root, 'knowledge-releases/active.json'), '{"releaseId":"base"}\n');
  paidMock.length = 0; pageCalls = 0;
  const options = { store, translationStore, translator, adapter, enabled, intervalMs, retryBaseMs: 1000, now };
  const engine = createCardSyncEngine(options);
  return { root, store, translationStore, translator, adapter, engine, options, paidMock, translationBatches, initial, now,
    advance(ms = 60000) { clock += ms; }, setSource(fn) { source = fn; }, pageCalls: () => pageCalls,
    async observation() { const state = await store.readState(); return store.observation(state.lastGood); },
    async candidates() { return (await fs.readdir(path.join(root, 'knowledge-releases'))).filter(n => n.startsWith('sync-')); } };
}

test('mock adapter produces a complete snapshot without using its HTTP transport', async () => {
  const adapter = createRiotAdapter({ fetchImpl: () => { throw new Error('Never call HTTP'); } });
  const snapshot = await adapter.collectSnapshot();
  assert.equal(snapshot.origin, 'mock'); assert.equal(snapshot.collection.complete, true);
  assert.equal(snapshot.cards.length, snapshot.collection.expectedCount); assert.equal(snapshot.collection.pageCount, 1);
  assert.ok(snapshot.cards.every(c => c.cardVersion && c.publishedAt && c.updatedAt));
  await assert.rejects(createRiotAdapter({ mode: 'riot-api' }).collectSnapshot(), error => error.code === 'sync-official-disabled');
});

test('paging accepts only one complete, count-checked snapshot', async () => {
  const requests = [];
  const adapter = createRiotAdapter({ mockPageSource: async cursor => {
    requests.push(cursor); return cursor === null ? page([card()], { expectedCount: 2, nextCursor: 'page-b' }) : page([card('beta')], { expectedCount: 2 });
  } });
  const snapshot = await adapter.collectSnapshot(); assert.equal(snapshot.cards.length, 2);
  assert.deepEqual(requests, [null, 'page-b']); assert.equal(snapshot.collection.pageCount, 2);
});

const malformed = [
  ['partial page', () => page([card()], { complete: false }), 'sync-incomplete-response'],
  ['unknown terminal cursor', () => page([card()], { nextCursor: undefined }), 'sync-pagination'],
  ['count mismatch', () => page([card()], { expectedCount: 2 }), 'sync-size-or-count'],
  ['duplicate IDs', () => page([card(), card()]), 'sync-duplicate-card'],
  ['invalid card', () => page([card('alpha', { englishText: '' })]), 'sync-invalid-data'],
  ['invalid card dates', () => page([card('alpha', { publishedAt: 'invalid' })]), 'sync-invalid-data'],
  ['unrevealed preview', () => page([card('alpha', { releaseStatus: 'preview-unreleased' })]), 'sync-invalid-publication'],
  ['credential URL', () => page([card()], { sourceUrl: 'https://example.invalid/sync?token=synthetic-test-only' }), 'sync-source-mismatch'],
  ['mixed snapshot pages', cursor => cursor === null ? page([card()], { expectedCount: 2, nextCursor: 'next' }) : page([card('beta')], { expectedCount: 2, snapshotId: 'other-snapshot' }), 'sync-mixed-pages'],
  ['cursor loop', () => page([], { nextCursor: 'same', expectedCount: 2 }), 'sync-pagination'],
];
for (const [name, response, code] of malformed) test(`invalid ${name} never reaches conversion/translation and preserves the last good snapshot`, async t => {
  const s = await system(t); await s.engine.runOnce(); const before = await s.store.readState(), count = s.translationBatches.length;
  s.setSource(response); const result = await s.engine.runOnce();
  assert.equal(result.status, 'failed'); assert.equal(result.code, code);
  assert.deepEqual((await s.store.readState()).lastGood, before.lastGood); assert.equal(s.translationBatches.length, count);
  assert.equal((await s.candidates()).length, 1);
});

test('page limit and timeout abort the collection without exposing a partial catalog', async () => {
  const endless = createRiotAdapter({ mockPageSource: async cursor => page([], { nextCursor: `${cursor || ''}x`, expectedCount: 3 }) });
  await assert.rejects(endless.collectSnapshot({ maxPages: 2 }), error => error.code === 'sync-pagination');
  let aborted = false;
  const slow = createRiotAdapter({ mockPageSource: async (_cursor, { signal }) => new Promise(() => signal.addEventListener('abort', () => { aborted = true; })) });
  await assert.rejects(slow.collectSnapshot({ timeoutMs: 20 }), error => error.code === 'sync-timeout'); assert.equal(aborted, true);
});

test('first sync stages a review candidate using the existing translation/knowledge stores, never activates it', async t => {
  const s = await system(t), pointer = await fs.readFile(path.join(s.root, 'knowledge-releases/active.json'), 'utf8');
  const result = await s.engine.runOnce(); assert.equal(result.status, 'candidate'); assert.equal(result.activated, false);
  const loaded = await loadRelease(s.root, result.candidateId), base = await loadRelease(s.root, 'base');
  assert.equal(loaded.manifest.reviewRequired, true); assert.equal(loaded.manifest.sources.cardSync.automaticActivation, false);
  assert.equal(loaded.cardCatalog.cards[0].textKo, ''); assert.equal(loaded.cardCatalog.cards[0].translationProposal.review.status, 'pending');
  assert.deepEqual(loaded.evidence, base.evidence); assert.equal(s.paidMock.length, 1);
  assert.equal(await fs.readFile(path.join(s.root, 'knowledge-releases/active.json'), 'utf8'), pointer);
  const observed = await s.observation(); assert.equal(observed.index['mock:alpha'].englishHash, hash(englishSource(observed.catalog.cards[0])));
  assert.equal(observed.index['mock:alpha'].publishedAt, publishedAt); assert.ok(observed.index['mock:alpha'].lastSeenAt);
  const saved = await s.translationStore.readCandidate(result.candidateId); assert.equal(saved.candidate.syncReview.reviewRequired, true);
  assert.equal(saved.candidate.syncReview.deletionPolicy, 'retain-and-review');
});

test('repeats, page/card reordering and version-only advances publish nothing and do not invoke translation', async t => {
  const s = await system(t, { cards: [card(), card('beta')] }); const first = await s.engine.runOnce();
  s.advance(); s.setSource(async () => page([card('beta'), card()]));
  assert.equal((await s.engine.runOnce()).status, 'unchanged');
  s.advance(); s.setSource(async () => page([card('beta', { cardVersion: 'card-2', cardRevision: 2 }), card('alpha', { cardVersion: 'card-2', cardRevision: 2 })], { revision: 2, version: 'synthetic-2', snapshotId: 'snapshot-2' }));
  const result = await s.engine.runOnce(); assert.equal(result.status, 'unchanged'); assert.equal(result.candidateId, first.candidateId);
  assert.equal(s.translationBatches.length, 1); assert.equal(s.paidMock.length, 2); assert.equal((await s.candidates()).length, 1);
  assert.ok((await s.observation()).changes.every(row => row.kinds.includes('version-advanced')));
  const restarted = createCardSyncEngine({ ...s.options, store: await createCardSyncStore(s.root) });
  assert.equal((await restarted.runOnce()).status, 'unchanged'); assert.equal(s.translationBatches.length, 1);
});

test('only new/changed English cards are translated; unchanged records survive and stale Korean becomes review-only', async t => {
  const s = await system(t, { cards: [card(), card('beta')], approved: true });
  assert.equal((await s.engine.runOnce()).status, 'unchanged');
  const old = await s.observation(), oldId = old.catalog.cards[0].translationRecord.id;
  s.setSource(async () => page([card('alpha', { englishText: 'Draw 2 cards.', cardRevision: 2, cardVersion: 'card-2' }), card('beta'), card('gamma')], { revision: 2, version: 'synthetic-2' }));
  const result = await s.engine.runOnce(), current = await s.observation();
  assert.equal(result.status, 'candidate'); assert.deepEqual(s.translationBatches[0].changedCardIds.sort(), ['mock:alpha', 'mock:gamma']);
  assert.equal(s.paidMock.length, 2); const alpha = current.catalog.cards.find(c => c.id === 'mock:alpha');
  assert.equal(alpha.textKo, ''); assert.equal(alpha.translationRecord, null); assert.ok(alpha.translationHistory.includes(oldId));
  assert.equal(current.catalog.cards.find(c => c.id === 'mock:beta').translationRecord.id, old.catalog.cards.find(c => c.id === 'mock:beta').translationRecord.id);
  const review = (await s.translationStore.readCandidate(result.candidateId)).candidate;
  assert.ok(review.syncReview.changes.some(row => row.kinds.includes('english-changed')));
  assert.ok(review.review.rows.find(row => row.cardId === 'mock:alpha').before.id === oldId);
});

test('errata forces renewed review of an approved same-English translation and reuses its cache', async t => {
  const s = await system(t, { approved: true }); await s.engine.runOnce();
  s.setSource(async () => page([card('alpha', { errata: 'Synthetic errata: resolve after combat.', cardRevision: 2 })], { revision: 2, version: 'synthetic-2' }));
  const result = await s.engine.runOnce(), current = await s.observation();
  assert.equal(current.catalog.cards[0].translationRecord, null); assert.equal(current.catalog.cards[0].translationProposal.review.status, 'pending');
  assert.equal(s.paidMock.length, 0);
  const saved = await s.translationStore.readCandidate(result.candidateId);
  assert.ok(saved.candidate.syncReview.changes[0].kinds.includes('errata-changed'));
  assert.equal(saved.candidate.review.rows[0].cacheHit, true);
});

test('temporary omission is retained once, repeated omissions do not publish again, and return is reviewed', async t => {
  const s = await system(t, { cards: [card(), card('beta')] }); await s.engine.runOnce();
  s.setSource(async () => page([card()], { revision: 2, version: 'synthetic-2' }));
  const missing = await s.engine.runOnce(), observation = await s.observation();
  assert.equal(observation.catalog.cards.length, 2); assert.equal(observation.sourceCatalog.cards.length, 2);
  assert.equal(observation.missing['mock:beta'].observations, 1);
  assert.equal((await s.translationStore.readCandidate(missing.candidateId)).candidate.syncReview.changes[0].retained, true);
  assert.equal((await s.engine.runOnce()).status, 'unchanged'); assert.equal((await s.candidates()).length, 2);
  assert.equal((await s.observation()).missing['mock:beta'].observations, 2);
  s.setSource(async () => page([card(), card('beta')], { revision: 3, version: 'synthetic-3' }));
  const returned = await s.engine.runOnce(); assert.equal(returned.status, 'candidate');
  assert.ok((await s.translationStore.readCandidate(returned.candidateId)).candidate.syncReview.changes[0].kinds.includes('returned'));
  assert.deepEqual((await s.observation()).missing, {}); assert.equal(s.paidMock.length, 2);
});

test('official locale addition/change/removal and release changes are distinct in pure canonical comparison', () => {
  const convert = extra => convertCatalog({ schema: 'riftassist-canonical-1', origin: 'riot-api', version: 'test-1', mappingVersion: 'synthetic-mapper',
    sourceUrl: 'https://test.api.riotgames.com/synthetic', cards: [card('alpha', extra)] });
  const base = convert({}), added = convert({ cardRevision: 2, officialKoreanText: '카드 1장을 뽑습니다.' });
  assert.ok(compareCardCatalogs(base, added).changes[0].kinds.includes('official-korean-added'));
  const changed = convert({ cardRevision: 3, officialKoreanText: '합성 한국어 변경.' });
  assert.ok(compareCardCatalogs(added, changed).changes[0].kinds.includes('official-korean-changed'));
  assert.ok(compareCardCatalogs(changed, convert({ cardRevision: 4 })).changes[0].kinds.includes('official-korean-removed'));
  const preview = convert({ cardRevision: 5, releaseStatus: 'preview-unreleased', publication: { publiclyRevealed: true, url: 'https://playriftbound.com/synthetic-only', version: 'test' } });
  const released = convert({ cardRevision: 6 });
  const diff = compareCardCatalogs(preview, released); assert.ok(diff.changes[0].kinds.includes('release-status-changed')); assert.deepEqual(diff.translationIds, []);
});

test('mock Korean-locale and release updates are reviewed without another provider call', async t => {
  const s = await system(t); await s.engine.runOnce();
  s.setSource(async () => page([card('alpha', { koreanText: '합성 한국어 로케일', cardRevision: 2, releaseStatus: 'preview-unreleased',
    publication: { publiclyRevealed: true, url: 'https://example.invalid/synthetic-reveal', version: 'test' } })], { revision: 2, version: 'synthetic-2' }));
  const result = await s.engine.runOnce(); const saved = await s.translationStore.readCandidate(result.candidateId);
  assert.ok(saved.candidate.syncReview.changes[0].kinds.includes('official-korean-added'));
  assert.ok(saved.candidate.syncReview.changes[0].kinds.includes('release-status-changed'));
  assert.equal(saved.candidate.catalog.cards[0].source.kind, 'mock'); assert.equal(saved.candidate.catalog.cards[0].translationProposal.authority, 'mock');
  assert.equal(s.paidMock.length, 1); assert.equal(saved.candidate.review.rows[0].cacheHit, true);
});

const stale = [
  ['snapshot revision reversal', () => page([card()], { revision: 0, version: 'old' }), 'sync-version-reversal'],
  ['same revision changed data', () => page([card('alpha', { englishText: 'Draw 2 cards.', cardRevision: 2 })]), 'sync-revision-conflict'],
  ['same card revision changed data', () => page([card('alpha', { englishText: 'Draw 2 cards.' })], { revision: 2 }), 'sync-card-revision-conflict'],
  ['card revision reversal', () => page([card('alpha', { cardRevision: 0 })], { revision: 2 }), 'sync-card-version-reversal'],
  ['publication date reversal', () => page([card('alpha', { updatedAt: '2026-10-27T00:00:00.000Z', publishedAt: '2026-10-27T00:00:00.000Z' })], { revision: 2, publishedAt: '2026-10-27T00:00:00.000Z' }), 'sync-version-reversal'],
];
for (const [name, source, code] of stale) test(`${name} preserves the last normal observation and active release`, async t => {
  const s = await system(t); await s.engine.runOnce(); const prior = (await s.store.readState()).lastGood;
  s.setSource(source); const result = await s.engine.runOnce(); assert.equal(result.code, code);
  assert.deepEqual((await s.store.readState()).lastGood, prior); assert.equal((await s.candidates()).length, 1);
});

test('network/rate-limit failures use persistent bounded backoff, sanitize errors and recover without data loss', async t => {
  const s = await system(t, { enabled: true }); await s.engine.runOnce();
  const lastGood = (await s.store.readState()).lastGood;
  s.setSource(async cursor => { if (cursor === null) return page([card()], { expectedCount: 2, nextCursor: 'next' }); throw new Error('SYNTHETIC_RAW_RESPONSE_DO_NOT_PERSIST'); });
  const one = await s.engine.runOnce(); assert.equal(one.code, 'sync-network'); assert.equal(one.failures, 1);
  const calls = s.pageCalls(); assert.equal((await s.engine.runOnce()).status, 'not-due'); assert.equal(s.pageCalls(), calls);
  s.advance(1000); s.setSource(async () => { throw Object.assign(new Error('SYNTHETIC_RAW_RESPONSE_DO_NOT_PERSIST'), { code: 'rate-limit', retryAfterMs: 120000 }); });
  const two = await s.engine.runOnce(); assert.equal(two.code, 'sync-rate-limit'); assert.equal(Date.parse(two.nextAttemptAt) - Date.parse(s.now()), 120000);
  assert.deepEqual((await s.store.readState()).lastGood, lastGood);
  for (const file of await fs.readdir(path.join(s.root, 'card-sync/attempts'))) assert.ok(!(await fs.readFile(path.join(s.root, 'card-sync/attempts', file), 'utf8')).includes('SYNTHETIC_RAW_RESPONSE_DO_NOT_PERSIST'));
  s.advance(120000); s.setSource(async () => page()); assert.equal((await s.engine.runDue()).status, 'unchanged');
  assert.equal((await s.store.readState()).failures, 0); assert.equal(s.paidMock.length, 1);
});

test('parallel sync workers share one reservation; disabled scheduling never collects', async t => {
  const s = await system(t); assert.equal((await s.engine.runDue()).status, 'disabled'); assert.equal(s.pageCalls(), 0);
  let releasePage; s.setSource(() => new Promise(resolve => { releasePage = () => resolve(page()); }));
  const first = s.engine.runOnce(); while (!releasePage) await new Promise(resolve => setImmediate(resolve));
  const other = createCardSyncEngine({ ...s.options, store: await createCardSyncStore(s.root) });
  assert.equal((await other.runOnce()).status, 'busy'); releasePage(); assert.equal((await first).status, 'candidate');
  assert.equal(s.pageCalls(), 1); assert.equal(s.paidMock.length, 1);
});

test('explicit scheduler ticks respect due times and stop without starting a second worker', async t => {
  const s = await system(t, { enabled: true }); let callback, stopped = false; const results = [];
  const scheduler = startCardSyncScheduler(s.engine, { onResult: result => results.push(result), timers: {
    setInterval(fn) { callback = fn; return { unref() {} }; }, clearInterval() { stopped = true; },
  } });
  await callback(); await callback(); assert.deepEqual(results.map(r => r.status), ['candidate', 'not-due']);
  s.advance(); await callback(); assert.equal(results.at(-1).status, 'unchanged');
  scheduler.stop(); assert.equal(stopped, true);
  const calls = s.pageCalls(); await callback(); assert.equal(s.pageCalls(), calls);
  assert.throws(() => startCardSyncScheduler({ enabled: false }), /disabled/);
});

test('a fully declared empty snapshot retains every card and excessive retry delays require manual review', async t => {
  const s = await system(t); await s.engine.runOnce();
  s.setSource(async () => page([], { revision: 2, version: 'synthetic-2' }));
  const result = await s.engine.runOnce(), observed = await s.observation();
  assert.equal(result.status, 'candidate'); assert.equal(observed.catalog.cards.length, 1); assert.equal(result.missing, 1);
  s.setSource(async () => { throw Object.assign(new Error('Synthetic rate limit.'), { code: 'rate-limit', retryAfterMs: 2592000001 }); });
  const limited = await s.engine.runOnce(); assert.equal(limited.retryBlocked, true);
  s.advance(2592000001); const calls = s.pageCalls(); assert.equal((await s.engine.runOnce()).status, 'manual-review'); assert.equal(s.pageCalls(), calls);
});

test('a changed source scope or incomplete injected collector cannot advance the accepted state', async t => {
  const s = await system(t); await s.engine.runOnce(); const state = await s.store.readState();
  s.setSource(async () => page([card()], { sourceUrl: 'https://example.invalid/different-scope', revision: 2 }));
  assert.equal((await s.engine.runOnce()).code, 'sync-source-mismatch'); assert.deepEqual((await s.store.readState()).lastGood, state.lastGood);
  const bad = await system(t); const engine = createCardSyncEngine({ ...bad.options, adapter: { mode: 'mock', async collectSnapshot() {
    return { origin: 'mock', cards: [card()], collection: { complete: false } };
  } } });
  assert.equal((await engine.runOnce()).code, 'sync-incomplete-response'); assert.equal(bad.translationBatches.length, 0);
});

test('a completed candidate is reused after a journal failure without another publication or translation', async t => {
  const s = await system(t); let failOnce = true;
  const store = { ...s.store, async saveObservation(...args) { if (failOnce) { failOnce = false; throw new Error('Synthetic disk failure.'); } return s.store.saveObservation(...args); } };
  const engine = createCardSyncEngine({ ...s.options, store });
  assert.equal((await engine.runOnce()).status, 'failed'); assert.equal((await s.store.readState()).lastGood, null);
  s.advance(); assert.equal((await engine.runOnce()).status, 'candidate');
  assert.equal((await s.candidates()).length, 1); assert.equal(s.paidMock.length, 1); assert.equal(s.translationBatches.length, 1);
});

test('base-pointer changes and unapproved source catalogs are blocked, and real sync cannot collect', async t => {
  const s = await system(t); await s.engine.runOnce();
  const initial = await s.store.readState();
  await fs.cp(path.join(s.root, 'knowledge-releases/base'), path.join(s.root, 'knowledge-releases/other'), { recursive: true });
  const manifestPath = path.join(s.root, 'knowledge-releases/other/manifest.json'), manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.releaseId = 'other'; await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await fs.writeFile(path.join(s.root, 'knowledge-releases/active.json'), '{"releaseId":"other"}');
  assert.equal((await s.engine.runOnce()).code, 'sync-base-changed'); assert.deepEqual((await s.store.readState()).lastGood, initial.lastGood);
  const other = await system(t); let invoked = false;
  const real = createCardSyncEngine({ ...other.options, adapter: { mode: 'riot-api', async collectSnapshot() { invoked = true; } } });
  assert.equal((await real.runOnce()).code, 'sync-official-disabled'); assert.equal(invoked, false);
  const bad = await system(t), p = path.join(bad.root, 'knowledge-releases/base/cards.json');
  const cards = JSON.parse(await fs.readFile(p, 'utf8')); cards.cards[0].source.kind = 'licensed';
  const bytes = JSON.stringify(cards); await fs.writeFile(p, bytes);
  const mpath = path.join(bad.root, 'knowledge-releases/base/manifest.json'), m = JSON.parse(await fs.readFile(mpath, 'utf8'));
  m.hashes['cards.json'] = crypto.createHash('sha256').update(bytes).digest('hex'); await fs.writeFile(mpath, JSON.stringify(m));
  assert.equal((await bad.engine.runOnce()).code, 'sync-unapproved-base'); assert.equal(bad.pageCalls(), 0);
});

test('shared roots, symlinks, damaged state and stale run locks fail closed', async t => {
  await assert.rejects(createCardSyncStore(path.resolve(release, '../..')), /production data tree/);
  const s = await system(t); await s.engine.runOnce();
  await fs.writeFile(path.join(s.root, 'card-sync/state.json'), '{corrupt');
  await assert.rejects(s.engine.runOnce(), error => error.code === 'sync-store-invalid');
  assert.equal((await s.engine.runOnce()).status, 'busy'); assert.equal(s.pageCalls(), 1);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-sync-link-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.3.0', environment: 'development' }));
  await fs.symlink(path.join(s.root, 'card-sync'), path.join(root, 'card-sync'), 'dir');
  await assert.rejects(createCardSyncStore(root), error => error.code === 'sync-store-invalid');
});

test('a staged sync candidate is loadable by existing knowledge/search APIs while current requests retain the last active data', async t => {
  const s = await system(t), knowledge = createKnowledgeProvider(s.root); await knowledge.initialize(); t.after(() => knowledge.close());
  const current = knowledge.current(); s.setSource(async () => page([card(), card('beta')], { revision: 2, version: 'synthetic-2' }));
  const result = await s.engine.runOnce(), staged = await loadRelease(s.root, result.candidateId);
  await knowledge.reload(); assert.equal(knowledge.current().releaseId, 'base'); assert.equal(current.cardCatalog.cards.length, 1);
  const server = await isolatedServer(t, [], { cards: staged.cardCatalog });
  const response = await server.request('/api/cards/search?q=Training%20beta');
  assert.equal(response.status, 200); assert.equal(response.body.results.length, 1);
  assert.equal(response.body.results[0].nameKo, '');
  assert.equal(staged.cardCatalog.cards.length, 2); assert.equal(result.activated, false);
});
