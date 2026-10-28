const { fork } = require('node:child_process');
const path = require('node:path');
const { APP_ROOT, DATA_ROOT } = require('../src/paths');
if (require('../src/environment').assertEnvironment(DATA_ROOT) !== 'development') throw new Error('This launcher is for isolated development only.');
// Credentials and live-service modes are never inherited by this launcher.
const env = { RIFTASSI_DATA_ROOT: DATA_ROOT, RIFTASSI_EXTERNAL_MODE: 'mock', OPENAI_GENERATION_ENABLED: 'true',
  OPENAI_API_KEY: 'development-mock-only', OPENAI_MODEL: 'development-mock',
  RIFTASSI_CARD_POLICY: process.env.RIFTASSI_CARD_POLICY === 'verified-only' ? 'verified-only' : 'restricted',
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
const child = fork(path.join(APP_ROOT, 'src/manager.js'), [], { env, execArgv: [], stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
