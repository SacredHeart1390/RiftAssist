const { hash } = require('./catalog');
const MAX_BYTES = 25 * 1024 * 1024;
// Only a provided public JSON feed on the known source is supported. No guessed endpoints or challenge bypass.
async function fetchExport(address, previous = {}, full = false) {
  let url = new URL(address);
  const signal = AbortSignal.timeout(30000);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== 'https:' || url.hostname !== 'www.riftnaru.com' || url.port || url.username || url.password || url.hash) throw new Error('리프트나루에서 제공한 HTTPS JSON 주소가 필요합니다.');
    const headers = { Accept: 'application/json', 'User-Agent': 'Riftassi-CardSync/0.1 (daily public export)' };
    if (!full && !hop && previous.url === address) {
      if (previous.etag) headers['If-None-Match'] = previous.etag;
      if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
    }
    const r = await fetch(url, { headers, signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(r.status)) { const next = r.headers.get('location'); await r.body?.cancel(); if (!next) throw Error('주소 이동 정보를 찾을 수 없습니다.'); url = new URL(next, url); continue; }
    if (r.status === 304) return { unchanged: true };
    if (!r.ok) {
      const after = r.headers.get('retry-after'); await r.body?.cancel();
      const retryMs = after ? (/^\d+$/u.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : 0;
      throw Object.assign(new Error(`카드 제공 서버 HTTP ${r.status}. 기존 자료를 유지합니다.`), { status: r.status,
        retryAfterMs: Number.isFinite(retryMs) ? Math.max(0, retryMs) : 0 });
    }
    if (!/application\/(?:json|[^;]+\+json)(?:;|$)/iu.test(r.headers.get('content-type') || '')) { await r.body?.cancel(); throw Error('카드 JSON 대신 웹페이지 또는 확인 화면이 반환됐습니다.'); }
    if (Number(r.headers.get('content-length')) > MAX_BYTES) { await r.body?.cancel(); throw Error('카드 파일이 25MB를 초과합니다.'); }
    const reader = r.body.getReader(), chunks = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw Error('카드 파일이 25MB를 초과합니다.'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/u, ''));
    return { data, bytes: size, fingerprint: hash(data), cache: { url: address, etag: r.headers.get('etag'), lastModified: r.headers.get('last-modified') } };
  }
  throw Error('카드 주소 이동 횟수를 초과했습니다.');
}
module.exports = { fetchExport, MAX_BYTES };
