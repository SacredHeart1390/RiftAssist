// Our synthetic paging contract. A real Riot DTO/transport must be reviewed later.
const { hash, stable } = require('./card-translation-core');
const { assertPublication } = require('./card-publication');
const failure = (code, retryAfterMs = 0) => Object.assign(new Error(code), { code, retryAfterMs });
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const label = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,120}$/u.test(value);
async function collectMockSnapshot({ catalog, pageSource, maxPages = 100, timeoutMs = 15000, now = () => new Date().toISOString() }) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000 || !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60000) throw failure('sync-configuration');
  const defaultPage = { snapshotId: 'synthetic-development-1', revision: 1, version: catalog.version,
    publishedAt: '2026-10-28T00:00:00.000Z', sourceUrl: catalog.sourceUrl, expectedCount: catalog.cards.length,
    complete: true, nextCursor: null, cards: catalog.cards.map(card => ({ cardVersion: catalog.version, cardRevision: 1,
      publishedAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z', ...card })) };
  const fetchPage = pageSource || (async () => structuredClone(defaultPage));
  const pages = [], cards = [], ids = new Set(), cursors = new Set();
  let cursor = null, header;
  const controller = new AbortController(); let timer;
  try {
    return await Promise.race([
      (async () => {
        while (pages.length < maxPages) {
          let page;
          try { page = await fetchPage(cursor, { signal: controller.signal }); }
          catch (error) { if (error?.code === 'rate-limit') throw failure('sync-rate-limit', error.retryAfterMs); throw failure('sync-network'); }
          if (controller.signal.aborted) throw failure('sync-timeout');
          if (!page || page.complete !== true || !label(page.snapshotId) || !label(page.version)
            || !Number.isSafeInteger(page.revision) || page.revision < 0 || !stamp(page.publishedAt)
            || !Number.isSafeInteger(page.expectedCount) || page.expectedCount < 0 || page.expectedCount > 20000
            || !Array.isArray(page.cards) || page.cards.length > 20000) throw failure('sync-incomplete-response');
          let source;
          try { source = new URL(page.sourceUrl); } catch { throw failure('sync-invalid-data'); }
          if (source.protocol !== 'https:' || source.hostname !== 'example.invalid' || source.username || source.password || source.search || source.hash) throw failure('sync-source-mismatch');
          const metadata = { snapshotId: page.snapshotId, revision: page.revision, version: page.version,
            publishedAt: page.publishedAt, sourceUrl: source.href, expectedCount: page.expectedCount };
          if (header && stable(metadata) !== stable(header)) throw failure('sync-mixed-pages');
          header = metadata;
          for (const card of page.cards) {
            if (!card || !label(card.id) || typeof card.englishName !== 'string' || !card.englishName.trim()
              || typeof card.englishText !== 'string' || !card.englishText.trim() || !label(card.cardVersion)
              || !Number.isSafeInteger(card.cardRevision) || card.cardRevision < 0 || !stamp(card.publishedAt) || !stamp(card.updatedAt)
              || Date.parse(card.publishedAt) > Date.parse(card.updatedAt) || Date.parse(card.updatedAt) > Date.parse(header.publishedAt)) throw failure('sync-invalid-data');
            if (ids.has(card.id)) throw failure('sync-duplicate-card');
            try { assertPublication(card, 'mock'); } catch { throw failure('sync-invalid-publication'); }
            ids.add(card.id); cards.push(structuredClone(card));
          }
          if (cards.length > header.expectedCount || stable(cards).length > 16000000) throw failure('sync-size-or-count');
          pages.push(hash(metadata)); // Never persist cursor tokens or raw HTTP errors.
          if (page.nextCursor === null) {
            if (cards.length !== header.expectedCount) throw failure('sync-size-or-count');
            const collectedAt = now();
            if (!stamp(collectedAt) || Date.parse(header.publishedAt) > Date.parse(collectedAt)) throw failure('sync-invalid-time');
            return { schema: 'riftassist-canonical-1', origin: 'mock', version: header.version, sourceUrl: header.sourceUrl,
              publishedAt: header.publishedAt, collectedAt, cards,
              collection: { ...header, pageCount: pages.length, complete: true, collectedAt } };
          }
          if (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 500 || cursors.has(page.nextCursor)) throw failure('sync-pagination');
          cursors.add(page.nextCursor); cursor = page.nextCursor;
        }
        throw failure('sync-pagination');
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failure('sync-timeout')); }, timeoutMs); }),
    ]);
  } finally { controller.abort(); clearTimeout(timer); }
}
module.exports = { collectMockSnapshot, failure, stamp };
