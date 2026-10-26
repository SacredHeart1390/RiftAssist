// This collector only discovers changes. It never publishes a new rule version.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { digest } = require('./knowledge-provider');
const SOURCES = [
  { id: 'official-en', url: 'https://playriftbound.com/en-us/rules-hub/', type: 'rules-hub' },
  { id: 'official-ko', url: 'https://playriftbound.com/ko-kr/rules-hub/', type: 'rules-hub' },
  { id: 'riftjudge', url: 'https://app.riftjudge.com/sitemap.xml', type: 'sitemap' },
];
const HOSTS = new Set(['playriftbound.com', 'www.playriftbound.com', 'app.riftjudge.com', 'cmsassets.rgpub.io']);
const xml = s => s.replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>');
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function atomicJson(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
async function boundedFetch(address, previous = {}, maxBytes = 8 * 1024 * 1024) {
  let url = new URL(address);
  const signal = AbortSignal.timeout(20000);
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.port || url.username || url.password) throw new Error('Unapproved source host.');
    const headers = { 'User-Agent': 'Riftassi-SourceDiscovery/0.1 (low-frequency; local beta)' };
    if (previous.url === url.href) {
      if (previous.etag) headers['If-None-Match'] = previous.etag;
      if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
    }
    const response = await fetch(url, { redirect: 'manual', signal, headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location'); await response.body?.cancel();
      if (!next) throw new Error('Redirect without target.');
      url = new URL(next, url); continue;
    }
    if (response.status === 304) return { ...previous, unchanged: true };
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Source HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Source size limit exceeded.'); }
    const chunks = []; let length = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > maxBytes) throw new Error('Source size limit exceeded.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks);
    return { url: url.href, bytes, hash: digest(bytes), etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
  }
  throw new Error('Too many source redirects.');
}
function parseDocument(source, bytes) {
  const text = bytes.toString('utf8');
  if (source.type === 'sitemap') {
    if (!/<(?:sitemapindex|urlset)(?:\s|>)/iu.test(text)) throw new Error('Expected a sitemap; access challenge or layout change.');
    const entries = [...text.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/giu)].map(([, block]) => ({
      url: xml(block.match(/<loc>(.*?)<\/loc>/isu)?.[1]?.trim() || ''),
      lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/isu)?.[1]?.trim() || null,
    })).filter(entry => {
      try { const u = new URL(entry.url); return u.protocol === 'https:' && u.hostname === 'app.riftjudge.com'; } catch { return false; }
    });
    if (!entries.length) throw new Error('Empty sitemap; retain previous discovery.');
    return { entries, coverage: /<sitemapindex/iu.test(text) ? 'sitemap-index-only' : 'urls-only', contentCollected: false };
  }
  const links = new Map();
  for (const match of text.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    let u; try { u = new URL(xml(match[1]), source.url); } catch { continue; }
    if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) continue;
    const title = xml(match[2].replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim().slice(0, 250);
    if (/\.pdf$/iu.test(u.pathname) || /rules|errata|규칙|정오표/iu.test(title + u.pathname)) {
      u.hash = ''; links.set(u.href, { url: u.href, title });
    }
  }
  if (![...links.values()].some(link => /\.pdf$/iu.test(new URL(link.url).pathname))) throw new Error('No official PDF links discovered; layout requires review.');
  return { links: [...links.values()].sort((a, b) => a.url.localeCompare(b.url)), coverage: 'links-only', contentCollected: false };
}
async function discoverSources(root) {
  const directory = path.join(root, 'source-updates');
  await fs.mkdir(directory, { recursive: true });
  const lock = path.join(directory, '.discovery-lock');
  try { await fs.mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Source discovery is already running.'); throw error; }
  try {
    const statusFile = path.join(directory, 'status.json');
    const previous = await readJson(statusFile, { sources: {} });
    const now = new Date().toISOString();
    const result = { schemaVersion: 1, checkedAt: now, activeDataChanged: false, sources: { ...previous.sources } };
    for (const source of SOURCES) {
      const before = previous.sources[source.id] || {};
      try {
        const fetched = await boundedFetch(source.url, before);
        if (fetched.unchanged) {
          result.sources[source.id] = { ...before, checkedAt: now, lastSuccessAt: now, state: 'unchanged', error: null };
          continue;
        }
        const content = parseDocument(source, fetched.bytes);
        const meaningfulHash = digest(Buffer.from(JSON.stringify(content)));
        const changed = before.contentHash !== meaningfulHash;
        const file = `${source.id}-${fetched.hash}.json`;
        const rawFile = path.join(directory, file);
        try { await fs.writeFile(rawFile, JSON.stringify({ fetchedAt: now, url: fetched.url, ...content }), { flag: 'wx' }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        result.sources[source.id] = {
          url: fetched.url, etag: fetched.etag, lastModified: fetched.lastModified,
          hash: fetched.hash, contentHash: meaningfulHash, artifact: file,
          checkedAt: now, lastSuccessAt: now, state: changed ? 'awaiting-review' : 'unchanged',
          pendingReview: changed || Boolean(before.pendingReview), coverage: content.coverage, error: null,
          itemCount: (content.links || content.entries).length,
        };
      } catch (error) {
        result.sources[source.id] = { ...before, checkedAt: now, state: 'failed', error: error.message };
      }
    }
    result.sources.riftnaru = {
      state: 'manual-import-required', checkedAt: null,
      reason: 'An approved machine-readable feed is not configured. Existing cards remain active.',
    };
    await atomicJson(statusFile, result);
    return result;
  } finally { await fs.rmdir(lock); }
}
module.exports = { discoverSources, readJson, atomicJson };
