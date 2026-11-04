const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.resolve(__dirname, '../ruling-regression.test.cjs')], {
  env: { RIFTASSI_TEST_RELEASE: 'v0.1.7', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) }, stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
