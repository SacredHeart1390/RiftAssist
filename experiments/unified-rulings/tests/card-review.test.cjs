const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const readline = require('node:readline');
const { reviewFixture, card, from } = require('./helpers/card-review-fixture.cjs');
const { release } = require('./helpers/isolated-server.cjs');
const { loadRelease } = from('knowledge-provider');
const { activateRelease } = from('knowledge-releases');
const { signRequest } = from('card-review-auth');
const { createReviewControl } = from('card-review-control');
const { createCardReviewStore } = from('card-review-store');
const originalFetch = globalThis.fetch; let networkCalls = 0;
test.before(() => { globalThis.fetch = async () => { networkCalls++; throw new Error('No external requests in review tests.'); }; });
test.after(() => { globalThis.fetch = originalFetch; assert.equal(networkCalls, 0); });
async function rejects(s, method, params, code, options) {
  const result = await s.invoke(method, params, options); assert.equal(result.ok, false); assert.equal(result.error.code, code); return result;
}
async function prepared(t, options) {
  const s = await reviewFixture(t, options), { bundleId } = await s.register(); await s.approveAll(bundleId);
  return { s, bundleId, pkg: await s.stage(bundleId) };
}

test('signed requests authenticate without existing keys; expiry/replay and unknown credentials fail and are audited', async t => {
  const s = await reviewFixture(t), request = s.request('list', {});
  assert.equal((await s.dispatch(request)).ok, true);
  assert.equal((await s.dispatch(request)).error.code, 'review-replay');
  const wrong = s.request('list', {}); wrong.signature = '0'.repeat(64);
  assert.equal((await s.dispatch(wrong)).error.code, 'review-unauthorized');
  const unknown = s.request('list', {}, { credentialId: 'unknown' }); assert.equal((await s.dispatch(unknown)).error.code, 'review-unauthorized');
  const expired = s.request('list', {}); s.advance(31000); assert.equal((await s.dispatch(expired)).error.code, 'review-unauthorized');
  const audit = await s.ok('audit', { limit: 100 }, { credentialId: 'auditor' });
  assert.ok(audit.events.some(e => e.type === 'denied' && e.actor === 'unauthenticated'));
  for (const name of await fs.readdir(path.join(s.root, 'card-reviews/events'))) {
    const bytes = await fs.readFile(path.join(s.root, 'card-reviews/events', name), 'utf8');
    for (const credential of s.credentials) assert.ok(!bytes.includes(credential.secret));
    const payload = JSON.parse(bytes).event.payload;
    if (payload.type === 'read') assert.equal(Object.hasOwn(payload, 'result'), false, 'Read audit entries contain metadata, not full comparison responses.');
  }
});

test('review, staging, activation, rollback and audit scopes are separately enforced', async t => {
  const s = await reviewFixture(t);
  await rejects(s, 'register', { candidateId: s.candidateId, reason: 'Synthetic' }, 'review-forbidden', { credentialId: 'reader' });
  await rejects(s, 'decide', {}, 'review-forbidden', { credentialId: 'publisher' });
  await rejects(s, 'stage', {}, 'review-forbidden', { credentialId: 'reviewer' });
  await rejects(s, 'activate', {}, 'review-forbidden', { credentialId: 'reviewer' });
  await rejects(s, 'rollback', {}, 'review-forbidden', { credentialId: 'reader' });
  await rejects(s, 'audit', {}, 'review-forbidden', { credentialId: 'reader' });
  await rejects(s, 'list', {}, 'review-forbidden', { credentialId: 'auditor' });
  await rejects(s, 'constructor', {}, 'review-method-not-found');
});

