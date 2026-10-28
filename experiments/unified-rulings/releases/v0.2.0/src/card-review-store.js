const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertEnvironment } = require('./environment');
const { hash } = require('./card-translation-core');
const { error } = require('./card-review-auth');

function reduce(state, event) {
  const p = event.payload;
  if (p.type === 'register') state.bundles[p.bundle.id] = { ...p.bundle, revision: 0, decisions: {}, packages: {} };
  if (p.type === 'decide') { const b = state.bundles[p.bundleId]; b.revision++; Object.assign(b.decisions, p.decisions); }
  if (p.type === 'stage') { const b = state.bundles[p.bundleId]; b.revision++; b.packages[p.package.id] = p.package; }
  if (p.type === 'intent') state.intents[p.intent.id] = { ...p.intent };
  if (p.type === 'complete') {
    const intent = state.intents[p.intentId]; intent.outcome = p.result;
    if (p.result.applied) { const b = state.bundles[intent.bundleId]; b.revision++; b.status = intent.action === 'activate' ? 'active' : 'rolled-back'; }
  }
  if (p.operationId) state.operations[p.operationId] = { digest: p.operationDigest, actor: event.actor, result: p.result };
  state.events.push(event);
}
async function createCardReviewStore(root) {
  if (assertEnvironment(root) !== 'development') throw error('review-development-only', 403);
  const realRoot = await fs.realpath(root), folder = path.join(realRoot, 'card-reviews'), events = path.join(folder, 'events');
  for (const dir of [folder, events]) {
    try { const stat = await fs.lstat(dir); if (stat.isSymbolicLink() || !stat.isDirectory()) throw error('review-store-invalid', 503); }
    catch (e) { if (e.code !== 'ENOENT') throw e; await fs.mkdir(dir); }
  }
  async function load() {
    const files = (await fs.readdir(events)).sort(), state = { bundles: {}, operations: {}, intents: {}, events: [] };
    if (files.length > 10000) throw error('review-journal-limit', 503);
    let previous = null;
    for (const [index, name] of files.entries()) {
      if (!/^\d{8}-[a-f0-9-]{36}\.json$/u.test(name) || !name.startsWith(String(index + 1).padStart(8, '0'))) throw error('review-store-invalid', 503);
      const target = path.join(events, name), stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16000000) throw error('review-store-invalid', 503);
      const entry = JSON.parse(await fs.readFile(target, 'utf8'));
      if (entry.previous !== previous || entry.hash !== hash(entry.event) || entry.event.previous !== previous || entry.event.sequence !== index + 1) throw error('review-store-invalid', 503);
      reduce(state, entry.event); previous = entry.hash;
    }
    return state;
  }
  async function transaction(work) {
    const lock = path.join(folder, 'review.lock'); let handle;
    try { handle = await fs.open(lock, 'wx', 0o600); }
    catch (e) { if (e.code === 'EEXIST') throw error('review-busy', 409); throw e; }
    const token = crypto.randomUUID(); let completed = false;
    try {
      await handle.writeFile(JSON.stringify({ token, at: new Date().toISOString() }));
      const state = await load();
      async function append(actor, payload) {
        const previous = state.events.at(-1) ? hash(state.events.at(-1)) : null;
        const event = { sequence: state.events.length + 1, previous, actor, at: new Date().toISOString(), payload };
        const bytes = JSON.stringify({ previous, event, hash: hash(event) });
        if (bytes.length > 16000000) throw error('review-event-limit', 413);
        const temporary = path.join(folder, `${crypto.randomUUID()}.tmp`);
        const target = path.join(events, `${String(event.sequence).padStart(8, '0')}-${crypto.randomUUID()}.json`);
        await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
        try { await fs.link(temporary, target); } finally { await fs.unlink(temporary).catch(() => {}); }
        reduce(state, event); return event;
      }
      try { const result = await work({ state, append }); completed = true; return result; }
      catch (e) { if (e.expected && !['review-store-invalid', 'review-journal-limit'].includes(e.code)) completed = true; throw e; }
    } finally {
      await handle.close();
      if (completed) {
        if ((await fs.lstat(lock)).isSymbolicLink() || JSON.parse(await fs.readFile(lock, 'utf8')).token !== token) throw error('review-store-invalid', 503);
        await fs.unlink(lock);
      }
    }
  }
  return { root: realRoot, transaction };
}
module.exports = { createCardReviewStore };
