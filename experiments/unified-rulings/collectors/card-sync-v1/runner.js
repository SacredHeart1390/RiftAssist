const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, atomicJson } = require('../../releases/v0.1.3/src/source-discovery');
const { acquireLock } = require('../../releases/v0.1.3/src/content-sync');
const { importCards } = require('./publish');
const { fetchExport, MAX_BYTES } = require('./source');
const DAY = 86400000;
const DEFAULT_CONFIG = { schemaVersion: 1, enabled: true, mode: 'inbox', remoteUrl: '', intervalHours: 24,
  note: '리프트나루 제공 JSON 주소 미확보. 현재 파일 가져오기만 활성화되어 있습니다.' };
function within(dir, file) {
  const relative = path.relative(path.resolve(dir), path.resolve(file));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('카드 작업 폴더 밖의 파일은 변경할 수 없습니다.');
  return path.resolve(file);
}
async function setup(root) {
  const dir = path.join(root, 'source-updates', 'cards');
  for (const name of ['', 'inbox', 'processing', 'archive', 'review']) {
    const folder = path.join(dir, name); await fs.mkdir(folder, { recursive: true });
    within(await fs.realpath(root), await fs.realpath(folder));
    if ((await fs.lstat(folder)).isSymbolicLink()) throw Error('카드 작업 폴더는 실제 프로젝트 폴더 안에 있어야 합니다.');
  }
  try { await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2), { flag: 'wx' }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  return dir;
}
function checkConfig(c) {
  if (c?.schemaVersion !== 1 || typeof c.enabled !== 'boolean' || !['inbox', 'provided-json'].includes(c.mode) ||
      !Number.isInteger(c.intervalHours) || c.intervalHours < 24 || c.intervalHours > 168) throw Error('카드 갱신 설정 형식을 확인해 주세요.');
  if (c.mode === 'provided-json') {
    const u = new URL(c.remoteUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'www.riftnaru.com' || u.port || u.username || u.password || u.hash) throw Error('리프트나루에서 제공한 HTTPS JSON 주소가 필요합니다.');
  }
  return c;
}
async function runCardSync(root, { watch = false } = {}) {
  const dir = await setup(root), lock = path.join(dir, '.collector.lock');
  await acquireLock(lock);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  let state = await readJson(path.join(dir, 'state.json'), { schemaVersion: 1, history: {}, processed: [], remote: {} });
  const save = () => atomicJson(path.join(dir, 'state.json'), state);
  async function publishStatus(config, phase, error = null) {
    const pointer = await readJson(path.join(root, 'knowledge-releases/active.json'), null);
    const manifest = pointer && await readJson(path.join(root, 'knowledge-releases', pointer.releaseId, 'manifest.json'), null);
    const summary = { state: phase, mode: config?.mode || 'inbox', running: !stopped, pid: process.pid,
      checkedAt: new Date().toISOString(), intervalHours: config?.intervalHours || 24, cardCount: manifest?.counts.cards || 0,
      activeVersion: manifest?.sources.riftnaru?.version || null, nextCheckAt: state.nextRemoteAt ? new Date(state.nextRemoteAt).toISOString() : null,
      lastSuccessAt: state.lastSuccessAt || null, lastSourceCapturedAt: state.lastSourceCapturedAt || null,
      lastAppliedRelease: state.lastAppliedRelease || null, error: error || state.error || null,
      diff: state.diff ? Object.fromEntries(Object.entries(state.diff).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])) : null,
      sourceMissing: Object.values(state.history?.missing || {}).filter(v => v.count >= 2).length,
      remoteConnected: Boolean(config?.mode === 'provided-json' && state.remote?.url === config.remoteUrl && state.remote?.lastSuccessAt),
      sourceNote: config?.mode === 'inbox' ? '원격 카드 제공 주소 미연결 · 파일 가져오기 대기' : '제공 JSON의 정기 갱신 · 전체 목록은 최소 7일마다 다시 확인',
      paidAiCalls: 0 };
    await atomicJson(path.join(dir, 'status.json'), summary);
    // Existing manager already serves this document: no manager/app restart is needed.
    const discoveryFile = path.join(root, 'source-updates/status.json');
    const discovery = await readJson(discoveryFile, { schemaVersion: 1, sources: {} });
    await atomicJson(discoveryFile, { ...discovery, sources: { ...discovery.sources, riftnaru: summary } });
  }
  async function apply(data) {
    const result = await importCards(root, data, state.history || {});
    state.history = result.history; state.diff = result.diff; state.lastSuccessAt = new Date().toISOString();
    state.lastSourceCapturedAt = result.sourceCapturedAt; state.error = null; state.reviewRequired = false;
    if (result.published) state.lastAppliedRelease = result.releaseId;
    await atomicJson(path.join(dir, 'last-result.json'), { ...result, checkedAt: state.lastSuccessAt });
    await save();
    return result;
  }
  async function processFile(file) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw Object.assign(Error('일반 JSON 파일(25MB 이하)만 가져올 수 있습니다.'), { code: 'review-required' });
    const bytes = await fs.readFile(file), fingerprint = crypto.createHash('sha256').update(bytes).digest('hex');
    const after = await fs.lstat(file);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('카드 파일 복사가 끝나면 다음 확인 때 다시 처리합니다.');
    if (!(state.processed || []).includes(fingerprint)) {
      let data;
      try { data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')); }
      catch (e) { e.code = 'review-required'; throw e; }
      await apply(data);
      state.processed = [...(state.processed || []).slice(-99), fingerprint]; await save();
    }
    const destination = path.join(dir, 'archive', `${fingerprint}.json`);
    try { await fs.copyFile(file, destination, 1); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    await fs.unlink(within(dir, file));
  }
  async function processInbox() {
    const pending = (await fs.readdir(path.join(dir, 'processing'))).filter(n => n.endsWith('.json'));
    if (!pending.length) {
      for (const name of (await fs.readdir(path.join(dir, 'inbox'))).filter(n => n.endsWith('.json')).sort()) {
        const file = path.join(dir, 'inbox', name), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || Date.now() - stat.mtimeMs < 2000) continue;
        const claimed = `${crypto.randomUUID()}.json`;
        await fs.rename(within(dir, file), within(dir, path.join(dir, 'processing', claimed))); pending.push(claimed); break;
      }
    }
    if (!pending.length) return;
    const file = path.join(dir, 'processing', pending[0]);
    try { await processFile(file); }
    catch (e) {
      if (e.code !== 'review-required') { state.error = e.message; state.reviewRequired = false; await save(); return; }
      // Preserve the input and reason for review; do not repeatedly publish a rejected batch.
      const target = path.join(dir, 'review', `${Date.now()}-${pending[0]}`);
      await fs.rename(within(dir, file), within(dir, target));
      await atomicJson(`${target}.reason.json`, { message: e.message, details: e.details || null, at: new Date().toISOString() });
      state.error = e.message; state.reviewRequired = true; await save();
    }
  }
  try {
    do {
      let config;
      try {
        config = checkConfig(await readJson(path.join(dir, 'config.json'), DEFAULT_CONFIG));
        if (!config.enabled) { await publishStatus(config, 'paused'); }
        else {
          await processInbox();
          const requested = await readJson(path.join(root, 'source-updates/sync-request.json'), null);
          const force = requested?.requestedAt && requested.requestedAt !== state.lastRequest;
          if (force) state.lastRequest = requested.requestedAt;
          if (config.mode === 'provided-json' && (force || state.remote?.url !== config.remoteUrl || Date.now() >= (state.nextRemoteAt || 0))) {
            // Manual refresh still respects a source-directed wait.
            if (Date.now() >= (state.retryAfter || 0)) {
              await publishStatus(config, 'checking'); state.nextRemoteAt = Date.now() + config.intervalHours * 3600000;
              try {
                const result = await fetchExport(config.remoteUrl, state.remote || {}, Date.now() - (state.lastFullAt || 0) >= 7 * DAY);
                if (!result.unchanged) {
                  await fs.writeFile(path.join(dir, 'archive', `remote-${result.fingerprint}.json`), JSON.stringify(result.data), { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
                  if (!/^all-\d+-artwork-listings-observed-/u.test(result.data?.coverage || '')) throw Object.assign(Error('원격 제공 자료는 전체 카드 목록이어야 합니다. 부분 파일은 로컬 가져오기로 처리해 주세요.'), { code: 'review-required' });
                  const applied = await apply(result.data);
                  if (applied.fullListing) state.lastFullAt = Date.now();
                  state.remote = { ...result.cache, lastSuccessAt: new Date().toISOString() };
                } else { state.error = null; state.reviewRequired = false; state.remote.lastSuccessAt = new Date().toISOString(); }
                state.retryAfter = 0;
              } catch (e) {
                state.error = e.message; state.reviewRequired = e.code === 'review-required';
                state.retryAfter = Date.now() + Math.max(DAY, e.retryAfterMs || 0); state.nextRemoteAt = Math.max(state.nextRemoteAt, state.retryAfter);
              }
            }
          }
          await save();
          await publishStatus(config, state.error ? (state.reviewRequired ? 'awaiting-review' : 'source-unavailable') : config.mode === 'inbox' ? 'source-required' : 'waiting');
        }
      } catch (e) { await publishStatus(config, 'failed', e.message); }
      if (!watch || stopped) break;
      for (let i = 0; i < 60 && !stopped; i++) await new Promise(r => setTimeout(r, 1000));
    } while (!stopped);
  } finally {
    stopped = true; await publishStatus(null, 'stopped').catch(() => {});
    const owner = await readJson(lock, null); if (owner?.pid === process.pid) await fs.unlink(lock);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
async function enqueue(root, input) {
  const dir = await setup(root), file = path.resolve(input), stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw Error('일반 JSON 파일(25MB 이하)을 선택해 주세요.');
  const raw = await fs.readFile(file); JSON.parse(raw.toString('utf8').replace(/^\uFEFF/u, ''));
  const id = crypto.randomUUID(), temporary = path.join(dir, 'inbox', `${id}.pending`), destination = path.join(dir, 'inbox', `${id}.json`);
  await fs.writeFile(temporary, raw, { flag: 'wx' }); await fs.rename(within(dir, temporary), within(dir, destination));
  return { queued: true, file: path.basename(destination), note: '관리 프로그램의 수집기가 다음 확인 때 검사하고 반영합니다. 서버 재시작은 필요 없습니다.' };
}
module.exports = { runCardSync, setup, enqueue, checkConfig };