test('review items expose before/after English, Korean proposal, provenance, mechanics, warnings and unreleased state', async t => {
  const preview = card('beta', { releaseStatus: 'preview-unreleased', publication: { publiclyRevealed: true, url: 'https://example.invalid/reveal', version: 'synthetic' } });
  const s = await reviewFixture(t, { cards: [card('alpha'), preview] }), registered = await s.register(), b = await s.get(registered.bundleId);
  assert.equal(b.total, 4); const data = b.items.find(i => i.cardId === 'mock:beta' && i.type === 'data');
  assert.equal(data.before, null); assert.equal(data.after.status, 'preview-unreleased'); assert.equal(data.after.source.kind, 'mock');
  assert.deepEqual(data.after.cost, { energy: 1 }); assert.ok(data.warnings.some(w => w.code === 'preview-unreleased'));
  const translation = b.items.find(i => i.type === 'translation');
  assert.equal(translation.after.textEn, 'Draw 1 card.'); assert.equal(translation.proposal.authority, 'mock');
  assert.ok(translation.proposal.textKo.includes('카드 1장')); assert.ok(translation.fingerprint.length === 64);
  await rejects(s, 'get', { bundleId: b.bundleId, limit: 21 }, 'review-page-invalid');
  assert.equal((await s.get(b.bundleId)).revision, 0);
});

test('individual hold/reject/approve reasons and actor identities persist after control restart', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId);
  await s.ok('decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items[0], 'hold'), s.action(b.items[1], 'reject')] }, { credentialId: 'reviewer' });
  await s.reopen(); const stored = await s.get(bundleId);
  assert.equal(stored.revision, 1); assert.equal(stored.items[0].decision.decision, 'hold'); assert.equal(stored.items[1].decision.decision, 'reject');
  assert.equal(stored.items[0].decision.actor, 'synthetic-reviewer'); assert.equal(stored.items[0].decision.reason, 'Synthetic rules comparison.');
  await s.ok('decide', { bundleId, expectedRevision: 1, actions: [s.action(stored.items[0])] });
  assert.equal((await s.get(bundleId)).items[0].decision.decision, 'approve');
});

test('bulk review is all-or-nothing, bounded, and checks item and bundle versions', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId);
  const good = s.action(b.items[0]), bad = { ...s.action(b.items[1]), expectedFingerprint: '0'.repeat(64) };
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [good, bad] }, 'review-item-conflict');
  assert.ok((await s.get(bundleId)).items.every(i => i.decision === null));
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [good, good] }, 'review-actions-invalid');
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: Array(51).fill(good) }, 'review-actions-invalid');
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [{ ...good, reason: '' }] }, 'review-reason-required');
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [{ ...good, acknowledgeWarnings: [] }] }, 'review-warnings-required');
  await s.ok('decide', { bundleId, expectedRevision: 0, actions: [good] });
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items[1])] }, 'review-version-conflict');
});

test('request retries are idempotent while duplicate approvals or reused operation IDs with different content are blocked', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId), requestId = crypto.randomUUID();
  const params = { bundleId, expectedRevision: 0, actions: [s.action(b.items[0])] };
  const first = await s.ok('decide', params, { requestId });
  assert.deepEqual(await s.ok('decide', params, { requestId }), first);
  await rejects(s, 'decide', { ...params, expectedRevision: 1 }, 'review-operation-conflict', { requestId });
  await rejects(s, 'decide', { ...params, expectedRevision: 1 }, 'review-duplicate-decision');
  assert.equal((await s.get(bundleId)).revision, 1);
});

