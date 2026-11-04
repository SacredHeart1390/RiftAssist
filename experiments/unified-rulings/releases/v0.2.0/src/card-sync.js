const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { convertCatalog } = require('./riot-converter');
const { normalizeCatalog } = require('./cards');
const { reuseCardTranslation } = require('./card-translation');
const { loadRelease } = require('./knowledge-provider');
const { stageTranslationCandidate } = require('./card-translation-candidates');
const { compareCardCatalogs, sourceDigest } = require('./card-sync-diff');
const { hash, englishSource } = require('./card-translation-core');
const { failure, stamp } = require('./riot-snapshot');

const CODES = new Set(['sync-network', 'sync-rate-limit', 'sync-timeout', 'sync-incomplete-response', 'sync-invalid-data',
  'sync-source-mismatch', 'sync-mixed-pages', 'sync-duplicate-card', 'sync-invalid-publication', 'sync-size-or-count', 'sync-pagination',
  'sync-invalid-time', 'sync-version-reversal', 'sync-revision-conflict', 'sync-card-version-reversal', 'sync-card-revision-conflict',
  'sync-base-changed', 'sync-unapproved-base', 'sync-official-disabled', 'sync-candidate-invalid', 'sync-store-invalid']);
function createCardSyncEngine({ store, translationStore, translator, adapter, intervalMs = 21600000,
  enabled = false, retryBaseMs = 60000, now = () => new Date().toISOString() } = {}) {
  if (!store || store.root !== translationStore?.root || !translator?.proposeCatalog || !adapter?.collectSnapshot
    || typeof enabled !== 'boolean' || !Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 604800000
    || !Number.isInteger(retryBaseMs) || retryBaseMs < 1000 || retryBaseMs > 21600000) throw failure('sync-configuration');
  function time() { const value = now(); if (!stamp(value)) throw failure('sync-invalid-time'); return value; }
  async function execute(scheduled) {
    return store.exclusive(async () => {
      const state = await store.readState(), startedAt = time(), milliseconds = Date.parse(startedAt);
      if (scheduled && !enabled) return { status: 'disabled', activated: false };
      if (state.retryBlocked) return { status: 'manual-review', code: 'sync-rate-limit-review', activated: false };
      if (state.nextAttemptAt && milliseconds < Date.parse(state.nextAttemptAt) && (scheduled || state.status === 'failed')) return { status: 'not-due', nextAttemptAt: state.nextAttemptAt, activated: false };
      const runId = crypto.randomUUID();
      await store.writeState({ ...state, status: 'running', lastAttempt: { runId, startedAt } });
      try {
        if (adapter.mode !== 'mock') throw failure('sync-official-disabled');
        const pointerBytes = await fs.readFile(path.join(store.root, 'knowledge-releases/active.json'), 'utf8');
        const baseReleaseId = JSON.parse(pointerBytes).releaseId, base = await loadRelease(store.root, baseReleaseId);
        if (base.cardCatalog.cards.some(card => card.source.kind !== 'mock')) throw failure('sync-unapproved-base');
        const previous = state.lastGood ? await store.observation(state.lastGood) : null;
        if (previous && previous.baseReleaseId !== baseReleaseId) throw failure('sync-base-changed');
        const snapshot = await adapter.collectSnapshot();
        const supplied = snapshot.collection || {};
        const meta = Object.fromEntries(['snapshotId', 'revision', 'version', 'publishedAt', 'sourceUrl', 'expectedCount', 'pageCount', 'complete', 'collectedAt'].map(key => [key, supplied[key]]));
        if (snapshot.origin !== 'mock' || meta.complete !== true || !Number.isSafeInteger(meta.revision) || meta.revision < 0
          || !stamp(meta.publishedAt) || !stamp(meta.collectedAt) || meta.expectedCount !== snapshot.cards?.length
          || !Number.isInteger(meta.pageCount) || meta.pageCount < 1 || meta.pageCount > 1000
          || !/^[A-Za-z0-9._:-]{1,120}$/u.test(meta.snapshotId || '') || !/^[A-Za-z0-9._:-]{1,120}$/u.test(meta.version || '')
          || Date.parse(meta.publishedAt) > Date.parse(meta.collectedAt) || Date.parse(meta.collectedAt) > Date.parse(time())
          || meta.version !== snapshot.version || meta.sourceUrl !== snapshot.sourceUrl) throw failure('sync-incomplete-response');
        let sourceURL;
        try { sourceURL = new URL(meta.sourceUrl); } catch { throw failure('sync-source-mismatch'); }
        if (sourceURL.protocol !== 'https:' || sourceURL.hostname !== 'example.invalid' || sourceURL.username || sourceURL.password || sourceURL.search || sourceURL.hash) throw failure('sync-source-mismatch');
        let incoming;
        try { incoming = convertCatalog(snapshot); } catch { throw failure('sync-invalid-data'); }
        const digest = sourceDigest(incoming);
        if (previous) {
          if (previous.metadata.sourceUrl !== meta.sourceUrl) throw failure('sync-source-mismatch');
          if (meta.revision < previous.metadata.revision || Date.parse(meta.publishedAt) < Date.parse(previous.metadata.publishedAt)) throw failure('sync-version-reversal');
          if (meta.revision === previous.metadata.revision && (digest !== previous.sourceDigest || meta.version !== previous.metadata.version)) throw failure('sync-revision-conflict');
        }
        const oldSource = normalizeCatalog(previous?.sourceCatalog || base.cardCatalog), oldCatalog = normalizeCatalog(previous?.catalog || base.cardCatalog);
        const diff = compareCardCatalogs(oldSource, incoming, { previousMissing: previous?.missing });
        const present = new Set(incoming.cards.map(card => card.id)), collectedAt = meta.collectedAt, missing = {}, index = {};
        const retained = oldSource.cards.filter(card => !present.has(card.id));
        for (const card of retained) missing[card.id] = { firstMissingAt: previous?.missing?.[card.id]?.firstMissingAt || collectedAt,
          observations: (previous?.missing?.[card.id]?.observations || 0) + 1, lastCheckedAt: collectedAt };
        const sourceCatalog = normalizeCatalog({ ...incoming, cards: [...incoming.cards, ...retained] });
        for (const card of sourceCatalog.cards) index[card.id] = { englishHash: hash(englishSource(card)), cardVersion: card.source.cardVersion,
          cardRevision: card.source.cardRevision, publishedAt: card.source.publishedAt, firstSeenAt: previous?.index?.[card.id]?.firstSeenAt || collectedAt,
          lastSeenAt: present.has(card.id) ? collectedAt : previous?.index?.[card.id]?.lastSeenAt || card.source.fetchedAt || startedAt, sourceUrl: card.source.url };
        const previousTranslations = new Map(oldCatalog.cards.map(card => [card.id, card]));
        const initialIds = previous ? [] : sourceCatalog.cards.filter(card => !previousTranslations.get(card.id)?.translationRecord
          && !previousTranslations.get(card.id)?.translationProposal && present.has(card.id)).map(card => card.id);
        for (const cardId of initialIds) if (!diff.changes.some(row => row.cardId === cardId)) diff.changes.push({ cardId,
          kinds: ['translation-initial-review'], simulated: true, before: null, after: index[cardId] });
        let candidateId = previous?.candidateId || null, catalog = oldCatalog, createdCandidate = false;
        if (diff.requiresCandidate || initialIds.length) {
          const key = hash({ digest, baseReleaseId, previousDigest: previous?.sourceDigest || null, previousCandidate: previous?.candidateId || null });
          candidateId = `sync-${key}`;
          let saved = await translationStore.readCandidate(candidateId);
          if (saved && saved.candidate.syncReview.key !== key) throw failure('sync-candidate-invalid');
          if (!saved) {
            const result = await translator.proposeCatalog(sourceCatalog, { previousCatalog: oldCatalog,
              changedCardIds: [...new Set([...diff.translationIds, ...initialIds])],
              invalidateTranslationIds: diff.changes.filter(row => row.kinds.includes('errata-changed')).map(row => row.cardId) });
            result.syncReview = { schemaVersion: 1, key, runId, createdAt: time(), baseReleaseId, sourceDigest: digest,
              metadata: meta, reviewRequired: true, activated: false, changes: diff.changes, missing,
              deletionPolicy: 'retain-and-review', simulated: true };
            await translationStore.writeCandidate(result, { candidateId });
            saved = await translationStore.readCandidate(candidateId);
          }
          const candidate = saved.candidate;
          await stageTranslationCandidate(store.root, candidate, { baseReleaseId, candidateId,
            syncMetadata: { key, candidateId, revision: meta.revision, sourceDigest: digest, simulated: true, automaticActivation: false } });
          catalog = candidate.catalog; createdCandidate = true;
        } else if (previous) {
          // Preserve generated/reviewed records without invoking the translation engine.
          const carried = new Map(oldCatalog.cards.map(card => [card.id, card]));
          catalog = normalizeCatalog({ ...sourceCatalog, cards: sourceCatalog.cards.map(card => reuseCardTranslation(card, carried.get(card.id))) });
        }
        if (await fs.readFile(path.join(store.root, 'knowledge-releases/active.json'), 'utf8') !== pointerBytes) throw failure('sync-base-changed');
        const observed = { schemaVersion: 1, baseReleaseId, metadata: meta, sourceDigest: digest,
          sourceCatalog, catalog, missing, index, candidateId, changes: diff.changes };
        const reference = await store.saveObservation(runId, observed), finishedAt = time();
        const result = { runId, status: createdCandidate ? 'candidate' : 'unchanged', candidateId, createdCandidate,
          changes: diff.changes.length, missing: Object.keys(missing).length, sourceRevision: meta.revision,
          activated: false, nextAttemptAt: new Date(Date.parse(finishedAt) + intervalMs).toISOString() };
        await store.attempt(runId, { ...result, startedAt, finishedAt });
        await store.writeState({ schemaVersion: 1, status: 'success', failures: 0, lastGood: reference,
          lastAttempt: result, lastSuccessAt: finishedAt, nextAttemptAt: result.nextAttemptAt });
        return result;
      } catch (error) {
        const code = CODES.has(error?.code) ? error.code : 'sync-failed', failures = state.failures + 1;
        const retryBlocked = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 2592000000;
        const retryAfter = Number.isFinite(error?.retryAfterMs) ? Math.max(0, Math.min(error.retryAfterMs, 2592000000)) : 0;
        const delay = Math.max(retryAfter, Math.min(21600000, retryBaseMs * 2 ** Math.min(failures - 1, 15)));
        const finishedAt = time(), result = { runId, status: 'failed', code, failures, activated: false,
          retryBlocked, nextAttemptAt: new Date(Date.parse(finishedAt) + delay).toISOString() };
        await store.attempt(runId, { ...result, startedAt, finishedAt });
        await store.writeState({ ...state, status: 'failed', failures, retryBlocked, lastAttempt: result, nextAttemptAt: result.nextAttemptAt });
        return result;
      }
    });
  }
  return { runOnce: () => execute(false), runDue: () => execute(true), enabled };
}
function startCardSyncScheduler(engine, { pollMs = 60000, onResult = () => {}, timers = globalThis } = {}) {
  if (!engine.enabled || !Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 3600000) throw failure('sync-scheduler-disabled');
  let busy = false, stopped = false;
  const emit = result => { try { onResult(result); } catch { /* Logging callbacks cannot restart or fail synchronization. */ } };
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try { emit(await engine.runDue()); }
    catch { emit({ status: 'failed', code: 'sync-store-unavailable', activated: false }); }
    finally { busy = false; }
  };
  const timer = timers.setInterval(tick, pollMs); timer.unref?.();
  return { tick, stop: () => { stopped = true; timers.clearInterval(timer); } };
}
module.exports = { createCardSyncEngine, startCardSyncScheduler };
