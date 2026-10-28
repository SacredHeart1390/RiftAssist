const { normalizeCatalog } = require('./cards');
function convertCatalog(input, { permissions = { display: false, modelInput: false } } = {}) {
  if (input?.schema !== 'riftassist-canonical-1' || !['mock', 'riot-api'].includes(input.origin)
    || !input.version || !Array.isArray(input.cards) || input.cards.length > 20000) throw new Error('Invalid canonical card input.');
  const synthetic = input.origin === 'mock';
  const cards = input.cards.map(card => {
    if (typeof card.id !== 'string' || typeof card.englishText !== 'string' || !card.englishText.trim()) throw new Error('An ID and English source text are required.');
    const officialKo = !synthetic && typeof card.officialKoreanText === 'string' ? card.officialKoreanText : '';
    return { id: `${synthetic ? 'mock' : 'riot'}:${card.id}`, nameEn: card.englishName,
      nameKo: officialKo ? card.officialKoreanName || '' : synthetic ? card.koreanName || '' : '',
      textEn: card.englishText, textKo: officialKo || (synthetic ? card.koreanText || '' : ''),
      code: card.code || '', type: card.type || '', set: card.set || '', domains: card.domains || [], stats: card.stats || {},
      imageUrl: synthetic ? '' : card.imageUrl || '', textVerified: true,
      translationStatus: officialKo ? 'official' : synthetic ? 'mock' : 'not-translated',
      translationSource: { kind: officialKo ? 'riot-api' : synthetic ? 'mock' : 'none', reference: officialKo ? input.mappingVersion : synthetic ? 'synthetic-fixture' : '' },
      permissions: synthetic ? { display: true, modelInput: true } : { display: permissions.display === true, modelInput: permissions.modelInput === true },
      source: { kind: input.origin, url: input.sourceUrl, version: input.version,
        label: synthetic ? 'Synthetic development fixture; not a Riot card' : 'Riot API via a reviewed schema mapper',
        verification: synthetic ? 'synthetic-fixture' : `mapper:${input.mappingVersion}` },
      status: card.preview === true ? 'preview-unreleased' : 'source-observed' };
  });
  return normalizeCatalog({ schemaVersion: 1, version: input.version, coverage: synthetic ? 'synthetic-fixtures-only' : 'review-required', cards });
}
// Translation is injected. There is no OpenAI call or background translation here.
async function translateCatalog(catalog, { translate, reviewReference } = {}) {
  const copy = structuredClone(catalog);
  for (const card of copy.cards) {
    if (card.translationStatus === 'official' || card.textKo) continue;
    if (typeof translate !== 'function' || !reviewReference) continue;
    const result = await translate({ id: card.id, englishName: card.nameEn, englishText: card.textEn });
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('Translation requires reviewable non-empty text.');
    card.textKo = result.text; card.nameKo = result.name || '';
    card.translationStatus = card.source.kind === 'mock' ? 'mock' : 'unofficial-reviewed';
    card.translationSource = { kind: card.source.kind === 'mock' ? 'mock' : 'unofficial', reference: reviewReference,
      englishHash: require('node:crypto').createHash('sha256').update(card.textEn).digest('hex') };
  }
  return normalizeCatalog(copy);
}
module.exports = { convertCatalog, translateCatalog };