test('parallel control processes cannot both commit decisions at the same version', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId);
  const other = await createReviewControl({ root: s.root, authentication: s.authentication() });
  const results = await Promise.all([s.dispatch(s.request('decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items[0])] })),
    other.dispatch(s.request('decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items[1])] }))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await s.get(bundleId)).revision, 1);
});

test('a newer synchronization candidate makes the old candidate unapprovable', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId);
  s.setSource([card('alpha', { englishText: 'Draw 2 cards.', cardRevision: 2, cardVersion: 'card-2' }), card('beta')]);
  assert.equal((await s.engine.runOnce()).status, 'candidate');
  await rejects(s, 'decide', { bundleId, expectedRevision: b.revision, actions: [s.action(b.items[0])] }, 'review-stale');
  assert.ok((await s.get(bundleId)).staleReason); assert.equal((await s.pointer()).releaseId, 'base');
});

test('standalone translation candidates use the same review path and newer registered bundles supersede older ones', async t => {
  const s = await reviewFixture(t, { standalone: true }), { bundleId } = await s.register();
  const saved = await s.translationStore.readCandidate(s.candidateId);
  const newer = await s.translationStore.writeCandidate(saved.candidate);
  const registered = await s.ok('register', { candidateId: newer.id, knowledgeReleaseId: s.knowledgeReleaseId, reason: 'Synthetic newer registration.' });
  assert.notEqual(registered.bundleId, bundleId);
  const b = await s.get(bundleId);
  await rejects(s, 'decide', { bundleId, expectedRevision: b.revision, actions: [s.action(b.items[0])] }, 'review-superseded');
});

test('candidate file tampering is detected before decisions or staging', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register();
  await fs.appendFile(path.join(s.root, 'card-translations/candidates', s.candidateId, 'cards.json'), ' ');
  await rejects(s, 'get', { bundleId }, 'review-candidate-invalid'); assert.equal((await s.pointer()).releaseId, 'base');
});

test('partial review stages only approved data, preserves rejected/held base records and leaves Korean unpublished', async t => {
  const s = await reviewFixture(t, { baseCards: [card('retained')], cards: [card('alpha'), card('beta'), card('retained')] });
  const { bundleId } = await s.register(), b = await s.get(bundleId);
  const actions = b.items.map(i => s.action(i, i.cardId === 'mock:alpha' && i.type === 'data' ? 'approve' : i.cardId === 'mock:beta' ? 'reject' : 'hold'));
  await s.ok('decide', { bundleId, expectedRevision: 0, actions }); const pkg = await s.stage(bundleId);
  const reviewed = await loadRelease(s.root, pkg.releaseId);
  assert.deepEqual(reviewed.cardCatalog.cards.map(c => c.id).sort(), ['mock:alpha', 'mock:retained']);
  assert.equal(reviewed.cardCatalog.cards.find(c => c.id === 'mock:alpha').textKo, '');
  assert.equal(reviewed.manifest.sources.cardReview.finalApprovalRequired, true); assert.equal((await s.pointer()).releaseId, 'base');
  const before = (await fs.readdir(path.join(s.root, 'knowledge-releases'))).length;
  assert.deepEqual(await s.stage(bundleId), pkg); assert.equal((await fs.readdir(path.join(s.root, 'knowledge-releases'))).length, before);
});

test('excluded items and data prerequisites require explicit acknowledgement; no stage is written on invalid requests', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId);
  await s.ok('decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items.find(i => i.type === 'translation'))] });
  await rejects(s, 'stage', { bundleId, expectedRevision: 1, reason: 'Synthetic', acknowledgeExcluded: [] }, 'review-exclusions-required');
  await assert.rejects(s.stage(bundleId), /review-data-prerequisite/);
  assert.equal((await fs.readdir(path.join(s.root, 'knowledge-releases'))).filter(n => n.startsWith('review-')).length, 0);
});

test('blocked translations cannot be approved but explicitly approved English data can be staged independently', async t => {
  const s = await reviewFixture(t, { invalidTranslation: true }), { bundleId } = await s.register(), b = await s.get(bundleId);
  const translation = b.items.find(i => i.type === 'translation');
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [s.action(translation)] }, 'review-validation-blocked');
  await s.ok('decide', { bundleId, expectedRevision: 0, actions: b.items.filter(i => i.type === 'data').map(i => s.action(i)) });
  const pkg = await s.stage(bundleId), loaded = await loadRelease(s.root, pkg.releaseId);
  assert.ok(loaded.cardCatalog.cards.every(c => !c.textKo && !c.translationProposal)); assert.equal(s.providerCalls(), 2);
});

