// A separate, non-AI collector; does not control or restart the public application.
const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { discoverSources, atomicJson } = require('../src/source-discovery');
const intervalMs = 6 * 60 * 60 * 1000;
let busy = false;
async function collect() {
  if (busy) return; busy = true;
  try {
    const result = await discoverSources(DATA_ROOT);
    console.log(JSON.stringify({ checkedAt: result.checkedAt, activeDataChanged: false,
      sources: Object.fromEntries(Object.entries(result.sources).map(([key, s]) => [key, { state: s.state, count: s.itemCount, error: s.error }])) }));
  } catch (error) { console.error('Discovery deferred:', error.message); }
  finally { busy = false; }
}
async function main() {
  if (!process.argv.includes('--watch')) { await collect(); return; }
  const directory = path.join(DATA_ROOT, 'source-updates');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'monitor.json');
  try {
    const previous = JSON.parse(await fs.readFile(file, 'utf8'));
    let alive = false;
    try { process.kill(previous.pid, 0); alive = true; } catch { /* stopped */ }
    if (alive) throw new Error('A monitor process already exists; inspect it before starting another.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await atomicJson(file, { pid: process.pid, script: __filename, intervalHours: 6, startedAt: new Date().toISOString() });
  const timer = setInterval(collect, intervalMs);
  const stop = () => { clearInterval(timer); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  await collect();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
