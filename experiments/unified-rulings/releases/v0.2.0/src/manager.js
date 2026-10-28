// Separate loopback-only control server. Never route a public tunnel to this port.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, spawn } = require('node:child_process');
const { createStore, REPORT_STATES } = require('./operations-store');
const { localSecret, safeEqual } = require('./access-control');
const { startQuickTunnel } = require('./cloudflare-quick');
const { APP_ROOT, DATA_ROOT: ROOT } = require('./paths');
const environment = require('./environment').assertEnvironment(ROOT);
const { createAppHost } = require('./app-host');
const { knowledgeStatus } = require('./knowledge-admin');
const { activateRelease } = require('./knowledge-releases');
const PORT = Number(process.env.MANAGER_PORT || 3200), APP_PORT = Number(process.env.APP_PORT || 3201);
if (![PORT, APP_PORT].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535) || PORT === APP_PORT) throw new Error('Invalid or conflicting local ports.');
const store = createStore(ROOT);
const secret = localSecret(store.directory, 'manager.key');
const sessions = new Map();
const origins = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
const hosts = new Set([...origins].map((item) => new URL(item).host));
let app = null, tunnel = null, changing = false, appReady = false, errorMessage = '', tunnelState = 'off';
let activeOrigin = '';
const appHost = createAppHost({ root: ROOT, port: APP_PORT, onFailure: message => { app = null; appReady = false; errorMessage = message; } });
const config = () => store.setting('hosting', { provider: 'none', publicOrigin: '' });
function ensureSourceMonitor() {
  // v0.2.0 imports are explicit. Never launch legacy network collectors automatically.
}
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw error('요청이 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || Array.isArray(data)) throw new Error(); return data; }
  catch { throw error('잘못된 JSON 요청입니다.'); }
}
function authenticate(req) {
  const token = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('rift_admin_v020='))?.slice('rift_admin_v020='.length);
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) { if (token) sessions.delete(token); throw error('프로젝트의 관리 페이지 열기를 다시 실행해 주세요.', 401); }
}
function logFile(name) {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  return fs.openSync(path.join(ROOT, 'tmp', `${name}.log`), 'a');
}
async function stopChild(child, graceful = false) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); clearTimeout(deadline); resolve(); };
    const deadline = setTimeout(() => { if (!done) { done = true; reject(error('프로세스 종료를 확인하지 못했습니다. 관리 로그를 확인해 주세요.', 503)); } }, 12000);
    const timer = setTimeout(() => { try { child.kill(); } catch { /* deadline reports failure */ } }, 8000);
    child.once('exit', finish);
    child.once('error', finish);
    if (graceful && child.connected) child.send({ type: 'shutdown' }, () => {});
    else { try { child.kill(); } catch { finish(); } }
  });
}
async function stopService() {
  const currentTunnel = tunnel, currentApp = app;
  await stopChild(currentTunnel);
  if (tunnel === currentTunnel) tunnel = null;
  tunnelState = 'off';
  activeOrigin = '';
  await appHost.stop();
  app = null;
  appReady = false;
}
async function startService() {
  if (appReady) return;
  ensureSourceMonitor();
  const hosting = config();
  if (!['none', 'cloudflare-quick'].includes(hosting.provider) && !hosting.publicOrigin) throw error('공개 주소를 먼저 저장해 주세요.');
  const cloudflared = path.join(store.directory, 'tools', 'cloudflared.exe');
  if (hosting.provider === 'cloudflare-quick' && !fs.existsSync(cloudflared)) throw error('cloudflared.exe를 private/tools 폴더에 넣어 주세요. QUICK_START_KO.md를 확인하세요.');
  const ngrok = path.join(store.directory, 'tools', 'ngrok.exe');
  if (hosting.provider === 'ngrok' && !fs.existsSync(ngrok)) throw error('ngrok 설치·계정 연결이 아직 필요합니다. HOME_HOSTING.md를 확인해 주세요.');
  errorMessage = '';
  await appHost.setPublicOrigin(hosting.publicOrigin || '');
  await appHost.deploy(store.setting('appRelease', 'v0.2.0'));
  const child = appHost.currentChild();
  app = child; appReady = true;
  activeOrigin = hosting.publicOrigin || '';
  if (hosting.provider === 'cloudflare-quick') {
    tunnelState = 'starting';
    const quick = startQuickTunnel({ executable: cloudflared, directory: path.join(store.directory, 'cloudflare-quick'), port: APP_PORT,
      onState: (state) => { tunnelState = state; },
      onExit: () => {
        tunnel = null; tunnelState = 'off'; activeOrigin = '';
        appHost.setPublicOrigin('').catch(() => {});
        if (!changing) errorMessage = 'Cloudflare 연결이 종료됐습니다. 서버 끄기 후 다시 켜 주세요.';
      },
    });
    tunnel = quick.child;
    try {
      const origin = await quick.ready;
      if (tunnel !== quick.child || quick.child.exitCode !== null) throw error('Cloudflare 연결이 종료됐습니다.', 503);
      await appHost.setPublicOrigin(origin);
      activeOrigin = origin;
    } catch (err) { await stopService(); throw err; }
  } else if (hosting.provider === 'ngrok') {
    tunnelState = 'starting';
    tunnel = spawn(ngrok, ['http', `http://127.0.0.1:${APP_PORT}`, '--url', hosting.publicOrigin, '--inspect=false', '--log=stdout', '--log-format=json'], {
      cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    // Do not persist tunnel output: it can contain authentication or request data.
    let buffer = '';
    tunnel.stdout.on('data', (chunk) => {
      buffer = (buffer + chunk.toString()).slice(-20000);
      if (buffer.includes('started tunnel') && buffer.includes(hosting.publicOrigin)) tunnelState = 'connected';
    });
    tunnel.stderr.on('data', () => { /* errors reported through exit state */ });
    tunnel.on('error', () => { tunnelState = 'failed'; errorMessage = 'ngrok 실행 파일·계정 연결을 확인해 주세요.'; });
    tunnel.on('exit', () => { tunnel = null; tunnelState = 'off'; if (!changing) errorMessage = '공개 연결이 종료됐습니다. 로컬 앱 상태를 확인해 주세요.'; });
  } else tunnelState = hosting.provider === 'external' ? 'external-unverified' : 'off';
}
function validateHosting(data) {
  if (environment === 'development' && data.provider !== 'none') throw error('Development environments stay on loopback. Use a separately reviewed staging environment.');
  if (!['none', 'cloudflare-quick', 'ngrok', 'external'].includes(data.provider)) throw error('공개 연결 방식을 선택해 주세요.');
  if (data.provider === 'cloudflare-quick') return { provider: 'cloudflare-quick', publicOrigin: '' };
  const publicOrigin = typeof data.publicOrigin === 'string' ? data.publicOrigin.trim() : '';
  if (publicOrigin) {
    let url;
    try { url = new URL(publicOrigin); } catch { throw error('올바른 HTTPS 주소를 입력해 주세요.'); }
    if (url.protocol !== 'https:' || url.origin !== publicOrigin || url.username || url.password || url.port || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw error('HTTPS 주소만 입력하세요. 끝의 /와 경로는 제외합니다.');
    if (data.provider === 'ngrok' && !url.hostname.endsWith('.ngrok-free.app') && !url.hostname.endsWith('.ngrok.app') && !url.hostname.endsWith('.ngrok-free.dev')) throw error('계정에서 배정받은 ngrok 주소를 입력해 주세요.');
  }
  if (data.provider !== 'none' && !publicOrigin) throw error('공개 주소가 필요합니다.');
  return { provider: data.provider, publicOrigin: data.provider === 'none' ? '' : publicOrigin };
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
  try {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !hosts.has(req.headers.host)
      || Object.keys(req.headers).some((key) => key === 'forwarded' || key.startsWith('x-forwarded-'))
      || req.headers['sec-fetch-site'] === 'cross-site') throw error('이 관리 화면은 집 PC에서 직접 열어야 합니다.', 403);
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && (!origins.has(req.headers.origin) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))) throw error('올바르지 않은 관리자 요청입니다.', 403);
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const data = await body(req);
      if (!safeEqual(data.key, secret)) throw error('관리 인증에 실패했습니다.', 403);
      const now = Date.now();
      for (const [token, expiry] of sessions) if (expiry < now) sessions.delete(token);
      if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, now + 8 * 3600000);
      res.setHeader('Set-Cookie', `rift_admin_v020=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      json(res, 200, { ok: true }); return;
    }
    if (url.pathname.startsWith('/api/')) {
      authenticate(req);
      if (url.pathname === '/api/status' && req.method === 'GET') {
        json(res, 200, { appRunning: appReady, activeOrigin, cloudflaredInstalled: fs.existsSync(path.join(store.directory, 'tools', 'cloudflared.exe')), tunnel: tunnelState, changing, error: errorMessage, hosting: config(), appHost: appHost.status(), stats: store.stats(), reportStates: REPORT_STATES, localUrl: `http://127.0.0.1:${APP_PORT}/` }); return;
      }
      if (url.pathname === '/api/knowledge' && req.method === 'GET') { json(res, 200, await knowledgeStatus(ROOT)); return; }
      if (url.pathname === '/api/knowledge/discover' && req.method === 'POST') {
        throw error('v0.2.0 자동 외부 수집은 비활성입니다. 개발 폴더에서 npm run riot:preview로 모의 자료를 확인하세요.', 409);
      }
      if (url.pathname === '/api/knowledge/activate' && req.method === 'POST') {
        const data = await body(req);
        const result = await activateRelease(ROOT, data.releaseId, data.expectedId, { acknowledgeReview: data.reviewed === true });
        json(res, 200, result); return;
      }
      if (url.pathname === '/api/app-releases' && req.method === 'GET') {
        const releases = [];
        for (const name of fs.readdirSync(path.join(ROOT, 'releases'))) {
          try { const value = JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', name, 'app-release.json'), 'utf8')); if (value.ready && value.releaseId === name) releases.push(value); } catch { /* not ready */ }
        }
        json(res, 200, { current: appHost.status(), releases }); return;
      }
      if (url.pathname === '/api/app-release' && req.method === 'POST') {
        if (changing || !appReady) throw error('서버가 실행 중일 때 앱 버전을 적용할 수 있습니다.', 409);
        changing = true;
        try {
          const data = await body(req);
          const previous = appHost.status().releaseId;
          const result = await appHost.deploy(data.releaseId);
          app = appHost.currentChild(); appReady = Boolean(app); errorMessage = '';
          store.setSetting('previousAppRelease', previous); store.setSetting('appRelease', data.releaseId);
          json(res, 200, result);
        } finally { changing = false; }
        return;
      }
      if (url.pathname === '/api/reports' && req.method === 'GET') { json(res, 200, { reports: store.listReports() }); return; }
      if (/^\/api\/reports\/[a-f0-9-]{36}$/.test(url.pathname)) {
        const id = url.pathname.split('/').pop();
        if (req.method === 'GET') { json(res, 200, store.reportDetail(id)); return; }
        if (req.method === 'POST') { const data = await body(req); json(res, 200, store.updateReport(id, data.status, data.note)); return; }
      }
      if (req.method === 'POST' && url.pathname === '/api/ai') {
        const data = await body(req);
        if (typeof data.enabled !== 'boolean') throw error('올바르지 않은 AI 설정입니다.');
        store.setSetting('aiEnabled', data.enabled); json(res, 200, { ok: true }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/hosting') {
        if (app || changing) throw error('서버를 먼저 중지한 뒤 주소 설정을 바꿔 주세요.', 409);
        const value = validateHosting(await body(req)); store.setSetting('hosting', value); json(res, 200, value); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/limits') {
        const data = await body(req), current = store.limits();
        for (const name of Object.keys(current)) {
          if (!Number.isInteger(data[name]) || data[name] < 1 || data[name] > (name === 'concurrent' ? 3 : 1000)) throw error('한도는 정수 1~1,000, 동시 요청은 1~3으로 설정하세요.');
        }
        store.setSetting('limits', Object.fromEntries(Object.keys(current).map((key) => [key, data[key]]))); json(res, 200, { ok: true }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/backup') { json(res, 200, await store.makeBackup()); return; }
      if (req.method === 'POST' && ['/api/start', '/api/stop'].includes(url.pathname)) {
        if (changing) throw error('서버 상태를 바꾸는 중입니다.', 409);
        changing = true;
        try { await (url.pathname === '/api/start' ? startService() : stopService()); json(res, 200, { ok: true }); }
        catch (err) { errorMessage = err.message; throw err; }
        finally { changing = false; }
        return;
      }
      throw error('관리 기능을 찾을 수 없습니다.', 404);
    }
    const files = { '/': ['index.html', 'text/html'], '/manager.js': ['manager.js', 'text/javascript'], '/manager.css': ['manager.css', 'text/css'] };
    if (req.method !== 'GET' || !files[url.pathname]) throw error('Not found.', 404);
    const [file, type] = files[url.pathname];
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(APP_ROOT, 'manager-ui', file)));
  } catch (err) { json(res, err.statusCode || 500, { error: err.statusCode ? err.message : '관리 작업 중 오류가 발생했습니다.' }); }
});
server.requestTimeout = 120000;
server.headersTimeout = 10000;
server.on('error', () => { console.error('관리 서버를 시작하지 못했습니다. 3200 포트를 확인하세요.'); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tmp', 'manager.json'), JSON.stringify({ pid: process.pid, port: PORT, script: __filename }));
  ensureSourceMonitor();
  console.log(`리프트어시 관리 화면: http://127.0.0.1:${PORT}/ (프로젝트의 실행 파일로 인증)`);
});
const cleanup = setInterval(() => { try { store.purge(); } catch { /* next run retries */ } }, 3600000);
cleanup.unref();
const monitorRecovery = setInterval(() => { try { ensureSourceMonitor(); } catch { /* collection never blocks service startup */ } }, 60000);
monitorRecovery.unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { changing = true; await stopService(); server.close(() => { store.close(); process.exit(0); }); });
