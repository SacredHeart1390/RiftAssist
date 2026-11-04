const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertEnvironment } = require('./environment');
const { hash, normalizeRecord } = require('./card-translation-core');
const fail = code => Object.assign(new Error(code), { code });

async function createTranslationStore(root, { waitMs = 5000 } = {}) {
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 60000) throw fail('translation-store-wait-limit');
  const environment = assertEnvironment(root), realRoot = await fs.realpath(root);
  async function directory(...parts) {
    let current = realRoot;
    for (const part of parts) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw fail('translation-store-symlink'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(current); }
      const resolved = await fs.realpath(current);
      if (!resolved.startsWith(realRoot + path.sep)) throw fail('translation-store-outside-root');
    }
    return current;
  }
  const cache = await directory('card-translations', 'cache');
  const locks = await directory('card-translations', 'locks');
  const candidates = await directory('card-translations', 'candidates');
  async function read(key) {
    const file = path.join(cache, `${key}.json`);
    try {
      if ((await fs.lstat(file)).isSymbolicLink() || (await fs.stat(file)).size > 500000) throw fail('translation-cache-invalid');
      const entry = JSON.parse(await fs.readFile(file, 'utf8'));
      if (entry.key !== key || entry.checksum !== hash(entry.record)) throw fail('translation-cache-invalid');
      return normalizeRecord(entry.record);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw fail('translation-cache-invalid'); // Never retry a paid call because a cache cannot be read.
    }
  }
  async function cached(key, work) {
    if (!/^[a-f0-9]{64}$/u.test(key)) throw fail('translation-cache-key');
    const previous = await read(key);
    if (previous) return { record: previous, hit: true };
    const lock = path.join(locks, `${key}.lock`), token = crypto.randomUUID();
    let handle;
    const deadline = Date.now() + waitMs;
    while (!handle) {
      try { handle = await fs.open(lock, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST') throw fail('translation-cache-unavailable');
        const ready = await read(key);
        if (ready) return { record: ready, hit: true };
        if (Date.now() >= deadline) throw fail('translation-cache-busy');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    let published = false;
    try {
      await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }));
      const ready = await read(key);
      if (ready) { published = true; return { record: ready, hit: true }; }
      const record = normalizeRecord(await work());
      const target = path.join(cache, `${key}.json`), temporary = path.join(cache, `${key}.${token}.tmp`);
      await fs.writeFile(temporary, JSON.stringify({ key, record, checksum: hash(record) }), { flag: 'wx', mode: 0o600 });
      try { await fs.link(temporary, target); published = true; } // Atomic publication without overwriting another result.
      finally { await fs.unlink(temporary); }
      return { record, hit: false };
    } finally {
      await handle.close();
      // A failed write or crashed worker may already have incurred a provider charge.
      // Keep the reservation for manual inspection rather than silently calling again.
      try { if (published && JSON.parse(await fs.readFile(lock, 'utf8')).token === token) await fs.unlink(lock); }
      catch (error) { if (error.code !== 'ENOENT') throw fail('translation-lock-cleanup'); }
    }
  }
  const syncId = id => typeof id === 'string' && /^sync-[a-f0-9]{64}$/u.test(id);
  const candidateId = id => syncId(id) || (typeof id === 'string' && /^translation-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/u.test(id));
  async function readCandidate(id) {
    if (!candidateId(id)) throw fail('translation-candidate-id');
    const folder = path.join(candidates, id);
    async function file(name) {
      const target = path.join(folder, name), stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64000000) throw fail('translation-candidate-invalid');
      return fs.readFile(target, 'utf8');
    }
    try { if ((await fs.lstat(folder)).isSymbolicLink()) throw fail('translation-candidate-invalid'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const manifest = JSON.parse(await file('manifest.json'));
    if (manifest.candidateId !== id || manifest.reviewRequired !== true || manifest.activated !== false) throw fail('translation-candidate-invalid');
    const values = {};
    for (const name of ['cards.json', 'translation-review.json', ...(syncId(id) || manifest.hashes?.['sync-review.json'] ? ['sync-review.json'] : [])]) {
      const bytes = await file(name);
      if (hash(bytes) !== manifest.hashes?.[name]) throw fail('translation-candidate-invalid');
      values[name] = JSON.parse(bytes);
    }
    return { id, folder, manifest, candidate: { catalog: values['cards.json'], review: values['translation-review.json'], syncReview: values['sync-review.json'] } };
  }
  async function writeCandidate(candidate, { candidateId = null } = {}) {
    if (candidateId != null && !syncId(candidateId)) throw fail('translation-candidate-id');
    const id = candidateId || `translation-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}`;
    const folder = path.join(candidates, id); await fs.mkdir(folder);
    const files = { 'cards.json': candidate.catalog, 'translation-review.json': candidate.review };
    if (candidate.syncReview) files['sync-review.json'] = candidate.syncReview;
    const hashes = {};
    for (const [name, value] of Object.entries(files)) {
      const bytes = JSON.stringify(value, null, 2); hashes[name] = hash(bytes);
      await fs.writeFile(path.join(folder, name), bytes, { flag: 'wx', mode: 0o600 });
    }
    const manifest = { schemaVersion: 1, candidateId: id, createdAt: new Date().toISOString(),
      reviewRequired: true, activated: false, hashes };
    await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    return { id, folder, manifest };
  }
  return { root: realRoot, environment, persistent: true, cached, writeCandidate, readCandidate };
}
function memoryTranslationStore() {
  const records = new Map(), pending = new Map();
  return { environment: 'development', persistent: false, async cached(key, work) {
    if (records.has(key)) return { record: structuredClone(records.get(key)), hit: true };
    if (pending.has(key)) return { record: structuredClone(await pending.get(key)), hit: true };
    const task = work().then(normalizeRecord); pending.set(key, task);
    try { const record = await task; records.set(key, record); return { record: structuredClone(record), hit: false }; }
    finally { pending.delete(key); }
  } };
}
module.exports = { createTranslationStore, memoryTranslationStore };
