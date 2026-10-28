const { normalizeCatalog } = require('./cards');
const { assertPublication } = require('./card-publication');
const { symbolTokens } = require('./card-translation-core');
function convertCatalog(input, { permissions = { display: false, modelInput: false } } = {}) {
  if (input?.schema !== 'riftassist-canonical-1' || !['mock', 'riot-api'].includes(input.origin)
    || !input.version || !Array.isArray(input.cards) || input.cards.length > 20000) throw new Error('Invalid canonical card input.');
  const synthetic = input.origin === 'mock';
  if (!synthetic) {
    let url;
    try { url = new URL(input.sourceUrl); } catch { throw new Error('Canonical Riot data requires an API source.'); }
    if (!input.mappingVersion || url.protocol !== 'https:' || !url.hostname.endsWith('.api.riotgames.com') || url.username || url.password || url.search || url.hash) throw new Error('Canonical Riot data requires a reviewed API source.');
  }
  const cards = input.cards.map(card => {
    if (typeof card.id !== 'string' || typeof card.englishText !== 'string' || !card.englishText.trim()) throw new Error('An ID and English source text are required.');
    const officialKo = !synthetic && typeof card.officialKoreanText === 'string' ? card.officialKoreanText : '';
    const publication = assertPublication(card, input.origin);
    const alignedKo = officialKo && (card.officialKoreanEnglishVersion || input.version) === input.version;
    return { id: `${synthetic ? 'mock' : 'riot'}:${card.id}`, nameEn: card.englishName,
      nameKo: alignedKo ? card.officialKoreanName || '' : synthetic ? card.koreanName || '' : '',
      textEn: card.englishText, textKo: alignedKo ? officialKo : synthetic ? card.koreanText || '' : '',
      sourceKorean: synthetic ? { name: card.koreanName || '', text: card.koreanText || '', keywords: card.koreanKeywords || [] } : null,
      cost: card.cost || {}, keywordsEn: card.keywords || [], symbols: [...new Set([...(card.symbols || []), ...symbolTokens(card.englishText)])], publication,
      officialKorean: officialKo || card.officialKoreanName || card.officialKoreanKeywords?.length ? { name: card.officialKoreanName || '', text: officialKo, keywords: card.officialKoreanKeywords || [],
        version: card.officialKoreanVersion || input.version, englishVersion: card.officialKoreanEnglishVersion || input.version,
        url: input.sourceUrl } : null,
      officialKoreanCheck: { status: officialKo ? 'available' : synthetic || card.officialKoreanStatus === 'absent' ? 'absent' : 'unknown',
        englishVersion: input.version, url: input.sourceUrl, checkedAt: new Date().toISOString(), reference: synthetic ? 'synthetic-fixture' : input.mappingVersion || '' },
      code: card.code || '', type: card.type || '', set: card.set || '', domains: card.domains || [], stats: card.stats || {},
      imageUrl: synthetic ? '' : card.imageUrl || '', textVerified: true,
      translationStatus: alignedKo ? 'official' : synthetic ? 'mock' : 'not-translated',
      translationSource: { kind: officialKo ? 'riot-api' : synthetic ? 'mock' : 'none', reference: officialKo ? input.mappingVersion : synthetic ? 'synthetic-fixture' : '' },
      permissions: synthetic ? { display: true, modelInput: true, translation: true } : { display: permissions.display === true, modelInput: permissions.modelInput === true, translation: permissions.translation === true },
      source: { kind: input.origin, url: input.sourceUrl, version: input.version,
        cardId: card.id, cardVersion: card.cardVersion || input.version, cardRevision: card.cardRevision ?? null,
        publishedAt: card.publishedAt || '', updatedAt: card.updatedAt || input.publishedAt || '', fetchedAt: input.collectedAt || '',
        label: synthetic ? 'Synthetic development fixture; not a Riot card' : 'Riot API via a reviewed schema mapper',
        verification: synthetic ? 'synthetic-fixture' : `mapper:${input.mappingVersion}` },
      errata: card.errata || '', status: card.withdrawn === true ? 'withdrawn' : publication.state === 'preview-unreleased' ? 'preview-unreleased' : 'source-observed' };
  });
  return normalizeCatalog({ schemaVersion: 1, version: input.version, coverage: synthetic ? 'synthetic-fixtures-only' : 'review-required', cards });
}
// Translation is injected. There is no OpenAI call or background translation here.
async function translateCatalog(catalog, { translate, reviewReference } = {}) {
  // Backward-compatible mock-only callback. Real providers must use the persistent
  // candidate engine; this legacy entry point cannot label an AI result reviewed.
  const copy = structuredClone(catalog);
  for (const card of copy.cards) {
    if (card.translationStatus === 'official' || card.textKo) continue;
    if (typeof translate !== 'function' || !reviewReference) continue;
    if (card.source.kind !== 'mock') throw new Error('Use the persistent card translation candidate engine for real sources.');
    const result = await translate({ id: card.id, englishName: card.nameEn, englishText: card.textEn });
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('Translation requires reviewable non-empty text.');
    card.textKo = result.text; card.nameKo = result.name || '';
    card.translationStatus = 'mock';
    card.translationSource = { kind: card.source.kind === 'mock' ? 'mock' : 'unofficial', reference: reviewReference,
      englishHash: require('node:crypto').createHash('sha256').update(card.textEn).digest('hex') };
  }
  return normalizeCatalog(copy);
}
module.exports = { convertCatalog, translateCatalog };
