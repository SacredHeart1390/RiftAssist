const fs = require('node:fs/promises');
const path = require('node:path');
const { loadRelease, digest } = require('../../releases/v0.1.3/src/knowledge-provider');
const { stageRelease, activateRelease } = require('../../releases/v0.1.3/src/knowledge-releases');
const { readJson } = require('../../releases/v0.1.3/src/source-discovery');
const { prepareCatalog } = require('./catalog');
async function importCards(root, data, history, { preview = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pointer = await readJson(path.join(root, 'knowledge-releases/active.json'), null);
    if (!pointer?.releaseId) throw Error('활성 자료를 찾지 못했습니다.');
    const current = await loadRelease(root, pointer.releaseId);
    const bytes = await fs.readFile(path.join(root, 'knowledge-releases', current.releaseId, 'cards.json'));
    if (digest(bytes) !== current.manifest.hashes['cards.json']) throw Error('카드 자료 해시가 일치하지 않습니다.');
    let result;
    try { result = prepareCatalog(data, JSON.parse(bytes), history); }
    catch (e) { e.code = 'review-required'; throw e; }
    const summary = { changed: result.changed, diff: result.diff, history: result.history, fullListing: result.fullListing,
      sourceCapturedAt: result.sourceCapturedAt, suppliedCount: result.suppliedCount, semanticHash: result.semanticHash,
      cards: result.catalog.cards.length, version: result.catalog.version, releaseId: current.releaseId };
    if (preview || !result.changed) return { ...summary, preview, published: false };
    const manifest = await stageRelease(root, { rules: current.evidence, cards: result.catalog, judgeCases: current.judgeCases,
      parserVersion: current.manifest.parserVersion, sources: { ...current.manifest.sources, riftnaru: {
        ...current.manifest.sources.riftnaru, version: result.catalog.version, capturedAt: result.sourceCapturedAt,
        suppliedCount: result.suppliedCount, fullListing: result.fullListing, adapter: 'provided-export-v1',
        verification: 'observed-public-page', officialVerification: false } } });
    try {
      await activateRelease(root, manifest.releaseId, current.releaseId);
      return { ...summary, published: true, releaseId: manifest.releaseId, previousReleaseId: current.releaseId };
    } catch (e) {
      const now = await readJson(path.join(root, 'knowledge-releases/active.json'), null);
      const conflict = now?.releaseId !== current.releaseId || e.message === 'Another activation is in progress.';
      if (conflict && attempt < 2) { await new Promise(r => setTimeout(r, 500)); continue; } // Rebase on the latest rules/Q&A/cards.
      if (conflict) e.code = 'retry-publication';
      throw e;
    }
  }
}
module.exports = { importCards };
