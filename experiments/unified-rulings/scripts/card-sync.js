const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { runCardSync, setup, enqueue } = require('../collectors/card-sync-v1/runner');
const { importCards } = require('../collectors/card-sync-v1/publish');
const { readJson, atomicJson } = require('../releases/v0.1.3/src/source-discovery');
async function main() {
  const [command = 'status', filename] = process.argv.slice(2), dir = await setup(DATA_ROOT);
  if (command === 'watch' || command === 'once') return runCardSync(DATA_ROOT, { watch: command === 'watch' });
  if (command === 'import') { if (!filename) throw Error('JSON 파일 경로가 필요합니다.'); console.log(JSON.stringify(await enqueue(DATA_ROOT, filename))); return; }
  if (command === 'preview') {
    if (!filename || (await fs.stat(filename)).size > 25 * 1024 * 1024) throw Error('25MB 이하 JSON 파일이 필요합니다.');
    const data = JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/u, ''));
    const state = await readJson(path.join(dir, 'state.json'), {});
    const result = await importCards(DATA_ROOT, data, state.history || {}, { preview: true });
    const { history, ...summary } = result; console.log(JSON.stringify(summary)); return;
  }
  if (command === 'pause' || command === 'resume') {
    const c = await readJson(path.join(dir, 'config.json')); c.enabled = command === 'resume'; await atomicJson(path.join(dir, 'config.json'), c);
    console.log(JSON.stringify({ enabled: c.enabled })); return;
  }
  if (command === 'status') { console.log(JSON.stringify(await readJson(path.join(dir, 'status.json'), { state: 'not-started' }))); return; }
  throw Error('명령: status / once / watch / import <파일> / preview <파일> / pause / resume');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
