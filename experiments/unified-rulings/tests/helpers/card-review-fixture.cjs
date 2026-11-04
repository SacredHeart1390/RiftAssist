const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { release, fixture } = require('./isolated-server.cjs');
const from = name => require(path.join(release, 'src', name));
const { convertCatalog } = from('riot-converter');
const { createRiotAdapter } = from('riot-adapter');
const { createCardSyncStore } = from('card-sync-store');
const { createCardSyncEngine } = from('card-sync');
const { createTranslationStore } = from('card-translation-store');
const { createCardTranslationEngine, createTranslationProvider } = from('card-translation');
const { stageTranslationCandidate } = from('card-translation-candidates');
const { createReviewControl } = from('card-review-control');
const { signRequest } = from('card-review-auth');
const at = '2026-10-28T00:00:00.000Z';
const allScopes = ['review:read', 'review:decide', 'cards:stage', 'cards:activate', 'cards:rollback', 'audit:read'];
const card = (id, extra = {}) => ({ id, englishName: `Training ${id}`, englishText: 'Draw 1 card.', cost: { energy: 1 },
  cardVersion: 'card-1', cardRevision: 1, releaseStatus: 'released', publishedAt: at, updatedAt: at, ...extra });
async function reviewFixture(t, { baseCards = [], cards = [card('alpha'), card('beta')], standalone = false, invalidTranslation = false } = {}) {
  // Match the store's real path, including Windows short/long TEMP aliases.
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-card-review-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.3.0', environment: 'development' }));
  const canonical = list => ({ schema: 'riftassist-canonical-1', origin: 'mock', version: 'source-1', sourceUrl: 'https://example.invalid/review',
    collectedAt: at, publishedAt: at, cards: list });
  const base = path.join(root, 'knowledge-releases/base'); await fs.mkdir(base, { recursive: true }); const hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': fixture.rules, 'cards.json': convertCatalog(canonical(baseCards)), 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex'); await fs.writeFile(path.join(base, name), bytes);
  }
  await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify({ schemaVersion: 1, compatibleSchema: 2, releaseId: 'base', validationStatus: 'validated', hashes }));
  await fs.writeFile(path.join(root, 'knowledge-releases/active.json'), '{"releaseId":"base"}\n');
  const translationStore = await createTranslationStore(root), syncStore = await createCardSyncStore(root);
  let providerCalls = 0, sourceCards = cards, sourceRevision = 2;
  const translator = createCardTranslationEngine({ store: translationStore, provider: createTranslationProvider({ id: 'synthetic-review', model: 'synthetic-review-1', mode: 'mock',
    generate: async request => { providerCalls++; return { nameKo: `시험 ${request.source.name}`, clauses: request.clauses.map(row => ({ id: row.id,
      textKo: `카드 ${invalidTranslation ? '999' : row.text.match(/\d+/u)?.[0] || '1'}장을 뽑습니다.` })), keywordsKo: [], cost: request.source.cost, stats: request.source.stats, symbols: request.source.symbols, uncertainties: [] }; } }) });
  const adapter = createRiotAdapter({ mockPageSource: async () => ({ snapshotId: `snapshot-${sourceRevision}`, revision: sourceRevision,
    version: `source-${sourceRevision}`, publishedAt: at, sourceUrl: canonical([]).sourceUrl, expectedCount: sourceCards.length, complete: true, nextCursor: null, cards: sourceCards }) });
  const engine = createCardSyncEngine({ store: syncStore, translationStore, translator, adapter });
  let candidateId, knowledgeReleaseId;
  if (standalone) {
    const result = await translator.proposeCatalog(convertCatalog(canonical(cards)));
    candidateId = (await translationStore.writeCandidate(result)).id;
    knowledgeReleaseId = (await stageTranslationCandidate(root, result, { baseReleaseId: 'base' })).releaseId;
  } else { candidateId = (await engine.runOnce()).candidateId; knowledgeReleaseId = candidateId; }
  const credentials = [{ id: 'all', actor: 'synthetic-operator', scopes: allScopes },
    { id: 'reader', actor: 'synthetic-reader', scopes: ['review:read'] },
    { id: 'reviewer', actor: 'synthetic-reviewer', scopes: ['review:read', 'review:decide'] },
    { id: 'publisher', actor: 'synthetic-publisher', scopes: ['review:read', 'cards:stage', 'cards:activate', 'cards:rollback'] },
    { id: 'auditor', actor: 'synthetic-auditor', scopes: ['audit:read'] }].map(c => ({ ...c, secret: crypto.randomBytes(32).toString('hex') }));
  let sessionId = crypto.randomUUID(), clock = Date.now(), control;
  const authentication = () => ({ sessionId, credentials, now: () => clock });
  async function reopen() { sessionId = crypto.randomUUID(); control = await createReviewControl({ root, authentication: authentication() }); }
  await reopen();
  function request(method, params = {}, { credentialId = 'all', requestId = crypto.randomUUID(), ...extra } = {}) {
    const message = { protocol: 'riftassist-control-1', sessionId, credentialId, requestId, nonce: crypto.randomUUID(), issuedAt: clock, method, params, ...extra };
    message.signature = signRequest(message, credentials.find(c => c.id === credentialId)?.secret || credentials[0].secret); return message;
  }
  const dispatch = message => control.dispatch(message);
  const invoke = (method, params, options) => dispatch(request(method, params, options));
  const ok = async (...args) => { const response = await invoke(...args); if (!response.ok) throw new Error(JSON.stringify(response)); return response.result; };
  const get = bundleId => ok('get', { bundleId });
  const register = () => ok('register', { candidateId, knowledgeReleaseId, reason: 'Synthetic candidate import.' });
  const action = (item, decision = 'approve') => ({ itemId: item.id, expectedFingerprint: item.fingerprint, decision,
    reason: 'Synthetic rules comparison.', acknowledgeWarnings: [...new Set(item.warnings.map(w => w.code))] });
  async function approveAll(bundleId) { const b = await get(bundleId); return ok('decide', { bundleId, expectedRevision: b.revision, actions: b.items.map(i => action(i)) }); }
  async function stage(bundleId) { const b = await get(bundleId); return ok('stage', { bundleId, expectedRevision: b.revision,
    acknowledgeExcluded: b.items.filter(i => i.decision?.decision !== 'approve').map(i => i.id), reason: 'Synthetic approved subset.' }); }
  async function activate(bundleId, pkg, extra = {}, options) { const b = await get(bundleId); return invoke('activate', { bundleId, expectedRevision: b.revision,
    packageId: pkg.id, packageDigest: pkg.digest, expectedActiveReleaseId: pkg.baseReleaseId,
    confirmation: 'ACTIVATE_ISOLATED_DEVELOPMENT', reason: 'Synthetic final approval.', ...extra }, options); }
  return { root, translationStore, syncStore, translator, engine, candidateId, knowledgeReleaseId, credentials, request, dispatch, invoke, ok, get, register,
    action, approveAll, stage, activate, reopen, authentication, providerCalls: () => providerCalls, advance(ms) { clock += ms; },
    setSource(list, revision = 3) { sourceCards = list; sourceRevision = revision; },
    pointer: async () => JSON.parse(await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8')) };
}
module.exports = { reviewFixture, card, from, allScopes };
