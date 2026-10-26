// Background content collection is independent of the public app and tunnel.
const { DATA_ROOT } = require('../src/paths');
const { runContentSync } = require('../releases/v0.1.3/src/content-sync');
runContentSync(DATA_ROOT, { watch: process.argv.includes('--watch') }).catch(error => {
  console.error(`Content sync stopped: ${error.message}`); process.exitCode = 1;
});
