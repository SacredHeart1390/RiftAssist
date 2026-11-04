const fs = require('node:fs');
const path = require('node:path');
const APP_ROOT = path.resolve(__dirname, '..');
const SHARED_ROOT = path.resolve(APP_ROOT, '../..');
const DEFAULT_ROOT = path.join(APP_ROOT, '.dev-data');
const inside = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);
function canonical(value) {
  let current = path.resolve(value), suffix = [];
  while (!fs.existsSync(current)) { suffix.unshift(path.basename(current)); const parent = path.dirname(current); if (parent === current) break; current = parent; }
  return path.join(fs.realpathSync(current), ...suffix);
}
function assertSafeLocation(root) {
  const location = canonical(root), shared = canonical(SHARED_ROOT), development = canonical(DEFAULT_ROOT);
  const sharedHasLiveRelease = fs.existsSync(path.join(shared, 'releases/v0.1.7/src/server.js'));
  if ((sharedHasLiveRelease && inside(shared, location) && !(inside(development, location) && inside(path.join(shared, 'releases/v0.3.0'), development)))
    || fs.existsSync(path.join(location, 'releases/v0.1.7/src/server.js'))) {
    throw new Error('v0.3.0 refuses the shared production data tree. Use its .dev-data or a separate marked data directory.');
  }
  return location;
}
function assertEnvironment(root) {
  const location = assertSafeLocation(root), marker = path.join(location, '.riftassist-environment.json');
  let value;
  try {
    if (fs.lstatSync(marker).isSymbolicLink()) throw new Error();
    value = JSON.parse(fs.readFileSync(marker, 'utf8'));
  } catch { throw new Error('Prepare a separate v0.3.0 environment before starting. No runtime store was opened.'); }
  if (value.releaseFamily !== 'v0.3.0' || !['development', 'staging', 'production'].includes(value.environment)) throw new Error('Invalid v0.3.0 environment marker.');
  if (value.environment === 'production') {
    const manifestFile = path.join(APP_ROOT, 'app-release.json');
    if (fs.lstatSync(manifestFile).isSymbolicLink()) throw new Error('This release is not ready for production.');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.ready !== true || manifest.developmentOnly === true || manifest.runtimeScope === 'development-fixture-only') throw new Error('This release is not ready for production. An environment flag cannot override release readiness.');
  }
  if (value.environment === 'production' && process.env.RIFTASSI_ALLOW_PRODUCTION_START !== 'true') throw new Error('Production startup requires a separate explicit deployment decision.');
  for (const name of ['private', 'knowledge', 'knowledge-releases', 'source-updates', 'tmp', 'releases']) {
    const target = path.join(location, name);
    if (fs.existsSync(target) && !inside(location, canonical(target))) throw new Error('Runtime directories must not link outside the v0.3.0 data root.');
  }
  for (const name of ['operations.sqlite','operations.sqlite-wal','operations.sqlite-shm','storage.key','manager.key','session.key']) {
    const file=path.join(location,'private',name);let info;
    try { info=fs.lstatSync(file); } catch(error) { if(error.code==='ENOENT')continue;throw error; }
    if(info.isSymbolicLink()||!info.isFile()||info.nlink>1)throw new Error('Sensitive runtime files must not be links or shared files.');
  }
  if(value.environment!=='development')throw new Error('This development release is not ready for production or staging.');
  return value.environment;
}
module.exports = { assertSafeLocation, assertEnvironment };
