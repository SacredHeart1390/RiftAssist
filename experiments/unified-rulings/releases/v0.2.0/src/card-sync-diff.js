const { hash, stable, englishSource } = require('./card-translation-core');
const { failure } = require('./riot-snapshot');
const locale = card => card.source.kind === 'mock' ? card.sourceKorean || { name: '', text: '', keywords: [] }
  : card.officialKorean ? { name: card.officialKorean.name, text: card.officialKorean.text, keywords: card.officialKorean.keywords } : null;
const metadata = card => ({ code: card.code, type: card.type, set: card.set, domains: card.domains, subtitle: card.subtitle,
  imageUrl: card.imageUrl, permissions: card.permissions, publishedAt: card.source.publishedAt });
const view = card => ({ englishHash: hash(englishSource(card)), english: englishSource(card), korean: locale(card), errata: card.errata,
  status: card.status, publication: card.publication, metadata: metadata(card), source: card.source });
function sourceDigest(catalog) {
  return hash([...catalog.cards].sort((a, b) => a.id.localeCompare(b.id)).map(card => ({ id: card.id, ...view(card),
    source: { kind: card.source.kind, url: card.source.url, cardId: card.source.cardId, cardVersion: card.source.cardVersion,
      cardRevision: card.source.cardRevision, publishedAt: card.source.publishedAt, updatedAt: card.source.updatedAt } })));
}
function compareCardCatalogs(before, after, { previousMissing = {} } = {}) {
  const old = new Map(before.cards.map(card => [card.id, card])), incoming = new Map(after.cards.map(card => [card.id, card]));
  const changes = [], translationIds = [];
  for (const card of after.cards) {
    const previous = old.get(card.id), kinds = [];
    if (!previous) kinds.push('new-card');
    else {
      if (previous.source.cardRevision != null && (card.source.cardRevision < previous.source.cardRevision
        || Date.parse(card.source.updatedAt) < Date.parse(previous.source.updatedAt))) throw failure('sync-card-version-reversal');
      if (hash(englishSource(previous)) !== hash(englishSource(card))) kinds.push('english-changed');
      if (previous.errata !== card.errata) kinds.push('errata-changed');
      if (stable(locale(previous)) !== stable(locale(card))) {
        const priorText = locale(previous)?.text, nextText = locale(card)?.text;
        kinds.push(!priorText && nextText ? 'official-korean-added' : priorText && !nextText ? 'official-korean-removed' : 'official-korean-changed');
      }
      if (previous.status !== card.status || stable(previous.publication) !== stable(card.publication)) kinds.push('release-status-changed');
      if (stable(metadata(previous)) !== stable(metadata(card))) kinds.push('metadata-changed');
      if (previous.source.cardRevision != null && card.source.cardRevision === previous.source.cardRevision
        && (kinds.length || previous.source.cardVersion !== card.source.cardVersion)) throw failure('sync-card-revision-conflict');
      if (previousMissing[card.id]) kinds.push('returned');
      if (!kinds.length && (previous.source.cardVersion !== card.source.cardVersion || previous.source.cardRevision !== card.source.cardRevision)) kinds.push('version-advanced');
    }
    if (kinds.some(k => ['new-card', 'english-changed', 'errata-changed', 'official-korean-added', 'official-korean-changed', 'official-korean-removed'].includes(k))) translationIds.push(card.id);
    if (kinds.length) changes.push({ cardId: card.id, kinds, simulated: card.source.kind === 'mock', before: previous ? view(previous) : null, after: view(card) });
  }
  for (const card of before.cards) if (!incoming.has(card.id) && !previousMissing[card.id]) changes.push({ cardId: card.id,
    kinds: ['missing-suspected'], simulated: card.source.kind === 'mock', before: view(card), after: null, retained: true });
  return { changes, translationIds, requiresCandidate: changes.some(row => row.kinds.some(kind => kind !== 'version-advanced')) };
}
module.exports = { compareCardCatalogs, sourceDigest, view, locale };
