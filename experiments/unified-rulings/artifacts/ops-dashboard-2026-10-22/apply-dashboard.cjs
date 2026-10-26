// Apply administrator static assets only. Never restart a process or call generation APIs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const BACKUP = path.join(ROOT, 'backups/ops-dashboard-2026-10-22/manager-ui');
const BASE = 'http://127.0.0.1:3100';
const names = ['index.html', 'manager.css', 'manager.js'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const output = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2));

async function main() {
  const key = fs.readFileSync(path.join(ROOT, 'private/manager.key'), 'utf8').trim();
  const login = await fetch(BASE + '/api/login', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ key }), signal: AbortSignal.timeout(5000) });
  if (!login.ok) throw new Error(`Manager login HTTP ${login.status}`);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = async route => {
    const response = await fetch(BASE + route, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
    return response.json();
  };
  const snapshot = async () => {
    const status = await get('/api/status');
    const manager = readJson(path.join(ROOT, 'tmp/manager.json'));
    let worker = null;
    if (status.appHost.workerPort) worker = readJson(path.join(ROOT, `tmp/release-server-${status.appHost.workerPort}.json`));
    return { recordedAt: new Date().toISOString(), managerPid: manager.pid, workerPid: worker?.pid, appRunning: status.appRunning, activeOrigin: status.activeOrigin, tunnel: status.tunnel, error: status.error, appHost: status.appHost, day: status.stats.day, calls: status.stats.calls, limits: status.stats.limits, aiEnabled: status.stats.aiEnabled };
  };
  const before = await snapshot();
  if (!before.appRunning || before.tunnel !== 'connected' || before.appHost.changing) throw new Error('Existing service is not in a stable running state; static update was not applied.');
  for (const name of names) {
    if (digest(fs.readFileSync(path.join(ROOT, 'manager-ui', name))) !== digest(fs.readFileSync(path.join(BACKUP, name)))) throw new Error(`Source changed since backup: ${name}`);
  }
  output('before.json', before);
  const applied = [];
  const replace = (from, target) => {
    const temporary = target + '.ops-dashboard-20261022.tmp';
    fs.copyFileSync(from, temporary, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, target);
  };
  try {
    // Old JS tolerates the added HTML. Publish the new behavior last.
    for (const name of names) {
      replace(path.join(__dirname, 'staged', name), path.join(ROOT, 'manager-ui', name)); applied.push(name);
    }
    const files = [];
    for (const name of names) {
      const response = await fetch(BASE + (name === 'index.html' ? '/' : '/' + name), { signal: AbortSignal.timeout(5000) });
      const received = Buffer.from(await response.arrayBuffer());
      const expected = fs.readFileSync(path.join(__dirname, 'staged', name));
      if (response.status !== 200 || digest(received) !== digest(expected)) throw new Error(`Served file mismatch: ${name}`);
      files.push({ name, httpStatus: response.status, bytes: received.length, sha256: digest(received) });
    }
    const after = await snapshot();
    const preserved = ['managerPid', 'workerPid', 'activeOrigin', 'tunnel'].every(key => before[key] === after[key]) && after.appRunning && after.appHost.releaseId === before.appHost.releaseId;
    output('deployment.json', { before, after, files, processesAndAddressPreserved: preserved, paidAiCallsMadeByThisTask: 0 });
    if (!preserved) throw new Error('Runtime changed during deployment; review recorded state.');
    console.log(JSON.stringify({ managerPid: after.managerPid, workerPid: after.workerPid, releaseId: after.appHost.releaseId, activeOrigin: after.activeOrigin, tunnel: after.tunnel, assetsApplied: files.length, processesAndAddressPreserved: preserved }, null, 2));
  } catch (error) {
    for (const name of applied.reverse()) replace(path.join(BACKUP, name), path.join(ROOT, 'manager-ui', name));
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
