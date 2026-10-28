const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertEnvironment } = require('./environment');
const { loadRelease, digest } = require('./knowledge-provider');
const { normalizeCatalog } = require('./cards');
async function stageTranslationCandidate(root, candidate, { baseReleaseId, candidateId = null, syncMetadata = null } = {}) {
  assertEnvironment(root);
  // Reuse verified base rules/cases byte for byte. Do not weaken the general
  // stageRelease rule-extraction sentinels for a card-translation-only update.
  const base = await loadRelease(root, baseReleaseId);
  const cards = normalizeCatalog(candidate.catalog);
  if (candidateId != null && !/^sync-[a-f0-9]{64}$/u.test(candidateId)) throw new Error('Invalid sync candidate ID.');
  const id = candidateId || `ko-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}`;
  const folder = path.join(root, 'knowledge-releases', id);
  try { await fs.mkdir(folder); }
  catch (error) {
    if (error.code !== 'EEXIST' || !candidateId || (await fs.lstat(folder)).isSymbolicLink()) throw error;
    const existing = await loadRelease(root, id);
    if (existing.manifest.sources?.cardSync?.key !== syncMetadata?.key || existing.manifest.sources?.cardTranslation?.baseReleaseId !== baseReleaseId
      || existing.manifest.hashes['cards.json'] !== digest(JSON.stringify(cards))
      || existing.manifest.hashes['rules.json'] !== base.manifest.hashes['rules.json']
      || existing.manifest.hashes['judge-cases.json'] !== base.manifest.hashes['judge-cases.json']) throw new Error('Existing sync candidate does not match.');
    return existing.manifest;
  }
  const hashes = {};
  for (const name of ['rules.json', 'judge-cases.json']) {
    const bytes = await fs.readFile(path.join(root, 'knowledge-releases', baseReleaseId, name));
    if (digest(bytes) !== base.manifest.hashes[name]) throw new Error('Translation base changed; rebuild the candidate.');
    await fs.writeFile(path.join(folder, name), bytes, { flag: 'wx' }); hashes[name] = digest(bytes);
  }
  const bytes = JSON.stringify(cards); hashes['cards.json'] = digest(bytes);
  await fs.writeFile(path.join(folder, 'cards.json'), bytes, { flag: 'wx' });
  const manifest = { ...base.manifest, releaseId: id, createdAt: new Date().toISOString(), effectiveFrom: null,
    reviewRequired: true, hashes, counts: { rules: base.evidence.length, cards: cards.cards.length, judgeCases: base.judgeCases.length },
    sources: { ...base.manifest.sources, ...(syncMetadata ? { cardSync: syncMetadata } : {}), cardTranslation: { version: candidate.review.engineVersion,
      baseReleaseId, glossaryDigest: candidate.review.glossaryDigest,
      pending: cards.cards.filter(card => card.translationProposal).length, automaticActivation: false } } };
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  return manifest;
}
module.exports = { stageTranslationCandidate };
