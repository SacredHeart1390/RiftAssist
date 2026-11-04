const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
function createSyncStore(root) {
  const directory = path.join(root, 'source-updates');
  fs.mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'content.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, sitemap_modified TEXT, seen_cycle TEXT,
      fetched_modified TEXT, content TEXT, body_hash TEXT, etag TEXT, last_modified TEXT,
      checked_at INTEGER, fetched_at INTEGER, failures INTEGER NOT NULL DEFAULT 0,
      retry_at INTEGER NOT NULL DEFAULT 0, error TEXT, missing_count INTEGER NOT NULL DEFAULT 0,
      removed INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS faqs_retry ON faqs(retry_at, checked_at);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const state = (name, fallback) => { const row = db.prepare('SELECT value FROM state WHERE name=?').get(name); return row ? JSON.parse(row.value) : fallback; };
  const setState = (name, value) => db.prepare('INSERT INTO state(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(value));
  function sitemap(entries, cycle) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const put = db.prepare(`INSERT INTO faqs(id,url,sitemap_modified,seen_cycle) VALUES (?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET url=excluded.url,sitemap_modified=excluded.sitemap_modified,seen_cycle=excluded.seen_cycle`);
      for (const e of entries) put.run(e.id, e.url, e.lastmod || '', cycle);
      setState('sitemap', { cycle, total: entries.length, checkedAt: new Date().toISOString() }); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function pending(limit) {
    const now = Date.now(), stale = now - 7 * 86400000;
    return db.prepare(`SELECT * FROM faqs WHERE retry_at<=? AND
      ((removed=0 AND content IS NULL) OR COALESCE(fetched_modified,'')<>COALESCE(sitemap_modified,'') OR COALESCE(checked_at,0)<?)
      ORDER BY CASE WHEN content IS NOT NULL AND COALESCE(fetched_modified,'')<>COALESCE(sitemap_modified,'') THEN 0 WHEN content IS NULL THEN 1 ELSE 2 END,
        sitemap_modified DESC, id DESC LIMIT ?`).all(now, stale, limit);
  }
  function success(row, value, response, bodyHash) {
    const now = Date.now();
    db.prepare(`UPDATE faqs SET content=?,body_hash=?,etag=?,last_modified=?,fetched_modified=sitemap_modified,
      checked_at=?,fetched_at=?,failures=0,retry_at=0,error=NULL,missing_count=0,removed=0 WHERE id=?`)
      .run(JSON.stringify({ ...value, fetchedAt: new Date(now).toISOString(), sourceModifiedAt: row.sitemap_modified || null }),
        bodyHash, response.etag || null, response.lastModified || null, now, now, row.id);
  }
  function unchanged(row) {
    db.prepare('UPDATE faqs SET checked_at=?,fetched_modified=sitemap_modified,failures=0,retry_at=0,error=NULL WHERE id=?').run(Date.now(), row.id);
  }
  function failure(row, error) {
    const failures = row.failures + 1;
    const missing = error.status === 404 || error.status === 410;
    const nextMissing = missing ? row.missing_count + 1 : row.missing_count;
    const retryMs = missing ? 6 * 3600000 : Math.max(error.retryAfterMs || 0, Math.min(6 * 3600000, 60000 * 2 ** Math.min(failures, 8)));
    const removed = missing && nextMissing >= 2 ? 1 : row.removed;
    db.prepare('UPDATE faqs SET failures=?,retry_at=?,error=?,missing_count=?,removed=?,checked_at=?,fetched_modified=? WHERE id=?')
      .run(failures, Date.now() + retryMs, error.message.slice(0, 500), nextMissing, removed,
        removed ? Date.now() : row.checked_at, removed ? row.sitemap_modified : row.fetched_modified, row.id);
  }
  function cases() {
    return db.prepare('SELECT content,removed FROM faqs WHERE content IS NOT NULL ORDER BY CAST(id AS INTEGER)').all()
      .map(row => ({ ...JSON.parse(row.content), sourceAvailability: row.removed ? 'removed' : 'available' }));
  }
  function stats() {
    const n = db.prepare(`SELECT COUNT(*) total,SUM(content IS NOT NULL) collected,SUM(removed=1) removed,SUM(error IS NOT NULL) errors,
      SUM(content IS NULL AND removed=0) missing, SUM(removed=1 AND content IS NULL) unavailable FROM faqs`).get();
    return { ...n, pendingNow: pending(1).length > 0, sitemap: state('sitemap', null) };
  }
  return { state, setState, sitemap, pending, success, unchanged, failure, cases, stats,
    document(id) { const row = db.prepare('SELECT value FROM documents WHERE id=?').get(id); return row ? JSON.parse(row.value) : null; },
    saveDocument(id, value) { db.prepare('INSERT INTO documents(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id, JSON.stringify(value)); },
    fingerprint() { return db.prepare('SELECT id,body_hash,removed FROM faqs WHERE content IS NOT NULL ORDER BY CAST(id AS INTEGER)').all(); },
    close: () => db.close() };
}
module.exports = { createSyncStore };
