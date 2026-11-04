const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { hash, englishSource } = require('./card-translation-core');
const { normalizeCatalog } = require('./cards');
const { compareCardCatalogs } = require('./card-sync-diff');
const { reviewTranslation } = require('./card-translation');
const { loadRelease, safeId } = require('./knowledge-provider');
const { stageTranslationCandidate } = require('./card-translation-candidates');
const { activateRelease } = require('./knowledge-releases');
const { issueReviewAuthorization } = require('./card-review-authorization');
const { assertScope, assertIdentity, error } = require('./card-review-auth');

const permissions = new Map([['register', 'review:decide'], ['list', 'review:read'], ['get', 'review:read'], ['decide', 'review:decide'],
  ['stage', 'cards:stage'], ['activate', 'cards:activate'], ['rollback', 'cards:rollback'], ['audit', 'audit:read']]);
const reason = value => { if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw error('review-reason-required'); return value.trim(); };
const sameSet = (a, b) => Array.isArray(a) && a.length === new Set(a).size && hash([...a].sort()) === hash([...b].sort());
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
async function createCardReviewService({ store, translationStore, syncStore, now = () => new Date().toISOString() }) {
  if (!store || store.root !== translationStore?.root || store.root !== syncStore?.root) throw error('review-configuration');
  const root = store.root;
  async function readRelease(id) {
    if (!safeId(id)) throw error('review-candidate-invalid', 409);
    try {
      const folder = path.join(root, 'knowledge-releases', id);
      if ((await fs.lstat(path.dirname(folder))).isSymbolicLink() || (await fs.lstat(folder)).isSymbolicLink()) throw new Error();
      for (const file of ['manifest.json', 'cards.json', 'rules.json', 'judge-cases.json']) if ((await fs.lstat(path.join(folder, file))).isSymbolicLink()) throw new Error();
      return await loadRelease(root, id);
    } catch { throw error('review-candidate-invalid', 409); }
  }
  async function pointer() {
    const file = path.join(root, 'knowledge-releases/active.json');
    if ((await fs.lstat(file)).isSymbolicLink()) throw error('review-candidate-invalid', 409);
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!safeId(value.releaseId)) throw error('review-candidate-invalid', 409);
    return value;
  }
  async function input(candidateId, knowledgeId) {
    let saved;
    try { saved = await translationStore.readCandidate(candidateId); } catch { throw error('review-candidate-invalid', 409); }
    if (!saved) throw error('review-not-found', 404);
    const knowledge = await readRelease(knowledgeId), baseId = knowledge.manifest.sources?.cardTranslation?.baseReleaseId;
    const base = await readRelease(baseId); let catalog;
    try { catalog = normalizeCatalog(saved.candidate.catalog); } catch { throw error('review-candidate-invalid', 409); }
    if (hash(catalog) !== hash(knowledge.cardCatalog) || knowledge.manifest.reviewRequired !== true
      || [...base.cardCatalog.cards, ...catalog.cards].some(card => card.source.kind !== 'mock'
        || [card.translationRecord, card.translationProposal].some(record => record?.authority === 'official'))) throw error('review-source-unapproved', 409);
    const digest = hash({ manifest: saved.manifest, knowledgeHashes: knowledge.manifest.hashes, baseHashes: base.manifest.hashes });
    let diff;
    try { diff = compareCardCatalogs(base.cardCatalog, catalog); } catch { throw error('review-candidate-invalid', 409); }
    const changes = new Map();
    for (const row of [...diff.changes, ...(saved.candidate.syncReview?.changes || [])]) {
      if (row.kinds.every(kind => ['version-advanced', 'translation-initial-review'].includes(kind))) continue;
      const kinds = changes.get(row.cardId) || []; changes.set(row.cardId, [...new Set([...kinds, ...row.kinds])]);
    }
    const before = new Map(base.cardCatalog.cards.map(card => [card.id, card])), after = new Map(catalog.cards.map(card => [card.id, card]));
    for (const card of base.cardCatalog.cards) if (!after.has(card.id)) changes.set(card.id, ['missing-suspected']);
    const items = [];
    function add(cardId, type, kinds, warnings, details) {
      const id = `${cardId}/${type}`, fingerprint = hash({ id, kinds, warnings, details });
      items.push({ id, cardId, type, kinds, warnings, fingerprint, ...details });
    }
    for (const [cardId, kinds] of changes) {
      const old = before.get(cardId) || null, next = after.get(cardId) || null;
      const warnings = [{ code: 'mock-source', severity: 'review' }];
      for (const code of kinds.filter(kind => ['missing-suspected', 'errata-changed', 'english-changed'].includes(kind))) warnings.push({ code, severity: 'review' });
      if (next?.status === 'preview-unreleased') warnings.push({ code: 'preview-unreleased', severity: 'review' });
      add(cardId, 'data', kinds, warnings, { before: old, after: next, deletionPolicy: 'retain' });
    }
    for (const card of catalog.cards) if (card.translationProposal) {
      const row = saved.candidate.review.rows.find(row => row.cardId === card.id);
      add(card.id, 'translation', ['translation-proposal'], card.translationProposal.validation.issues, {
        before: before.get(card.id) || null, after: card, previousEnglish: row?.previousEnglish || null,
        previousTranslation: row?.before || null, previousProposal: row?.previousProposal || null,
        proposal: card.translationProposal, englishHash: hash(englishSource(card)),
      });
    }
    items.sort((a, b) => a.id.localeCompare(b.id));
    return { saved, knowledge, base, catalog, digest, items, changes };
  }
  async function withSync(work) {
    const result = await syncStore.exclusive(async () => { try { return { value: await work() }; } catch (e) { return { failure: e }; } });
    if (result.status === 'busy') throw error('review-source-busy', 409);
    if (result.failure) throw result.failure;
    return result.value;
  }
  async function current(tx, bundle, loaded) {
    if (bundle.status === 'active' || bundle.status === 'rolled-back') throw error('review-sealed', 409);
    if ((await pointer()).releaseId !== bundle.baseReleaseId || loaded.digest !== bundle.candidateDigest) throw error('review-stale', 409);
    const latest = Object.values(tx.state.bundles).filter(b => b.baseReleaseId === bundle.baseReleaseId).at(-1);
    if (latest?.id !== bundle.id) throw error('review-superseded', 409);
    const sync = await syncStore.readState();
    if (sync.lastGood) {
      const observation = await syncStore.observation(sync.lastGood);
      if (bundle.candidateId.startsWith('sync-') && observation.candidateId !== bundle.candidateId) throw error('review-stale', 409);
      if (!bundle.candidateId.startsWith('sync-')) {
        try { if (compareCardCatalogs(observation.sourceCatalog, loaded.catalog).requiresCandidate) throw new Error(); }
        catch { throw error('review-stale', 409); }
      }
    } else if (bundle.candidateId.startsWith('sync-')) throw error('review-source-unconfirmed', 409);
  }
  function bundleFor(tx, params) {
    if (!hex(params.bundleId) || !tx.state.bundles[params.bundleId]) throw error('review-not-found', 404);
    const b = tx.state.bundles[params.bundleId];
    if (!Number.isInteger(params.expectedRevision) || params.expectedRevision !== b.revision) throw error('review-version-conflict', 409);
    return b;
  }
  async function complete(tx, context, intent, applied, recovered = false) {
    const result = { intentId: intent.id, bundleId: intent.bundleId, packageId: intent.packageId, action: intent.action,
      applied, recovered, releaseId: applied ? intent.target : intent.from, previousReleaseId: intent.from };
    await tx.append(context.actor, { type: 'complete', intentId: intent.id, operationId: intent.operationId,
      operationDigest: intent.operationDigest, result }); return result;
  }
  async function execute(method, params, context) {
    assertIdentity(context);
    const scope = method === 'recover' ? null : permissions.get(method);
    if (method !== 'recover' && !scope) throw error('review-method-not-found', 404);
    if (scope) assertScope(context, scope);
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw error('review-params-invalid');
    return store.transaction(async tx => {
      const mutation = !['list', 'get', 'audit'].includes(method), operationDigest = hash({ method, params });
      const operation = tx.state.operations[context.requestId];
      if (mutation && operation) {
        if (operation.digest !== operationDigest || operation.actor !== context.actor) throw error('review-operation-conflict', 409);
        return operation.result;
      }
      if (mutation && method !== 'recover' && Object.values(tx.state.intents).some(intent => !intent.outcome)) throw error('review-recovery-required', 409);
      const record = async (type, payload, result) => { await tx.append(context.actor, { type, ...payload, requestId: context.requestId,
        ...(mutation ? { operationId: context.requestId, operationDigest, result } : {}) }); return result; };
      if (method === 'list') {
        const offset = params.offset ?? 0, limit = params.limit ?? 20, bundles = Object.values(tx.state.bundles);
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw error('review-page-invalid');
        return record('read', {}, { total: bundles.length, bundles: bundles.slice(offset, offset + limit).map(b => ({ id: b.id, candidateId: b.candidateId,
          revision: b.revision, status: b.status || 'open', itemCount: b.itemIndex.length, baseReleaseId: b.baseReleaseId })) });
      }
      if (method === 'audit') {
        const offset = params.offset ?? 0, limit = params.limit ?? 20;
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw error('review-page-invalid');
        const events = tx.state.events.slice(offset, offset + limit).map(event => ({ sequence: event.sequence, hash: hash(event), previous: event.previous,
          actor: event.actor, at: event.at, type: event.payload.type,
          requestId: event.payload.operationId || event.payload.requestId || null,
          bundleId: event.payload.bundleId || event.payload.bundle?.id || event.payload.intent?.bundleId || null,
          intentId: event.payload.intentId || event.payload.intent?.id || null,
          reason: event.payload.reason || event.payload.intent?.reason || null,
          decisions: event.payload.decisions ? Object.fromEntries(Object.entries(event.payload.decisions).map(([id, { approvedRecord, ...decision }]) => [id, decision])) : null }));
        return record('read', {}, { events, total: tx.state.events.length });
      }
      if (method === 'register') return withSync(async () => {
        const loaded = await input(params.candidateId, params.knowledgeReleaseId || params.candidateId);
        if ((await pointer()).releaseId !== loaded.base.releaseId || !loaded.items.length) throw error('review-stale', 409);
        const id = hash({ candidateId: params.candidateId, knowledgeReleaseId: loaded.knowledge.releaseId, digest: loaded.digest });
        const existing = tx.state.bundles[id];
        if (existing) return record('noop', {}, { bundleId: id, revision: existing.revision, reused: true });
        const latest = Object.values(tx.state.bundles).filter(b => b.baseReleaseId === loaded.base.releaseId).at(-1);
        if (latest && Date.parse(loaded.saved.manifest.createdAt) < Date.parse(latest.createdAt)) throw error('review-stale', 409);
        const bundle = { id, candidateId: params.candidateId, knowledgeReleaseId: loaded.knowledge.releaseId,
          candidateDigest: loaded.digest, baseReleaseId: loaded.base.releaseId, baseHashes: loaded.base.manifest.hashes,
          createdAt: loaded.saved.manifest.createdAt, status: 'open', itemIndex: loaded.items.map(({ id, cardId, type, fingerprint }) => ({ id, cardId, type, fingerprint })) };
        // Check latest source before registering, without making a superseding bundle current yet.
        const sync = await syncStore.readState();
        if (params.candidateId.startsWith('sync-') && (!sync.lastGood || (await syncStore.observation(sync.lastGood)).candidateId !== params.candidateId)) throw error('review-stale', 409);
        return record('register', { bundle, reason: reason(params.reason) }, { bundleId: id, revision: 0, reused: false });
      });
      if (method === 'get') {
        const b = hex(params.bundleId) && tx.state.bundles[params.bundleId]; if (!b) throw error('review-not-found', 404);
        const loaded = await input(b.candidateId, b.knowledgeReleaseId);
        if (loaded.digest !== b.candidateDigest) throw error('review-candidate-changed', 409);
        const offset = params.offset ?? 0, limit = params.limit ?? 10;
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw error('review-page-invalid');
        let staleReason = null; try { await current(tx, b, loaded); } catch (e) { staleReason = e.code || 'review-stale'; }
        return record('read', { bundleId: b.id }, { bundleId: b.id, revision: b.revision, status: b.status, candidateDigest: b.candidateDigest,
          baseReleaseId: b.baseReleaseId, staleReason, total: loaded.items.length, packages: b.packages,
          pendingIntents: Object.values(tx.state.intents).filter(intent => intent.bundleId === b.id && !intent.outcome)
            .map(({ id, action, from, target, packageId, reason }) => ({ id, action, from, target, packageId, reason })),
          items: loaded.items.slice(offset, offset + limit).map(item => ({ ...item, decision: b.decisions[item.id] || null })) });
      }
      if (method === 'recover') {
        const intent = tx.state.intents[params.intentId]; if (!intent || intent.outcome) throw error('review-intent-not-pending', 409);
        assertScope(context, intent.action === 'activate' ? 'cards:activate' : 'cards:rollback');
        reason(params.reason); if (params.confirmation !== 'RECOVER_ISOLATED_DEVELOPMENT') throw error('review-confirmation-required');
        return withSync(async () => {
          const active = await pointer();
          if (active.releaseId !== intent.from && !(active.releaseId === intent.target && active.previousReleaseId === intent.from)) throw error('review-recovery-conflict', 409);
          const target = await readRelease(active.releaseId), b = tx.state.bundles[intent.bundleId], pkg = b.packages[intent.packageId];
          if ((active.releaseId === pkg.releaseId && hash(target.manifest) !== pkg.digest)
            || (active.releaseId === pkg.baseReleaseId && hash(target.manifest.hashes) !== hash(b.baseHashes))) throw error('review-candidate-changed', 409);
          const result = await complete(tx, context, intent, active.releaseId === intent.target, true);
          await record('recovery', { reason: params.reason }, result); return result;
        });
      }
      const b = bundleFor(tx, params);
      if (method === 'rollback') return withSync(async () => {
        const pkg = b.packages[params.packageId];
        const receipt = Object.values(tx.state.intents).find(intent => intent.packageId === params.packageId && intent.action === 'activate' && intent.outcome?.applied);
        if (!pkg || !receipt || b.status !== 'active' || params.packageDigest !== pkg.digest || params.expectedActiveReleaseId !== pkg.releaseId
          || (await pointer()).releaseId !== pkg.releaseId) throw error('review-version-conflict', 409);
        if (params.confirmation !== 'ROLLBACK_ISOLATED_DEVELOPMENT') throw error('review-confirmation-required');
        const rollbackTarget = await readRelease(pkg.baseReleaseId);
        if (hash(rollbackTarget.manifest.hashes) !== hash(b.baseHashes)) throw error('review-candidate-changed', 409);
        const intent = { id: crypto.randomUUID(), bundleId: b.id, packageId: pkg.id, from: pkg.releaseId, target: pkg.baseReleaseId,
          action: 'rollback', reason: reason(params.reason), operationId: context.requestId, operationDigest };
        await tx.append(context.actor, { type: 'intent', intent });
        await activateRelease(root, intent.target, intent.from, { acknowledgeReview: true,
          reviewAuthorization: issueReviewAuthorization(root, intent.target, intent.from, 'rollback', hash(rollbackTarget.manifest)) });
        return complete(tx, context, intent, true);
      });
      return withSync(async () => {
        const loaded = await input(b.candidateId, b.knowledgeReleaseId); await current(tx, b, loaded);
        if (hash(loaded.items.map(({ id, cardId, type, fingerprint }) => ({ id, cardId, type, fingerprint }))) !== hash(b.itemIndex)) throw error('review-candidate-changed', 409);
        if (method === 'decide') {
          if (!Array.isArray(params.actions) || !params.actions.length || params.actions.length > 50
            || new Set(params.actions.map(a => a.itemId)).size !== params.actions.length) throw error('review-actions-invalid');
          const decisions = {};
          for (const action of params.actions) {
            const item = loaded.items.find(i => i.id === action.itemId);
            if (!item || item.fingerprint !== action.expectedFingerprint || !['approve', 'reject', 'hold'].includes(action.decision)) throw error('review-item-conflict', 409);
            if (b.decisions[item.id]?.decision === action.decision) throw error('review-duplicate-decision', 409);
            const value = { decision: action.decision, reason: reason(action.reason), actor: context.actor, at: now(), fingerprint: item.fingerprint };
            if (action.decision === 'approve') {
              if (item.warnings.some(w => w.severity === 'error')) throw error('review-validation-blocked', 409);
              if (!sameSet(action.acknowledgeWarnings || [], [...new Set(item.warnings.map(w => w.code))])) throw error('review-warnings-required');
              if (item.type === 'translation') {
                try { value.approvedRecord = reviewTranslation(item.after, { proposalId: item.proposal.id, expectedEnglishHash: item.englishHash,
                  reviewReference: `control-${context.actor}-${context.requestId}`, acknowledgeWarnings: action.acknowledgeWarnings, at: value.at }).translationRecord; }
                catch { throw error('review-validation-blocked', 409); }
              }
            }
            decisions[item.id] = value;
          }
          return record('decide', { bundleId: b.id, decisions }, { bundleId: b.id, revision: b.revision + 1, changed: params.actions.length });
        }
        if (method === 'stage') {
          reason(params.reason);
          const excluded = loaded.items.filter(i => b.decisions[i.id]?.decision !== 'approve').map(i => i.id);
          if (!sameSet(params.acknowledgeExcluded || [], excluded)) throw error('review-exclusions-required');
          const approved = loaded.items.filter(i => b.decisions[i.id]?.decision === 'approve');
          if (!approved.length) throw error('review-no-approved-items', 409);
          const selected = new Map(loaded.base.cardCatalog.cards.map(card => [card.id, structuredClone(card)]));
          const dataItems = new Set(loaded.items.filter(i => i.type === 'data').map(i => i.cardId));
          for (const item of approved.filter(i => i.type === 'data')) if (item.after) {
            if (item.kinds.includes('missing-suspected') || item.kinds.every(kind => ['returned', 'version-advanced'].includes(kind))) continue;
            const old = selected.get(item.cardId), fresh = structuredClone(item.after);
            const keep = old?.translationRecord?.review.status === 'approved' && hash(englishSource(old)) === hash(englishSource(fresh))
              && !item.kinds.some(k => ['errata-changed', 'official-korean-added', 'official-korean-changed', 'official-korean-removed'].includes(k));
            Object.assign(fresh, { nameKo: keep ? old.nameKo : '', textKo: keep ? old.textKo : '', keywordsKo: keep ? old.keywordsKo : [],
              translationRecord: keep ? { ...old.translationRecord, appliedToVersion: fresh.source.version } : null,
              translationProposal: null, translationStatus: keep ? old.translationStatus : 'translation-review-pending',
              translationSource: keep ? old.translationSource : { kind: 'none', reference: '', englishHash: hash(englishSource(fresh)) } });
            selected.set(item.cardId, fresh);
          }
          for (const item of approved.filter(i => i.type === 'translation')) {
            if (dataItems.has(item.cardId) && b.decisions[`${item.cardId}/data`]?.decision !== 'approve') throw error('review-data-prerequisite', 409);
            const card = selected.get(item.cardId), record = b.decisions[item.id].approvedRecord;
            if (!card || hash(englishSource(card)) !== record.englishHash) throw error('review-item-conflict', 409);
            Object.assign(card, { nameKo: record.nameKo, textKo: record.textKo, keywordsKo: record.keywordsKo,
              translationProposal: null, translationRecord: { ...record, appliedToVersion: card.source.version },
              translationStatus: record.authority === 'official' ? 'official' : record.authority === 'mock' ? 'mock' : 'unofficial-ai-reviewed',
              translationSource: { kind: record.authority === 'official' ? 'riot-api' : record.authority === 'mock' ? 'mock' : 'unofficial', reference: record.review.reference, englishHash: record.englishHash },
              translationHistory: [...new Set([...card.translationHistory, record.id])] });
          }
          const cards = normalizeCatalog({ ...loaded.base.cardCatalog, cards: [...selected.values()] });
          if (hash(cards.cards) === hash(loaded.base.cardCatalog.cards)) return record('noop', { bundleId: b.id, reason: reason(params.reason) }, { status: 'no-changes', bundleId: b.id, revision: b.revision });
          const decisionDigest = hash(b.decisions), id = hash({ bundleId: b.id, digest: loaded.digest, decisionDigest });
          if (b.packages[id]?.validAtRevision === b.revision) return record('noop', {}, b.packages[id]);
          const releaseId = `review-${id}`, reviewMetadata = { packageId: id, bundleId: b.id, decisionDigest,
            candidateDigest: loaded.digest, rollbackReleaseId: b.baseReleaseId, finalApprovalRequired: true };
          const manifest = await stageTranslationCandidate(root, { catalog: { ...cards, version: `reviewed-${id.slice(0, 20)}` }, review: { engineVersion: 'card-review-1', glossaryDigest: loaded.saved.candidate.review.glossaryDigest } },
            { baseReleaseId: b.baseReleaseId, candidateId: releaseId, reviewMetadata });
          const pkg = { id, releaseId, baseReleaseId: b.baseReleaseId, decisionDigest, validAtRevision: b.revision + 1,
            manifestHashes: manifest.hashes, digest: hash(manifest), approved: approved.map(i => i.id), excluded, stagedAt: now() };
          return record('stage', { bundleId: b.id, package: pkg, reason: reason(params.reason) }, pkg);
        }
        if (method === 'activate') {
          const pkg = b.packages[params.packageId];
          if (!pkg || pkg.validAtRevision !== b.revision || pkg.decisionDigest !== hash(b.decisions)
            || params.packageDigest !== pkg.digest || params.expectedActiveReleaseId !== b.baseReleaseId) throw error('review-version-conflict', 409);
          if (params.confirmation !== 'ACTIVATE_ISOLATED_DEVELOPMENT') throw error('review-confirmation-required');
          const prepared = await readRelease(pkg.releaseId);
          if (hash(prepared.manifest) !== pkg.digest) throw error('review-candidate-changed', 409);
          const intent = { id: crypto.randomUUID(), bundleId: b.id, packageId: pkg.id, from: b.baseReleaseId, target: pkg.releaseId,
            action: 'activate', reason: reason(params.reason), operationId: context.requestId, operationDigest };
          await tx.append(context.actor, { type: 'intent', intent });
          await activateRelease(root, intent.target, intent.from, { acknowledgeReview: true,
            reviewAuthorization: issueReviewAuthorization(root, intent.target, intent.from, 'activate', pkg.digest) });
          return complete(tx, context, intent, true);
        }
        throw error('review-method-not-found', 404);
      });
    });
  }
  async function auditFailure(context, code, requestId = null) {
    return store.transaction(tx => tx.append(context?.actor || 'unauthenticated', { type: 'denied', code, requestId: context?.requestId || requestId }));
  }
  return { execute, auditFailure };
}
module.exports = { createCardReviewService };
