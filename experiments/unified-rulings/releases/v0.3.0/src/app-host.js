// Stable loopback gateway: one request stays on one worker. Never retry AI POSTs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { safeId } = require('./knowledge-provider');
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
function headersWithoutHop(headers) {
  const excluded = new Set([...HOP, ...String(headers.connection || '').split(',').map(s => s.trim().toLowerCase())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !excluded.has(key.toLowerCase())));
}
function releasePath(root, id) {
  if (!safeId(id)) throw new Error('올바르지 않은 앱 버전입니다.');
  const parent = fs.realpathSync(path.join(root, 'releases'));
  const folder = fs.realpathSync(path.join(parent, id));
  if (!folder.startsWith(parent + path.sep) || !fs.statSync(path.join(folder, 'src', 'server.js')).isFile()) throw new Error('앱 버전 경로를 확인하세요.');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'app-release.json'), 'utf8'));
  if (manifest.releaseId !== id || manifest.dataSchema !== 2 || manifest.ready !== true) throw new Error('준비가 완료되지 않은 앱 버전입니다.');
  return folder;
}
function createAppHost({ root, port = 3301, workerPorts = [3311, 3312], onFailure = () => {} }) {
  let gateway = null, current = null, origin = '', operation = false;
  const workers = new Set();
  const drainMs = 90000;
  function status() {
    return { releaseId: current?.releaseId || null, workerPort: current?.port || null,
      activeRequests: current?.requests || 0, draining: [...workers].filter(w => w !== current).length,
      gatewayRunning: Boolean(gateway?.listening), changing: operation };
  }
  async function startGateway() {
    if (gateway?.listening) return;
    const server = http.createServer((req, res) => {
      const selected = current;
      if (!selected || selected.child.exitCode !== null || selected.child.signalCode !== null) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' });
        res.end(JSON.stringify({ error: '서버를 준비하고 있습니다. 잠시 후 다시 이용해 주세요.' })); return;
      }
      selected.requests++;
      let released = false;
      const release = () => { if (!released) { released = true; selected.requests--; } };
      const upstream = http.request({ hostname: '127.0.0.1', port: selected.port, path: req.url, method: req.method,
        headers: headersWithoutHop(req.headers), timeout: 95000 }, incoming => {
        res.writeHead(incoming.statusCode, headersWithoutHop(incoming.headers));
        incoming.on('error', () => res.destroy());
        incoming.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy(new Error('Worker timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: '응답 연결이 끊겼습니다. 처리 상태를 확인한 뒤 다시 이용해 주세요.' }));
        } else res.destroy();
      });
      req.on('aborted', () => upstream.destroy());
      req.on('error', () => upstream.destroy());
      res.on('finish', release);
      res.on('close', () => { upstream.destroy(); release(); });
      req.pipe(upstream);
    });
    server.headersTimeout = 20000; server.requestTimeout = 120000;
    server.on('upgrade', (_, socket) => socket.destroy());
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    server.on('error', error => onFailure(error.message));
    gateway = server;
  }
  async function startWorker(releaseId) {
    const directory = releasePath(root, releaseId);
    const availablePort = workerPorts.find(p => ![...workers].some(w => w.port === p));
    if (!availablePort) throw new Error('이전 버전의 응답이 끝난 뒤 다시 시도해 주세요.');
    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
    const fd = fs.openSync(path.join(root, 'tmp', `worker-${availablePort}.log`), 'a');
    let child;
    try {
      child = fork(path.join(directory, 'src', 'server.js'), [], {
        cwd: root, windowsHide: true, stdio: ['ignore', fd, fd, 'ipc'],
        env: { ...process.env, RIFTASSI_DATA_ROOT: root, PORT: String(availablePort), PUBLIC_PORT: String(port),
          PUBLIC_ORIGIN: origin, APP_RELEASE_ID: releaseId, LOG_CONTENT: 'false' },
      });
    } finally { fs.closeSync(fd); }
    const worker = { child, port: availablePort, releaseId, requests: 0 };
    workers.add(worker);
    child.once('error', () => { if (!child.pid) workers.delete(worker); });
    child.once('exit', code => { workers.delete(worker); if (current === worker) { current = null; onFailure(`앱 프로세스가 종료되었습니다 (${code}). 앱 버전을 다시 적용해 주세요.`); } });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('앱 준비 시간이 초과됐습니다.')), 25000);
        const fail = () => finish(new Error('새 앱을 시작하지 못했습니다. 작업 로그를 확인하세요.'));
        const message = value => { if (value?.type === 'ready') finish(); };
        function finish(error) { clearTimeout(timer); child.off('error', fail); child.off('exit', fail); child.off('message', message); error ? reject(error) : resolve(); }
        child.once('error', fail); child.once('exit', fail); child.on('message', message);
      });
      const ready = await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port: availablePort, path: '/api/health',
          headers: { Host: `127.0.0.1:${port}` }, timeout: 5000 }, response => {
          let body = '';
          response.on('data', chunk => { body += chunk; if (body.length > 65536) response.destroy(new Error('Readiness response too large')); });
          response.on('error', reject);
          response.on('end', () => { try { resolve({ status: response.statusCode, data: JSON.parse(body) }); } catch (error) { reject(error); } });
        });
        request.on('timeout', () => request.destroy(new Error('Readiness timed out')));
        request.on('error', reject);
      });
      const data = ready.data;
      if (ready.status !== 200 || data.appReleaseId !== releaseId || !data.knowledge?.releaseId || !data.indexedRuleCount) throw new Error(`새 앱의 자료 준비 상태를 확인하지 못했습니다 (HTTP ${ready.status}).`);
      return worker;
    } catch (error) { await stopWorker(worker); throw error; }
  }
  async function stopWorker(worker) {
    if (!worker || !workers.has(worker)) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => worker.child.kill(), drainMs + 5000);
      const deadline = setTimeout(() => { clearTimeout(timer); reject(new Error('앱 프로세스 종료를 확인하지 못했습니다.')); }, drainMs + 15000);
      const exit = () => { clearTimeout(timer); clearTimeout(deadline); resolve(); };
      worker.child.once('exit', exit);
      if (worker.child.connected) worker.child.send({ type: 'shutdown' }, error => { if (error) worker.child.kill(); });
      else worker.child.kill();
    });
  }
  async function drain(worker) {
    const end = Date.now() + drainMs;
    while (workers.has(worker) && worker.requests > 0 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 200));
    await stopWorker(worker);
  }
  async function deploy(releaseId) {
    if (operation) throw new Error('앱을 전환하는 중입니다.');
    operation = true;
    try {
      const next = await startWorker(releaseId);
      const previous = current;
      current = next; // only new requests use the new process
      try { await startGateway(); } catch (error) { current = previous; await stopWorker(next); throw error; }
      if (previous) await drain(previous);
      return status();
    } finally { operation = false; }
  }
  async function setPublicOrigin(value) {
    origin = value;
    await Promise.all([...workers].map(({ child }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('공개 주소를 앱에 적용하지 못했습니다.')), 5000);
      function finish(error) { clearTimeout(timer); child.off('message', handler); error ? reject(error) : resolve(); }
      function handler(message) {
        if (message?.type === 'public-origin-set' && message.origin === value) finish();
        if (message?.type === 'public-origin-error') finish(new Error('공개 주소가 거절됐습니다.'));
      }
      child.on('message', handler);
      child.send({ type: 'set-public-origin', origin: value }, error => { if (error) finish(error); });
    })));
  }
  async function stop() {
    const oldGateway = gateway; gateway = null;
    const closed = oldGateway ? new Promise(resolve => { oldGateway.close(resolve); oldGateway.closeIdleConnections(); }) : Promise.resolve();
    const previous = current; current = null;
    await Promise.all([...workers].map(drain));
    await closed;
    return Boolean(previous);
  }
  return { deploy, stop, setPublicOrigin, status, currentChild: () => current?.child || null };
}
module.exports = { createAppHost, releasePath };
