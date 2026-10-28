const { normalizeCatalog } = require('./cards');
const { officialURL } = require('./card-publication');
async function resolveOfficialKorean(card, { lookup, timeoutMs, now }) {
  if (card.source.kind !== 'riot-api') return { card };
  if (card.officialKorean && (!officialURL(card.officialKorean.url) || !card.officialKorean.version || !card.officialKorean.englishVersion)) return { card, error: 'official-korean-source-unconfirmed' };
  if (card.officialKorean?.text) return { card }; // A supplied aligned API record is checked by the engine.
  if (!lookup) {
    const check = card.officialKoreanCheck;
    return check?.status === 'absent' && check.englishVersion === card.source.version && officialURL(check.url)
      && check.reference && Number.isFinite(Date.parse(check.checkedAt))
      ? { card } : { card, error: 'official-korean-availability-unknown' };
  }
  const controller = new AbortController(); let timer;
  try {
    const found = await Promise.race([
      Promise.resolve().then(() => lookup({ cardId: card.id, englishVersion: card.source.version, locale: 'ko-KR' }, { signal: controller.signal })),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
    ]);
    if (!found || !['available', 'absent'].includes(found.status) || found.sourceKind !== 'riot-api'
      || found.englishVersion !== card.source.version || !officialURL(found.url)) return { card, error: 'official-korean-availability-unknown' };
    if (found.status === 'available' && (typeof found.text !== 'string' || !found.text.trim() || typeof found.version !== 'string' || !found.version)) return { card, error: 'official-korean-availability-unknown' };
    const officialKorean = found.status === 'available' ? { name: found.name || '', text: found.text, keywords: found.keywords || [], version: found.version, englishVersion: found.englishVersion, url: found.url }
      : card.officialKorean;
    const next = normalizeCatalog({ schemaVersion: 1, cards: [{ ...card, officialKorean, officialKoreanCheck: {
      status: found.status, englishVersion: found.englishVersion, url: found.url, checkedAt: now(), reference: 'injected-official-locale-lookup',
    } }] }).cards[0];
    return { card: next };
  } catch { return { card, error: controller.signal.aborted ? 'official-korean-lookup-timeout' : 'official-korean-lookup-failed' }; }
  finally { clearTimeout(timer); }
}
module.exports = { resolveOfficialKorean, officialURL };
