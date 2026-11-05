'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {checkPackage, packageHash} = require('../deployment/lab.cjs');
const PROTOCOL = 'riftassist-staging-1', MAX_PACKET = 20 * 1024 * 1024;
const RESERVED = new Set([80,443,3001,3011,3012,3100,3200,3201,3211,3212]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const fail = code => { throw Object.assign(new Error(code), {code}); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('protocol');
}
function noLinks(file, regular = false) {
  let current = path.resolve(file);
  for (;;) {
    try { const s = fs.lstatSync(current); if (s.isSymbolicLink() || (current === path.resolve(file) && regular && (!s.isFile() || s.nlink !== 1))) fail('path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
function within(root, ...parts) {
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(path.resolve(root) + path.sep)) fail('path');
  noLinks(file); return file;
}
function readJSON(file, limit = MAX_PACKET) {
  noLinks(file, true); if (fs.statSync(file).size > limit) fail('limit');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function atomic(file, value, mode = 0o600) {
  noLinks(file); const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', mode);
  try { fs.writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value) + '\n'); fs.fchmodSync(fd, mode); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  if (process.platform !== 'win32') { const parent = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); } }
}
function inventory(value, {fixture = false} = {}) {
  exact(value, ['schemaVersion','siteId','environment','installationApproved','root','node','caddy','appUid','appGid','approvedCommit','approvedPackageDigest','ports','proxyPort','proxyAdminPort']);
  if (value.schemaVersion !== 1 || !uuid(value.siteId) || value.environment !== 'isolated-staging' || value.installationApproved !== true) fail('installation-not-approved');
  if (!/^[a-f0-9]{40}$/.test(value.approvedCommit || '') || !sha(value.approvedPackageDigest)) fail('commit-not-approved');
  if (typeof value.root !== 'string' || !path.isAbsolute(value.root) || path.basename(value.root) !== value.siteId || path.basename(path.dirname(value.root)) !== 'riftassist-staging') fail('inventory');
  if (!fixture && value.root !== '/var/lib/riftassist-staging/' + value.siteId) fail('inventory');
  for (const binary of [value.node, value.caddy]) if (typeof binary !== 'string' || !path.isAbsolute(binary) || /[\r\n\0]/.test(binary)) fail('inventory');
  if (![value.appUid,value.appGid].every(v=>Number.isInteger(v) && v >= (fixture ? 0 : 1))) fail('inventory');
  exact(value.ports, ['a','b']);
  const ports = [...(value.ports.a || []), ...(value.ports.b || []), value.proxyPort, value.proxyAdminPort];
  if (value.ports.a?.length !== 4 || value.ports.b?.length !== 4 || ports.length !== 10 || new Set(ports).size !== ports.length
      || ports.some(p=>!Number.isInteger(p) || p < 1024 || p > 65535 || RESERVED.has(p))) fail('ports');
  noLinks(value.root); return Object.freeze({...value, inventoryHash:digest(value)});
}
function owner(config) {
  const m = readJSON(within(config.root, 'owner.json'), 4096);
  if (m.schemaVersion !== 1 || m.purpose !== 'isolated-staging' || m.siteId !== config.siteId || m.inventoryHash !== config.inventoryHash) fail('owner');
}
function verifyPacket(config, packet, {fixture = false} = {}) {
  checkPackage(packet);
  if (packet.commit !== config.approvedCommit || packet.digest !== config.approvedPackageDigest || packet.digest !== packageHash(packet)) fail('commit-not-approved');
  if (!fixture && (packet.tests.kind !== 'github-actions' || !Array.isArray(packet.tests.runIds) || packet.tests.runIds.length < 2 || packet.tests.runIds.some(n=>!Number.isSafeInteger(n)||n<1))) fail('tests');
  const manifest = JSON.parse(Buffer.from(packet.files['app-release.json'].content, 'base64'));
  if (manifest.releaseId !== 'v0.2.0' || manifest.version !== '0.2.0' || manifest.ready !== false || manifest.dataSchema !== 2) fail('package');
  for (const required of ['src/server.js','src/manager.js','src/staging-policy.js','src/app-host.js','dev-fixtures/rules.json']) if (!packet.files[required]) fail('package-incomplete');
  for (const [name, entry] of Object.entries(packet.files)) {
    if (name !== 'app-release.json' && manifest.hashes?.[name] !== entry.sha256) fail('manifest-hash');
    const bytes = Buffer.from(entry.content, 'base64');
    if (/\b(?:RGAPI-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString().replaceAll('sk-regression-dummy-not-a-real-key','synthetic-fixture'))) fail('sensitive-package');
  }
  return packet;
}
function request(value) {
  exact(value, ['protocol','siteId','inventoryHash','requestId','method','payload']);
  if (value.protocol !== PROTOCOL || !uuid(value.siteId) || !uuid(value.requestId) || !sha(value.inventoryHash)) fail('protocol');
  const fields = {
    status:[], preflight:[], plan:['operationId'], deploy:['plan','package','approval'],
    'rollback-plan':['operationId','deploymentId'], rollback:['plan','approval'],
    'verify-backup':['backupId'], inspect:['operationId']
  };
  if (!Object.hasOwn(fields,value.method)) fail('method'); exact(value.payload, fields[value.method]);
  return value;
}
function unit(config, slot) { if (!['a','b','proxy'].includes(slot)) fail('slot'); return 'riftassist-stage-' + config.siteId + '-' + slot + '.service'; }
module.exports = {PROTOCOL,MAX_PACKET,RESERVED,hash,digest,fail,uuid,sha,exact,noLinks,within,readJSON,atomic,inventory,owner,verifyPacket,request,unit};
