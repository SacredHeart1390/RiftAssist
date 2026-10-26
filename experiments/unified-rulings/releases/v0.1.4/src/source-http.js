const allowed = new Set(['playriftbound.com', 'www.playriftbound.com', 'riftbound.leagueoflegends.com', 'cmsassets.rgpub.io', 'app.riftjudge.com']);
async function sourceFetch(address, { etag, lastModified, maxBytes = 8 * 1024 * 1024, timeoutMs = 25000 } = {}) {
  let url = new URL(address);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirect = 0; redirect < 5; redirect++) {
    if (url.protocol !== 'https:' || !allowed.has(url.hostname) || url.port || url.username || url.password) throw new Error('Source URL not allowed.');
    const headers = { 'User-Agent': 'Riftassi-ContentSync/0.1 (public Q&A; resumable incremental sync)' };
    if (!redirect && etag) headers['If-None-Match'] = etag;
    if (!redirect && lastModified) headers['If-Modified-Since'] = lastModified;
    const response = await fetch(url, { headers, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('Source redirect lacks location.');
      url = new URL(location, url); continue;
    }
    if (response.status === 304) return { status: 304, url: url.href };
    if (!response.ok) {
      const retry = response.headers.get('retry-after'); await response.body?.cancel();
      const error = new Error(`Source HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfterMs = retry ? Math.min(86400000, /^\d+$/u.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
      throw error;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Source exceeds size limit.'); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
        if (size > maxBytes) throw new Error('Source exceeds size limit.'); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    return { status: response.status, url: url.href, bytes: Buffer.concat(chunks),
      etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'),
      contentType: response.headers.get('content-type') || '' };
  }
  throw new Error('Source redirect limit reached.');
}
module.exports = { sourceFetch };
