const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createRiotAdapter } = require('../src/riot-adapter');
const { convertCatalog } = require('../src/riot-converter');
const { loadRelease } = require('../src/knowledge-provider');
const { createTranslationStore } = require('../src/card-translation-store');
const { createCardTranslationEngine } = require('../src/card-translation');
const { buildGlossary } = require('../src/card-translation-core');
const { createMockCardTranslator } = require('../src/mock-card-translator');
const { stageTranslationCandidate } = require('../src/card-translation-candidates');
async function preview() {
  if (assertEnvironment(DATA_ROOT) !== 'development' || process.argv.length !== 2) throw new Error('Development mock preview only.');
  const pointerBytes = await fs.readFile(path.join(DATA_ROOT, 'knowledge-releases/active.json'), 'utf8');
  const pointer = JSON.parse(pointerBytes);
  const base = await loadRelease(DATA_ROOT, pointer.releaseId), store = await createTranslationStore(DATA_ROOT);
  const engine = createCardTranslationEngine({ store, provider: createMockCardTranslator(), glossary: buildGlossary({ rules: base.evidence }) });
  const catalog = convertCatalog(await createRiotAdapter({ mode: 'mock' }).collect());
  const candidate = await engine.proposeCatalog(catalog, { previousCatalog: base.cardCatalog });
  const saved = await store.writeCandidate(candidate);
  const knowledge = await stageTranslationCandidate(DATA_ROOT, candidate, { baseReleaseId: pointer.releaseId });
  if ((await fs.readFile(path.join(DATA_ROOT, 'knowledge-releases/active.json'), 'utf8')) !== pointerBytes) throw new Error('Development active pointer changed externally.');
  return { mode: 'mock', cards: catalog.cards.length, activated: false, officialData: false,
    candidateId: saved.id, knowledgeCandidateId: knowledge.releaseId, reviewRequired: true,
    newMockCalls: engine.stats().newCalls, cacheHits: candidate.review.rows.filter(row => row.cacheHit).length };
}
if (require.main === module) preview().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error('Translation preview stopped. Inspect the isolated environment and candidate review queue; no active pointer was written.'); process.exitCode = 1;
});
module.exports = { preview };
