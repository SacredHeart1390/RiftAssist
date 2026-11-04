const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertEnvironment } = require('./environment');
const { hash } = require('./card-translation-core');
const { failure } = require('./riot-snapshot');

async function createCardSyncStore(root) {
  if (assertEnvironment(root) !== 'development') throw failure('sync-development-only');
  const realRoot = await fs.realpath(root), folder = path.join(realRoot, 'card-sync');
  for (const dir of [folder, path.join(folder, 'attempts'), path.join(folder, 'observations')]) {
    try { if (!(await fs.lstat(dir)).isDirectory() || (await fs.lstat(dir)).isSymbolicLink()) throw failure('sync-store-invalid'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(dir); }
  }
  const stateFile = path.join(folder, 'state.json'), lock = path.join(folder, 'run.lock');
  async function read(file, optional = false) {
    try {
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64000000) throw failure('sync-store-invalid');
      const entry = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!entry.value || hash(entry.value) !== entry.checksum) throw failure('sync-store-invalid');
      return entry.value;
    } catch (error) { if (optional && error.code === 'ENOENT') return null; throw failure('sync-store-invalid'); }
  }
  async function write(file, value, immutable = false) {
    const bytes = JSON.stringify({ value, checksum: hash(value) });
    if (bytes.length > 64000000) throw failure('sync-store-size');
    const temporary = path.join(folder, `write-${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    try {
      if (immutable) await fs.link(temporary, file);
      else {
        try { if ((await fs.lstat(file)).isSymbolicLink()) throw failure('sync-store-invalid'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await fs.rename(temporary, file);
      }
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  const id = value => {
    if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/u.test(value)) throw failure('sync-store-invalid');
    return value;
  };
  async function exclusive(work) {
    let handle;
    try { handle = await fs.open(lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') return { status: 'busy', activated: false }; throw failure('sync-store-unavailable'); }
    const token = crypto.randomUUID();
    let completed = false;
    try {
      await handle.writeFile(JSON.stringify({ token, createdAt: new Date().toISOString() }));
      const result = await work(); completed = true; return result;
    } finally {
      await handle.close();
      // A broken state/journal write must be inspected, not treated as a clean retry.
      if (completed) {
        const stat = await fs.lstat(lock);
        if (stat.isSymbolicLink() || JSON.parse(await fs.readFile(lock, 'utf8')).token !== token) throw failure('sync-store-invalid');
        await fs.unlink(lock);
      }
    }
  }
  return {
    root: realRoot, exclusive,
    async readState() {
      const state = await read(stateFile, true);
      if (state && (state.schemaVersion !== 1 || !Number.isInteger(state.failures) || state.failures < 0
        || !['running', 'failed', 'success'].includes(state.status)
        || (state.nextAttemptAt != null && !Number.isFinite(Date.parse(state.nextAttemptAt)))
        || (state.retryBlocked != null && typeof state.retryBlocked !== 'boolean')
        || (state.lastGood && (!/^[a-f0-9]{64}$/u.test(state.lastGood.checksum || '') || !id(state.lastGood.id))))) throw failure('sync-store-invalid');
      return state || { schemaVersion: 1, failures: 0, status: 'success', lastGood: null, nextAttemptAt: null };
    },
    writeState: state => write(stateFile, state),
    async observation(reference) {
      const value = await read(path.join(folder, 'observations', `${id(reference.id)}.json`));
      if (hash(value) !== reference.checksum) throw failure('sync-store-invalid');
      return value;
    },
    async saveObservation(runId, value) {
      await write(path.join(folder, 'observations', `${id(runId)}.json`), value, true);
      return { id: runId, checksum: hash(value) };
    },
    attempt: (runId, value) => write(path.join(folder, 'attempts', `${id(runId)}.json`), value, true),
  };
}
module.exports = { createCardSyncStore };
