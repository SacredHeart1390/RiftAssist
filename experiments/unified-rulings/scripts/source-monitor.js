// Background content collection is independent of the public app and tunnel.
const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_ROOT } = require('../src/paths');
const { runContentSync, acquireLock } = require('../releases/v0.1.3/src/content-sync');
const { readJson } = require('../releases/v0.1.3/src/source-discovery');
const { runCardSync } = require('../collectors/card-sync-v1/runner');
async function main() {
  const watch = process.argv.includes('--watch'), directory = path.join(DATA_ROOT, 'source-updates');
  await fs.mkdir(directory, { recursive: true });
  const lock = path.join(directory, '.monitor-wrapper.lock'); await acquireLock(lock);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  async function supervise(name, collect) {
    do {
      try { await collect(DATA_ROOT, { watch }); }
      catch (e) { console.error(`${name}: ${e.message}`); if (!watch) throw e; }
      if (!watch || stopping) break;
      // Independent retry: a card-source failure must not stop rules/Q&A collection.
      for (let i = 0; i < 60 && !stopping; i++) await new Promise(r => setTimeout(r, 1000));
    } while (!stopping);
  }
  try { await Promise.all([supervise('Content sync', runContentSync), supervise('Card sync', runCardSync)]); }
  finally {
    const owner = await readJson(lock, null); if (owner?.pid === process.pid) await fs.unlink(lock);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
main().catch(error => { console.error(`Source monitor stopped: ${error.message}`); process.exitCode = 1; });
