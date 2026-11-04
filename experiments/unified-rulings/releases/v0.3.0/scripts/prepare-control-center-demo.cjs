// Explicit, local mock scenario. Never import existing cards or contact a provider.
const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createRiotAdapter } = require('../src/riot-adapter');
const { createTranslationStore } = require('../src/card-translation-store');
const { createCardTranslationEngine } = require('../src/card-translation');
const { createMockCardTranslator } = require('../src/mock-card-translator');
const { createCardSyncStore } = require('../src/card-sync-store');
const { createCardSyncEngine } = require('../src/card-sync');
const { loadRelease } = require('../src/knowledge-provider');
const { buildGlossary } = require('../src/card-translation-core');
async function main() {
  if (process.argv.length !== 2 || assertEnvironment(DATA_ROOT) !== 'development') throw new Error();
  const markerPath = path.join(DATA_ROOT, '.riftassist-control-center.json');
  if ((await fs.lstat(markerPath)).isSymbolicLink()) throw new Error();
  const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
  if (marker.schemaVersion !== 1 || marker.purpose !== 'synthetic-control-center' || !/^[a-f0-9-]{36}$/u.test(marker.id)) throw new Error();
  const current = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'knowledge-releases/active.json'), 'utf8'));
  const base = await loadRelease(DATA_ROOT, current.releaseId);
  if (base.cardCatalog.cards.some(card => card.source.kind !== 'mock')) throw new Error();
  const mock = await createRiotAdapter().collect(), publishedAt = '2026-10-28T00:00:00.000Z';
  const cards = mock.cards.map(card => ({ cardRevision: 1, cardVersion: 'synthetic-cc-1', publishedAt, updatedAt: publishedAt, ...card }));
  Object.assign(cards[0], { englishText: 'Draw 2 cards after combat.', koreanText: '전투 후 카드 2장을 뽑습니다.',
    errata: 'Synthetic demo errata only. Draw after combat.', cardRevision: 2, cardVersion: 'synthetic-cc-2' });
  cards.push({ id: 'practice-new', englishName: 'Practice New', englishText: 'Draw 1 card.', type: 'Spell', cost: { energy: 1 },
    symbols: [], keywords: [], releaseStatus: 'released', cardRevision: 1, cardVersion: 'synthetic-cc-1', publishedAt, updatedAt: publishedAt });
  const adapter = createRiotAdapter({ mockPageSource: async () => ({ snapshotId: 'control-center-demo-2', revision: 2,
    version: 'synthetic-cc-2', publishedAt, sourceUrl: mock.sourceUrl, expectedCount: cards.length, complete: true, nextCursor: null, cards }) });
  const store = await createCardSyncStore(DATA_ROOT), translationStore = await createTranslationStore(DATA_ROOT);
  const translator = createCardTranslationEngine({ store: translationStore, provider: createMockCardTranslator(), glossary: buildGlossary({ rules: base.evidence }) });
  const result = await createCardSyncEngine({ store, translationStore, translator, adapter }).runOnce();
  if (!result.candidateId || result.status === 'failed') throw new Error();
  console.log(JSON.stringify({ candidateId: result.candidateId, knowledgeReleaseId: result.candidateId, activated: false, mode: 'mock' }));
}
main().catch(() => { console.error('Control Center mock preparation stopped. Inspect the owned development sandbox.'); process.exitCode = 1; });
