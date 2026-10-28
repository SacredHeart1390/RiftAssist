// Runtime views only. Never change knowledge files, permissions, releases or backups.
const crypto = require('node:crypto');
const { resolveCards } = require('./cards');
const VERSION = 'card-access-1';

function createCardAccess(configuredMode, { allowMock = false } = {}) {
  const mode = configuredMode === 'verified-only' ? 'verified-only' : 'restricted';
  const configurationValid = configuredMode == null || configuredMode === '' || ['restricted', 'verified-only'].includes(configuredMode);
  const views = new WeakMap();
  function snapshot(original) {
    if (views.has(original)) return views.get(original);
    const raw = original.cardCatalog;
    // An operator must verify the app's approval/license before enabling verified-only.
    // These per-card flags are necessary technical checks, not proof of legal permission.
    const cards = mode === 'restricted' ? [] : raw.cards.filter(card =>
      card.status !== 'withdrawn' && card.textVerified && card.textEn && card.source.url && card.source.version
      && (['riot-api', 'licensed'].includes(card.source.kind) || (allowMock && card.source.kind === 'mock' && card.source.verification === 'synthetic-fixture')) && card.permissions.display
    ).map(card => ({ ...card, modelReady: Boolean(card.modelReady && card.permissions.modelInput) }));
    const access = Object.freeze({ mode, configurationValid, retainedTotal: raw.cards.length,
      restrictedTotal: raw.cards.length - cards.length, visibleTotal: cards.length,
      modelReadyTotal: cards.filter(card => card.modelReady).length });
    const cacheScope = crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, mode,
      releaseId: original.releaseId, cards: raw.cards.map(card => card.contentHash) })).digest('hex');
    const view = Object.freeze({ ...original, rawCardCatalog: raw, cardAccess: access,
      cardCacheScope: cacheScope, cardCatalog: { ...raw, cards } });
    views.set(original, view);
    return view;
  }
  function resolve(view, ids, question, remembered = [], excluded = []) {
    // Validate old clients' identifiers using the intact catalog. Never expose this result.
    // Ignore exclusions during the rights check: a client cannot hide a blocked mention.
    const raw = resolveCards(view.rawCardCatalog, ids, question, remembered, []);
    const visible = new Set(view.cardCatalog.cards.map(card => card.id));
    const restricted = [...raw.selected, ...raw.unresolved].some(card => !visible.has(card.id));
    const filter = values => (values || []).filter(id => visible.has(id));
    const result = resolveCards(view.cardCatalog, filter(ids), question, filter(remembered), excluded);
    return { ...result, restricted };
  }
  return { snapshot, resolve };
}
module.exports = { createCardAccess, VERSION };
