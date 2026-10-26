const fs = require('node:fs/promises');
const path = require('node:path');
const { safeId } = require('./knowledge-provider');
const { readJson } = require('./source-discovery');
async function knowledgeStatus(root) {
  const directory = path.join(root, 'knowledge-releases');
  let names = [];
  try { names = await fs.readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const releases = [];
  for (const name of names.filter(safeId)) {
    try {
      const manifest = await readJson(path.join(directory, name, 'manifest.json'), null);
      if (manifest?.releaseId === name) releases.push(manifest);
    } catch { /* incomplete candidates are never offered */ }
  }
  return {
    active: await readJson(path.join(directory, 'active.json'), { releaseId: 'legacy-unvalidated' }),
    releases: releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    discovery: await readJson(path.join(root, 'source-updates', 'status.json'), null),
    contentSync: await readJson(path.join(root, 'source-updates', 'content-status.json'), null),
  };
}
module.exports = { knowledgeStatus };
