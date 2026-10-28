const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { APP_ROOT, DATA_ROOT } = require('../src/paths');
const { createRiotAdapter } = require('../src/riot-adapter');
const { convertCatalog } = require('../src/riot-converter');
async function main() {
  // Only a fresh directory can be initialized; never overwrite a pointer or DB.
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const existing = await fs.readdir(DATA_ROOT);
  if (existing.length) throw new Error('Choose a new empty development data directory. Existing data was not changed.');
  await fs.writeFile(path.join(DATA_ROOT, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.2.0', environment: 'development' }), { flag: 'wx' });
  const id = 'synthetic-development-1', folder = path.join(DATA_ROOT, 'knowledge-releases', id);
  await fs.mkdir(folder, { recursive: true });
  const rules = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'dev-fixtures/rules.json'), 'utf8'));
  const cards = convertCatalog(await createRiotAdapter().collect()), hashes = {};
  for (const [name, value] of Object.entries({ 'rules.json': rules, 'cards.json': cards, 'judge-cases.json': [] })) {
    const bytes = JSON.stringify(value); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(folder, name), bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ schemaVersion: 1, compatibleSchema: 2,
    releaseId: id, validationStatus: 'validated', hashes, sources: { riftjudge: { coverage: 'live-search-only' }, development: { syntheticCards: true, rules: 'fixed regression fixture; not a Riot API import' } } }), { flag: 'wx' });
  await fs.writeFile(path.join(DATA_ROOT, 'knowledge-releases/active.json'), JSON.stringify({ releaseId: id }), { flag: 'wx' });
  const worker = path.join(DATA_ROOT, 'releases/v0.2.0'); await fs.mkdir(worker, { recursive: true });
  for (const name of ['src', 'public', 'manager-ui', 'dev-fixtures']) await fs.cp(path.join(APP_ROOT, name), path.join(worker, name), { recursive: true });
  await fs.writeFile(path.join(worker, 'app-release.json'), JSON.stringify({ releaseId: 'v0.2.0', dataSchema: 2, ready: true, runtimeScope: 'development-fixture-only' }), { flag: 'wx' });
  console.log('Prepared a separate development environment with synthetic cards. No shared data, key, database or live pointer was copied.');
}
main().catch(() => { console.error('Development preparation stopped. Check that the isolated target is new and empty; existing production data was not accessed.'); process.exitCode = 1; });
