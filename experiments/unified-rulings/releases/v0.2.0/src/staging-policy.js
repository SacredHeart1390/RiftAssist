'use strict';
const fs = require('node:fs'), path = require('node:path');
const RESERVED = new Set([80,443,3001,3011,3012,3100,3200,3201,3211,3212]);
function stagingPorts(root) {
  const marker = path.join(root, '.riftassist-staging.json');
  if (fs.lstatSync(marker).isSymbolicLink()) throw new Error('Invalid staging owner.');
  const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (value.schemaVersion !== 1 || value.purpose !== 'isolated-staging' || !/^[a-f0-9-]{36}$/.test(value.siteId || '')
      || process.env.RIFTASSI_EXTERNAL_MODE !== 'mock' || process.env.RIFTASSI_ALLOW_EXTERNAL_CALLS === 'true') throw new Error('Staging requires an isolated owner and mock-only services.');
  const siteRoot = path.resolve(root, '../..');
  if (!['a','b'].includes(path.basename(root)) || path.basename(path.dirname(root)) !== 'data'
      || path.basename(siteRoot) !== value.siteId || path.basename(path.dirname(siteRoot)) !== 'riftassist-staging') throw new Error('Staging requires its dedicated data namespace.');
  const receiptFile = path.join(siteRoot, 'owner.json');
  if (fs.lstatSync(receiptFile).isSymbolicLink()) throw new Error('Invalid staging installation receipt.');
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  if (receipt.purpose !== 'isolated-staging' || receipt.siteId !== value.siteId || !/^[a-f0-9]{64}$/.test(receipt.inventoryHash || '')) throw new Error('Invalid staging installation receipt.');
  const ports = value.ports;
  if (!Number.isInteger(value.proxyPort) || value.proxyPort < 1024 || value.proxyPort > 65535 || RESERVED.has(value.proxyPort) || ports?.includes(value.proxyPort)) throw new Error('Invalid staging proxy.');
  if (!Array.isArray(ports) || ports.length !== 4 || new Set(ports).size !== 4
      || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535 || RESERVED.has(p))) throw new Error('Invalid staging port reservation.');
  if (Number(process.env.MANAGER_PORT) !== ports[0] || Number(process.env.APP_PORT || process.env.PUBLIC_PORT) !== ports[1]) throw new Error('Staging ports do not match their reservation.');
  return ports;
}
function stagingOrigin(root) { stagingPorts(root); return 'https://localhost:' + JSON.parse(fs.readFileSync(path.join(root, '.riftassist-staging.json'), 'utf8')).proxyPort; }
module.exports = { stagingPorts, stagingOrigin, RESERVED };
