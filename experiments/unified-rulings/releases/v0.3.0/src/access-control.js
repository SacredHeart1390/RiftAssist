const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function localSecret(directory, filename) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, filename);
  try { fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const secret = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid local authentication file.');
  return secret;
}
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const deny = (message, statusCode = 403) => Object.assign(new Error(message), { statusCode });

const SESSION_COOKIE = 'rift_session_v030';
function createAccess({ port, publicOrigin = '', directory, store }) {
  const secret = localSecret(directory, 'sessions.key');
  const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  let origins, hosts;
  function setPublicOrigin(value) {
    const next = new Set(localOrigins);
    if (value) {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.username || parsed.password) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin with no path or trailing slash.');
      next.add(value);
    }
    origins = next;
    hosts = new Set([...origins].map((origin) => new URL(origin).host));
  }
  setPublicOrigin(publicOrigin);
  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
  function check(req) {
    if (!hosts.has(req.headers.host)) throw deny('허용되지 않은 접속 주소입니다.');
    if (req.headers.origin && !origins.has(req.headers.origin)) throw deny('다른 사이트에서 보낸 요청은 허용하지 않습니다.');
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.method !== 'GET') throw deny('Cross-site request denied.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!req.headers.origin || !origins.has(req.headers.origin)) throw deny('Origin required.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw deny('JSON required.', 415);
    }
  }
  function session(req, res, create = false) {
    const value = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    const [id, issued, signature] = (value || '').split('.');
    const valid = /^[a-f0-9]{48}$/.test(id || '') && /^\d{13}$/.test(issued || '') && Number(issued) <= Date.now() && Number(issued) > Date.now() - 30 * 86400000 && safeEqual(signature, sign(`${id}.${issued}`));
    if (valid) return store.hash(id);
    if (!create) throw deny('접속 세션이 만료됐습니다. 새로고침해 주세요. / Refresh the page.', 401);
    store.allocateSession();
    const token = `${crypto.randomBytes(24).toString('hex')}.${Date.now()}`;
    const secure = !localOrigins.some((origin) => new URL(origin).host === req.headers.host);
    res.setHeader('Set-Cookie', `rift_session_v030=${token}.${sign(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`);
    return store.hash(token.split('.')[0]);
  }
  return { check, session, setPublicOrigin };
}
module.exports = { createAccess, localSecret, safeEqual };
