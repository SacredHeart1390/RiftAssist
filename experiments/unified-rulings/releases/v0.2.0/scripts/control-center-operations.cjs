// Owned synthetic development manager only. No production address, key or data import.
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { APP_ROOT, DATA_ROOT: root } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createReviewAuthenticator, assertScope, uuid, error } = require('../src/card-review-auth');
const { loadRelease, safeId } = require('../src/knowledge-provider');
const { createStore } = require('../src/operations-store');
let manager, ownedLock, lockFile;
async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function owner() {
  if (assertEnvironment(root) !== 'development') throw error('review-operations-development-only');
  const file = path.join(root, '.riftassist-control-center.json');
  if ((await fs.lstat(file)).isSymbolicLink()) throw error('review-operations-owner');
  const marker = JSON.parse(await fs.readFile(file, 'utf8'));
  if (marker.schemaVersion !== 1 || marker.purpose !== 'synthetic-control-center' || marker.id !== path.basename(root) || !uuid(marker.id)) throw error('review-operations-owner');
  const active = JSON.parse(await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8'));
  const current = await loadRelease(root, active.releaseId);
  if (!current.cardCatalog.cards.length || current.cardCatalog.cards.some(c => c.source?.kind !== 'mock')) throw error('review-operations-mock-only');
}
async function seed() {
  const store = createStore(root);
  try {
    if (store.setting('controlCenterSyntheticSeed', false)) return;
    // Never repurpose an existing operations store. This marker is written only on a new app-owned sandbox.
    if (store.listReports().length) throw error('review-operations-seed-conflict');
    const ownerId = store.hash('synthetic-control-center-owner');
    const question = store.beginQuestion(ownerId, 'synthetic-question-0001', { text: '합성 질문: 연습 카드의 효과는 무엇인가요?' }, 'synthetic-control-center-question', { source: 'synthetic' });
    store.finishQuestion(question.id, { status: 'ruling-generated', recommendation: '개발용 모의 답변입니다.', evidence: [], judgeCases: [] }, { provider: 'mock', paidCalls: 0 });
    store.report(ownerId, { clientKey: 'synthetic-report-0001', requestId: question.id, category: 'app', description: '합성 제보: 비교 화면의 한글 줄바꿈을 확인해 주세요.', expected: '개발용 화면 점검', tags: ['display'] });
    const call = store.reserveCall(ownerId, 'answer'); store.finishCall(call, { input_tokens: 120, output_tokens: 45 });
    store.setSetting('controlCenterSyntheticSeed', true);
  } finally { store.close(); }
  const source = path.join(root, 'releases/v0.2.0'), target = path.join(root, 'releases/v0.2.0-cc-demo');
  try { await fs.access(target); } catch {
    await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    const file = path.join(target, 'app-release.json'), manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...manifest, releaseId: 'v0.2.0-cc-demo', runtimeScope: 'development-fixture-only' }));
  }
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--bootstrap-stdin') throw error('review-operations-bootstrap');
  await owner();
  process.stdin.setEncoding('utf8'); let buffer = ''; const input = process.stdin[Symbol.asyncIterator]();
  while (!buffer.includes('\n')) { const part = await input.next(); if (part.done) throw new Error(); buffer += part.value; if (Buffer.byteLength(buffer.split('\n')[0]) > 32768) throw new Error(); }
  const end = buffer.indexOf('\n'); const authentication = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
  const auth = createReviewAuthenticator(authentication); authentication.credentials = [];
  const controlFolder = path.join(root, 'control-center-operations');
  try { if ((await fs.lstat(controlFolder)).isSymbolicLink()) throw error('review-operations-owner'); }
  catch (err) { if (err.code !== 'ENOENT') throw err; await fs.mkdir(controlFolder); }
  lockFile = path.join(controlFolder, 'manager.lock');
  // One app-owned development manager per root. Never steal a stale lock or kill a recorded PID.
  try { ownedLock = await fs.open(lockFile, 'wx', 0o600); await ownedLock.writeFile(JSON.stringify({ ownerPid: process.pid, purpose: 'synthetic-development-manager' })); }
  catch { throw error('review-operations-busy'); }
  await seed();
  const ports = [];
  while (ports.length < 4) { const p = await freePort(); if (!ports.includes(p)) ports.push(p); }
  manager = fork(path.join(APP_ROOT, 'src/manager.js'), [], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, MANAGER_PORT: String(ports[0]), APP_PORT: String(ports[1]), RIFTASSI_CC_WORKER_PORTS: JSON.stringify(ports.slice(2)),
      RIFTASSI_DATA_ROOT: root, RIFTASSI_EXTERNAL_MODE: 'mock', OPENAI_GENERATION_ENABLED: 'false' } });
  // Authenticate only after the exact owned child confirms that its own listener is ready.
  // A port-probe race must never send even a development key to an unrelated loopback service.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(error('review-operations-worker-start')), 8000);
    const failed = () => finish(error('review-operations-worker-ended'));
    const message = value => {
      if (value?.type === 'control-center-manager-ready' && value.port === ports[0] && value.rootId === path.basename(root)) finish();
    };
    function finish(err) { clearTimeout(timer); manager.off('exit', failed); manager.off('error', failed); manager.off('message', message); err ? reject(err) : resolve(); }
    manager.once('exit', failed); manager.once('error', failed); manager.on('message', message);
  });
  const origin = `http://127.0.0.1:${ports[0]}`; let cookie = '';
  async function api(route, data, unauthenticated = false) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(origin + route, { redirect: 'error', signal: controller.signal, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie && !unauthenticated ? { Cookie: cookie } : {}) },
        ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }) });
      const text = await response.text(); if (Buffer.byteLength(text) > 1000000) throw error('review-operations-response-limit');
      const value = JSON.parse(text);
      if (!response.ok) throw error(response.status === 401 || response.status === 403 ? 'review-operations-authentication' : 'review-operations-request-rejected');
      return { value, cookie: response.headers.get('set-cookie') };
    } finally { clearTimeout(timer); }
  }
  const keyFile = path.join(root, 'private/manager.key');
  if ((await fs.lstat(keyFile)).isSymbolicLink()) throw error('review-operations-owner');
  const key = (await fs.readFile(keyFile, 'utf8')).trim(); if (!/^[a-f0-9]{64}$/.test(key)) throw error('review-operations-authentication');
  const login = await api('/api/login', { key });
  cookie = login.cookie?.split(';')[0] || ''; if (!/^rift_admin_v020=[a-f0-9]{64}$/.test(cookie)) throw error('review-operations-authentication');
  const parentJournal = path.join(root, 'control-center-operations'), journal = path.join(parentJournal, 'events');
  for (const directory of [parentJournal, journal]) {
    try { if ((await fs.lstat(directory)).isSymbolicLink()) throw error('review-operations-owner'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; await fs.mkdir(directory); }
  }
  async function events() {
    const names = (await fs.readdir(journal)).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
    if (names.length > 2000) throw error('review-operations-journal-limit');
    const rows = [];
    for (const name of names) { const file = path.join(journal, name); if ((await fs.lstat(file)).isSymbolicLink()) throw error('review-operations-owner'); rows.push(JSON.parse(await fs.readFile(file, 'utf8'))); }
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }
  async function dispatch(request) {
    try {
      const context = auth.verify(request); const p = request.params || {}, method = request.method;
      const reads = ['status', 'reports', 'report', 'knowledge', 'app-releases', 'logs'];
      const writes = ['start', 'stop', 'restart', 'ai', 'limits', 'update-report', 'hosting', 'backup', 'app-release', 'knowledge-discover', 'knowledge-activate'];
      if (!reads.includes(method) && !writes.includes(method)) throw error('review-operations-method');
      assertScope(context, writes.includes(method) ? 'operations:write' : 'operations:read');
      const id = p.id;
      if (['report', 'update-report'].includes(method) && !uuid(id)) throw error('review-operations-report-id');
      const routes = { status: '/api/status', reports: '/api/reports', report: `/api/reports/${id}`, knowledge: '/api/knowledge', 'app-releases': '/api/app-releases' };
      if (method === 'logs') return { protocol: 'riftassist-control-1', requestId: request.requestId, ok: true, result: { events: (await events()).slice(0, 100), scope: 'synthetic-control-center-only' } };
      let record, recordPath;
      if (writes.includes(method)) {
        if (typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 1000) throw error('review-operations-reason');
        if ((await events()).some(e => e.outcome === 'started' || e.outcome === 'uncertain')) throw error('review-operations-result-uncertain');
        recordPath = path.join(journal, request.requestId + '.json');
        record = { at: new Date().toISOString(), actor: context.actor, operationId: request.requestId, action: method, reason: p.reason, outcome: 'started' };
        try { await fs.writeFile(recordPath, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); } catch { throw error('review-operation-conflict'); }
      }
      let result;
      try {
        if (routes[method]) result = (await api(routes[method])).value;
        else if (method === 'restart') { await api('/api/stop', {}); result = (await api('/api/start', {})).value; }
        else {
          let data = {};
          if (method === 'ai') data = { enabled: p.enabled };
          if (method === 'limits') data = p.limits;
          if (method === 'update-report') data = { status: p.status, note: p.note };
          if (method === 'hosting') { if (p.provider !== 'none') throw error('review-operations-hosting-blocked'); data = { provider: 'none', publicOrigin: '' }; }
          if (method === 'app-release') { if (!['v0.2.0', 'v0.2.0-cc-demo'].includes(p.releaseId)) throw error('review-operations-release'); data = { releaseId: p.releaseId }; }
          if (method === 'knowledge-activate') { if (!safeId(p.releaseId) || !safeId(p.expectedId)) throw error('review-operations-release'); data = { releaseId: p.releaseId, expectedId: p.expectedId, reviewed: p.reviewed === true }; }
          const writeRoutes = { 'update-report': `/api/reports/${id}`, 'app-release': '/api/app-release', 'knowledge-discover': '/api/knowledge/discover', 'knowledge-activate': '/api/knowledge/activate' };
          result = (await api(writeRoutes[method] || `/api/${method}`, data)).value;
        }
        if (record) await fs.writeFile(recordPath, JSON.stringify({ ...record, outcome: 'completed' }));
      } catch (err) {
        if (record) await fs.writeFile(recordPath, JSON.stringify({ ...record, outcome: err.expected ? 'rejected' : 'uncertain' }));
        throw err;
      }
      return { protocol: 'riftassist-control-1', requestId: request.requestId, ok: true, result: { ...result, controlCenterMode: 'synthetic-development' } };
    } catch (err) {
      return { protocol: 'riftassist-control-1', requestId: uuid(request?.requestId) ? request.requestId : null, ok: false,
        error: { code: err.expected ? err.code : 'review-operations-result-uncertain', message: 'Inspect the isolated development status and operation journal.' } };
    }
  }
  while (true) {
    if (Buffer.byteLength(buffer) > 1048576) throw new Error();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); let request;
      try { request = JSON.parse(line); } catch { request = null; }
      const response = await dispatch(request);
      if (!process.stdout.write(JSON.stringify(response) + '\n')) await once(process.stdout, 'drain');
    }
    const next = await input.next(); if (next.done) break; buffer += next.value;
  }
}
async function cleanup() {
  try {
    if (manager && manager.exitCode === null && manager.signalCode === null) {
      const ended = once(manager, 'exit'); manager.kill('SIGTERM');
      // C# bounds shutdown and kills this complete owned tree, never just its intermediate manager.
      await ended;
    }
  } finally { if (ownedLock) { await ownedLock.close(); await fs.unlink(lockFile); } }
}
main().catch(() => { process.stderr.write('Isolated operations control stopped. No remote connection was attempted.\n'); process.exitCode = 1; }).finally(cleanup);
