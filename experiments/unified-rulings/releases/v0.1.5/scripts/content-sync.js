const { DATA_ROOT } = require('../src/paths');
const { runContentSync } = require('../src/content-sync');
runContentSync(DATA_ROOT, { watch: process.argv.includes('--watch'), batchLimit: 80 }).catch(error => {
  console.error(`Content sync stopped: ${error.message}`); process.exitCode = 1;
});
