const { sourceFetch } = require('./source-http');
const { judgeCase } = require('./html-content');
const { digest } = require('./knowledge-provider');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = s => s.replace(/&amp;/gu, '&').trim();
async function refreshSitemap(store) {
  const rows = new Map(), visited = new Set();
  async function read(url, depth = 0) {
    if (depth > 3 || visited.size >= 20) throw new Error('Sitemap nesting limit exceeded.');
    const parsed = new URL(url);
    if (parsed.hostname !== 'app.riftjudge.com' || parsed.protocol !== 'https:') throw new Error('Unexpected sitemap host.');
    if (visited.has(url)) return; visited.add(url);
    const response = await sourceFetch(url, { maxBytes: 16 * 1024 * 1024 });
    const xml = response.bytes.toString('utf8');
    if (/<sitemapindex(?:\s|>)/iu.test(xml)) {
      for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)) await read(decode(match[1]), depth + 1);
    } else if (/<urlset(?:\s|>)/iu.test(xml)) {
      for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/giu)) {
        const location = match[1].match(/<loc>([\s\S]*?)<\/loc>/iu)?.[1];
        if (!location) continue;
        const u = new URL(decode(location)), id = u.pathname.match(/^\/questions\/(\d{1,12})\/?$/u)?.[1];
        if (u.origin !== 'https://app.riftjudge.com' || !id) continue;
        rows.set(id, { id, url: `https://app.riftjudge.com/questions/${id}`, lastmod: match[1].match(/<lastmod>(.*?)<\/lastmod>/isu)?.[1]?.trim() || '' });
      }
    } else throw new Error('Sitemap response changed or access was blocked.');
  }
  await read('https://app.riftjudge.com/sitemap.xml');
  const previous = store.state('sitemap', null);
  if (rows.size < 100 || (previous && rows.size < previous.total * .8)) throw new Error('Sitemap unexpectedly shrank; existing queue retained.');
  const cycle = new Date().toISOString();
  store.sitemap([...rows.values()], cycle);
  return { total: rows.size, checkedAt: cycle };
}
async function collectJudgeBatch(store, { limit = 80, onProgress = async () => {}, shouldStop = () => false } = {}) {
  const cooldown = store.state('judgeCooldownUntil', 0);
  if (cooldown > Date.now()) return { pausedUntil: new Date(cooldown).toISOString(), processed: 0 };
  const batch = store.pending(limit);
  let processed = 0, changed = 0, consecutiveFailures = 0, pause = false;
  for (let start = 0; start < batch.length && !pause && !shouldStop(); start += 2) {
    const began = Date.now();
    const results = await Promise.all(batch.slice(start, start + 2).map(async row => {
      try {
        const fetched = await sourceFetch(row.url, { etag: row.content ? row.etag : null, lastModified: row.content ? row.last_modified : null, maxBytes: 2 * 1024 * 1024 });
        if (fetched.status === 304) { store.unchanged(row); return { changed: false }; }
        const value = judgeCase(fetched.bytes.toString('utf8'), row.id, row.url);
        const hash = digest(Buffer.from(JSON.stringify(value)));
        store.success(row, value, fetched, hash);
        return { changed: hash !== row.body_hash || row.removed };
      } catch (error) {
        store.failure(row, error);
        if ([403, 429, 503].includes(error.status)) {
          store.setState('judgeCooldownUntil', Date.now() + Math.max(error.status === 403 ? 86400000 : 600000, error.retryAfterMs || 0));
          pause = true;
        }
        return { failed: true, error: error.message };
      }
    }));
    for (const result of results) { processed++; if (result.changed) changed++; consecutiveFailures = result.failed ? consecutiveFailures + 1 : 0; }
    if (consecutiveFailures >= 6) { store.setState('judgeCooldownUntil', Date.now() + 3600000); pause = true; }
    await onProgress({ processed, changed, ...store.stats() });
    // At most two concurrent requests and at most four starts per second.
    if (start + 2 < batch.length && !pause) await sleep(Math.max(0, 500 - (Date.now() - began)));
  }
  return { processed, changed, pausedUntil: pause ? new Date(store.state('judgeCooldownUntil', 0)).toISOString() : null };
}
module.exports = { refreshSitemap, collectJudgeBatch };