test('errata and English changes display their former data and warnings for review', async t => {
  const s = await reviewFixture(t, { baseCards: [card('alpha')], cards: [card('alpha', { englishText: 'Draw 2 cards.', errata: 'Synthetic errata.', cardRevision: 2, cardVersion: 'card-2' })] });
  const { bundleId } = await s.register(), b = await s.get(bundleId), item = b.items.find(i => i.type === 'data');
  assert.equal(item.before.textEn, 'Draw 1 card.'); assert.equal(item.after.textEn, 'Draw 2 cards.'); assert.equal(item.after.errata, 'Synthetic errata.');
  assert.ok(item.kinds.includes('errata-changed')); assert.ok(item.warnings.some(w => w.code === 'english-changed'));
});

test('final activation and rollback are separate signed operations, preserve the base and survive audit replay', async t => {
  const { s, bundleId, pkg } = await prepared(t); const baseBytes = await fs.readFile(path.join(s.root, 'knowledge-releases/base/cards.json'));
  assert.equal((await s.pointer()).releaseId, 'base');
  assert.equal((await s.activate(bundleId, pkg, { confirmation: '' })).error.code, 'review-confirmation-required');
  assert.equal((await s.activate(bundleId, pkg, { packageDigest: '0'.repeat(64) })).error.code, 'review-version-conflict');
  assert.equal((await s.activate(bundleId, pkg, {}, { credentialId: 'publisher' })).ok, true);
  assert.equal((await s.pointer()).releaseId, pkg.releaseId); assert.equal((await s.pointer()).previousReleaseId, 'base');
  await s.reopen(); const b = await s.get(bundleId); assert.equal(b.status, 'active');
  const rollback = await s.ok('rollback', { bundleId, expectedRevision: b.revision, packageId: pkg.id, packageDigest: pkg.digest,
    expectedActiveReleaseId: pkg.releaseId, confirmation: 'ROLLBACK_ISOLATED_DEVELOPMENT', reason: 'Synthetic rollback check.' }, { credentialId: 'publisher' });
  assert.equal(rollback.applied, true); assert.equal((await s.pointer()).releaseId, 'base');
  assert.deepEqual(await fs.readFile(path.join(s.root, 'knowledge-releases/base/cards.json')), baseBytes);
  await s.reopen(); assert.equal((await s.get(bundleId)).status, 'rolled-back');
});

