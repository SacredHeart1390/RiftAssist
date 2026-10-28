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
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  if (assertEnvironment(DATA_ROOT) !== 'development' || process.argv.length > 3 || (process.argv[2] && process.argv[2] !== 'status')) throw new Error('Mock development sync only.');
  const store = await createCardSyncStore(DATA_ROOT);
  if (process.argv[2] === 'status') {
    const state = await store.readState();
    console.log(JSON.stringify({ status: state.status, failures: state.failures, lastAttempt: state.lastAttempt || null,
      lastSuccessAt: state.lastSuccessAt || null, nextAttemptAt: state.nextAttemptAt, activated: false })); return;
  }
  const pointer = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'knowledge-releases/active.json'), 'utf8'));
  const base = await loadRelease(DATA_ROOT, pointer.releaseId), translationStore = await createTranslationStore(DATA_ROOT);
  const translator = createCardTranslationEngine({ store: translationStore, provider: createMockCardTranslator(), glossary: buildGlossary({ rules: base.evidence }) });
  const engine = createCardSyncEngine({ store, translationStore, translator, adapter: createRiotAdapter(), enabled: false });
  const result = await engine.runOnce(); console.log(JSON.stringify(result));
  if (result.status === 'failed') process.exitCode = 1;
}
main().catch(() => { console.error('Mock card synchronization stopped. Inspect the isolated state and review queue; no active pointer was written.'); process.exitCode = 1; });
