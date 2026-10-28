const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createRiotAdapter } = require('../src/riot-adapter');
const { convertCatalog, translateCatalog } = require('../src/riot-converter');
async function main() {
  if (assertEnvironment(DATA_ROOT) !== 'development' || process.argv.length !== 2) throw new Error();
  const raw = await createRiotAdapter({ mode: 'mock' }).collect();
  const catalog = await translateCatalog(convertCatalog(raw), {
    reviewReference: 'synthetic-development-only',
    translate: async () => ({ text: '개발용 합성 번역입니다. 공식 번역이 아닙니다.', name: '연습 주문' }),
  });
  const folder = path.join(DATA_ROOT, 'import-previews'); await fs.mkdir(folder, { recursive: true });
  const filename = path.join(folder, `synthetic-${require('node:crypto').randomUUID()}.json`);
  await fs.writeFile(filename, JSON.stringify(catalog, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ mode: 'mock', cards: catalog.cards.length, activated: false, officialData: false }));
}
main().catch(() => { console.error('Preview stopped. Only a prepared development environment and mock data are supported. No active pointer was changed.'); process.exitCode = 1; });