test('legacy activation cannot bypass review for raw/prepared candidates or roll back an active reviewed package', async t => {
  const { s, bundleId, pkg } = await prepared(t);
  const generic = path.join(s.root, 'knowledge-releases/generic');
  await fs.cp(path.join(s.root, 'knowledge-releases', pkg.releaseId), generic, { recursive: true });
  const manifestPath = path.join(generic, 'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  Object.assign(manifest, { releaseId: 'generic', sources: {}, reviewRequired: false }); await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(activateRelease(s.root, 'generic', 'base', { acknowledgeReview: true }), /authenticated final/);
  await assert.rejects(activateRelease(s.root, s.candidateId, 'base', { acknowledgeReview: true }), /authenticated final/);
  await assert.rejects(activateRelease(s.root, pkg.releaseId, 'base', { acknowledgeReview: true, reviewAuthorization: {} }), /authenticated final/);
  const { issueReviewAuthorization } = from('card-review-authorization');
  await assert.rejects(activateRelease(s.root, pkg.releaseId, 'base', { acknowledgeReview: true,
    reviewAuthorization: issueReviewAuthorization(s.root, pkg.releaseId, 'base', 'activate', '0'.repeat(64)) }), /authenticated final/);
  assert.equal((await s.activate(bundleId, pkg)).ok, true);
  await assert.rejects(activateRelease(s.root, 'base', pkg.releaseId, { acknowledgeReview: true }), /authenticated final/);
});

test('decisions after staging invalidate older final-approval plans', async t => {
  const { s, bundleId, pkg } = await prepared(t), b = await s.get(bundleId);
  await s.ok('decide', { bundleId, expectedRevision: b.revision, actions: [s.action(b.items[0], 'hold')] });
  assert.equal((await s.activate(bundleId, pkg)).error.code, 'review-version-conflict'); assert.equal((await s.pointer()).releaseId, 'base');
});

test('new collection after staging or a changed active pointer blocks final approval', async t => {
  const { s, bundleId, pkg } = await prepared(t);
  s.setSource([card('alpha', { cardRevision: 2, englishText: 'Draw 2 cards.' }), card('beta')]); await s.engine.runOnce();
  assert.equal((await s.activate(bundleId, pkg)).error.code, 'review-stale');
  await fs.writeFile(path.join(s.root, 'knowledge-releases/active.json'), '{"releaseId":"other"}');
  assert.equal((await s.activate(bundleId, pkg)).error.code, 'review-stale');
});

for (const phase of ['before-pointer', 'after-pointer']) test(`activation failure ${phase} retains a durable intent and requires explicit recovery`, async t => {
  const { s, bundleId, pkg } = await prepared(t), originalRename = fs.rename, originalLink = fs.link;
  if (phase === 'before-pointer') fs.rename = async (source, target) => { if (target === path.join(s.root, 'knowledge-releases/active.json')) throw new Error('Synthetic pointer write failure.'); return originalRename(source, target); };
  else fs.link = async (source, target) => {
    if (target.includes('/card-reviews/events/') && JSON.parse(await fs.readFile(source, 'utf8')).event.payload.type === 'complete') throw new Error('Synthetic audit completion failure.');
    return originalLink(source, target);
  };
  try { assert.equal((await s.activate(bundleId, pkg)).ok, false); }
  finally { fs.rename = originalRename; fs.link = originalLink; }
  const entries = await fs.readdir(path.join(s.root, 'card-reviews/events'));
  const intent = (await Promise.all(entries.map(async n => JSON.parse(await fs.readFile(path.join(s.root, 'card-reviews/events', n), 'utf8')).event.payload)))
    .find(p => p.type === 'intent').intent;
  assert.equal((await s.pointer()).releaseId, phase === 'before-pointer' ? 'base' : pkg.releaseId);
  await fs.unlink(path.join(s.root, 'card-reviews/review.lock')); // Simulate explicit operator lock inspection in a disposable fixture.
  await s.reopen();
  assert.equal((await s.get(bundleId)).pendingIntents[0].id, intent.id);
  await rejects(s, 'recover', { intentId: intent.id, reason: 'Synthetic', confirmation: 'RECOVER_ISOLATED_DEVELOPMENT' }, 'review-forbidden', { credentialId: 'reader' });
  await rejects(s, 'decide', { bundleId, expectedRevision: 2, actions: [] }, 'review-recovery-required');
  const recovered = await s.ok('recover', { intentId: intent.id, confirmation: 'RECOVER_ISOLATED_DEVELOPMENT', reason: 'Synthetic inspected lock and pointer.' });
  assert.equal(recovered.applied, phase === 'after-pointer'); await s.reopen();
  assert.equal((await s.get(bundleId)).status, phase === 'after-pointer' ? 'active' : 'open');
});

test('translation-only approval reuses existing card data and gives the reviewed catalog a distinct version', async t => {
  const s = await reviewFixture(t, { standalone: true, baseCards: [card('alpha')], cards: [card('alpha')] });
  const { bundleId } = await s.register(), b = await s.get(bundleId); assert.equal(b.items.length, 1); assert.equal(b.items[0].type, 'translation');
  await s.approveAll(bundleId); const pkg = await s.stage(bundleId), approved = await loadRelease(s.root, pkg.releaseId), base = await loadRelease(s.root, 'base');
  assert.equal(approved.cardCatalog.cards[0].textEn, base.cardCatalog.cards[0].textEn);
  assert.ok(approved.cardCatalog.cards[0].textKo); assert.notEqual(approved.cardCatalog.version, base.cardCatalog.version);
  assert.equal(approved.cardCatalog.cards[0].translationRecord.review.status, 'approved');
});

test('synthetic proposals cannot gain an official label and non-mock card sources remain blocked', async t => {
  const s = await reviewFixture(t), saved = await s.translationStore.readCandidate(s.candidateId);
  const { stageTranslationCandidate } = from('card-translation-candidates');
  for (const kind of ['official-label', 'licensed-source']) {
    const candidate = structuredClone(saved.candidate);
    if (kind === 'official-label') Object.assign(candidate.catalog.cards[0].translationProposal, { authority: 'official', provider: 'riot-api', model: null, generatedAt: null });
    else candidate.catalog.cards[0].source.kind = 'licensed';
    const copy = await s.translationStore.writeCandidate(candidate), knowledge = await stageTranslationCandidate(s.root, candidate, { baseReleaseId: 'base' });
    await rejects(s, 'register', { candidateId: copy.id, knowledgeReleaseId: knowledge.releaseId, reason: 'Synthetic source guard test.' }, 'review-source-unapproved');
  }
});

test('session changes and expiry prevent an old Control Center session from issuing fresh commands', async t => {
  const s = await reviewFixture(t), old = s.request('list', {}); await s.reopen();
  assert.equal((await s.dispatch(old)).error.code, 'review-unauthorized');
  s.advance(3600001); assert.equal((await s.invoke('list', {})).error.code, 'review-unauthorized');
});

test('missing-card review cannot delete a retained card or publish an identical dataset', async t => {
  const s = await reviewFixture(t, { baseCards: [card('alpha')], cards: [] }), { bundleId } = await s.register();
  const b = await s.get(bundleId); assert.equal(b.items.length, 1); assert.ok(b.items[0].kinds.includes('missing-suspected'));
  await s.approveAll(bundleId); const result = await s.stage(bundleId); assert.equal(result.status, 'no-changes');
  assert.equal((await loadRelease(s.root, 'base')).cardCatalog.cards.length, 1);
  assert.equal((await fs.readdir(path.join(s.root, 'knowledge-releases'))).filter(n => n.startsWith('review-')).length, 0);
});

test('prepared package tampering and changed rollback data cannot silently replace the known good version', async t => {
  const { s, bundleId, pkg } = await prepared(t);
  const target = path.join(s.root, 'knowledge-releases', pkg.releaseId, 'cards.json'), bytes = await fs.readFile(target);
  await fs.appendFile(target, ' '); assert.equal((await s.activate(bundleId, pkg)).error.code, 'review-candidate-invalid');
  await fs.writeFile(target, bytes); assert.equal((await s.activate(bundleId, pkg)).ok, true);
  const b = await s.get(bundleId);
  const baseManifestPath = path.join(s.root, 'knowledge-releases/base/manifest.json'), baseManifest = JSON.parse(await fs.readFile(baseManifestPath, 'utf8'));
  const baseCardsPath = path.join(s.root, 'knowledge-releases/base/cards.json'); const changed = JSON.stringify({ schemaVersion: 1, version: 'changed', cards: [] });
  await fs.writeFile(baseCardsPath, changed); baseManifest.hashes['cards.json'] = crypto.createHash('sha256').update(changed).digest('hex'); await fs.writeFile(baseManifestPath, JSON.stringify(baseManifest));
  await rejects(s, 'get', { bundleId }, 'review-candidate-changed');
  await rejects(s, 'rollback', { bundleId, expectedRevision: b.revision, packageId: pkg.id, packageDigest: pkg.digest,
    expectedActiveReleaseId: pkg.releaseId, confirmation: 'ROLLBACK_ISOLATED_DEVELOPMENT', reason: 'Synthetic attempted changed backup.' }, 'review-candidate-changed');
  assert.equal((await s.pointer()).releaseId, pkg.releaseId);
});

test('unmarked roots, review-store links and invalid authentication configurations are rejected before private runtime files open', async t => {
  const s = await reviewFixture(t);
  assert.equal(await fs.stat(path.join(s.root, 'private')).then(() => true, () => false), false);
  await assert.rejects(createReviewControl({ root: s.root, authentication: { ...s.authentication(), credentials: [] } }), /review-auth-configuration/);
  const duplicate = structuredClone(s.credentials); duplicate[1].secret = duplicate[0].secret;
  await assert.rejects(createReviewControl({ root: s.root, authentication: { ...s.authentication(), credentials: duplicate } }), /review-auth-configuration/);
  const other = await reviewFixture(t); await fs.rename(path.join(other.root, 'card-reviews'), path.join(other.root, 'saved-reviews'));
  await fs.symlink(path.join(s.root, 'card-reviews'), path.join(other.root, 'card-reviews'), 'dir');
  await assert.rejects(createCardReviewStore(other.root), /review-store-invalid/);
  const marker = path.join(s.root, '.riftassist-environment.json'); await fs.unlink(marker);
  await assert.rejects(createCardReviewStore(s.root), /Prepare a separate/);
});

test('tampered audit chains, stale locks, unsafe roots and links fail closed', async t => {
  await assert.rejects(createCardReviewStore(path.resolve(release, '../..')), /production data tree/);
  const s = await reviewFixture(t); await s.register();
  const name = (await fs.readdir(path.join(s.root, 'card-reviews/events')))[0];
  await fs.appendFile(path.join(s.root, 'card-reviews/events', name), 'tamper');
  const response = await s.invoke('list', {}); assert.equal(response.ok, false); assert.equal(response.error.code, 'review-audit-unavailable');
  assert.equal((await s.pointer()).releaseId, 'base');
});

test('sync reservations block review writes rather than approving a moving snapshot', async t => {
  const s = await reviewFixture(t), { bundleId } = await s.register(), b = await s.get(bundleId); let releaseLock;
  const held = s.syncStore.exclusive(() => new Promise(resolve => { releaseLock = () => resolve({}); }));
  while (!releaseLock) await new Promise(resolve => setImmediate(resolve));
  await rejects(s, 'decide', { bundleId, expectedRevision: 0, actions: [s.action(b.items[0])] }, 'review-source-busy');
  releaseLock(); await held; assert.equal((await s.get(bundleId)).revision, 0);
});

test('private child-process protocol authenticates on inherited pipes without opening a server or reading existing keys', { timeout: 20000 }, async t => {
  const s = await reviewFixture(t); const authentication = s.authentication(); delete authentication.now;
  const child = spawn(process.execPath, [path.join(release, 'scripts/card-review-control.cjs')], { env: { RIFTASSI_DATA_ROOT: s.root }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); }); let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  child.stdio[3].end(JSON.stringify(authentication));
  const message = s.request('list', {}); message.issuedAt = Date.now(); message.signature = signRequest(message, s.credentials[0].secret);
  const lines = readline.createInterface({ input: child.stdout }); const response = once(lines, 'line');
  child.stdin.write(JSON.stringify(message) + '\n'); const [line] = await response;
  assert.equal(JSON.parse(line).ok, true); assert.ok(!line.includes(s.credentials[0].secret));
  const register = s.request('register', { candidateId: s.candidateId, knowledgeReleaseId: s.knowledgeReleaseId, reason: '합성 카드 검토를 시작합니다.' });
  register.issuedAt = Date.now(); register.signature = signRequest(register, s.credentials[0].secret);
  const next = once(lines, 'line'); child.stdin.write(JSON.stringify(register) + '\n'); const [registered] = await next;
  assert.equal(JSON.parse(registered).ok, true, registered); assert.ok(!registered.includes(s.credentials[0].secret));
  const ended = once(child, 'exit'); child.stdin.end(); const [code] = await ended;
  assert.equal(code, 0, stderr); assert.equal(stderr, '');
});
