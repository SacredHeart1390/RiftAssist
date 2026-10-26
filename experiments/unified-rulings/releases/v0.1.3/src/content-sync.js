// Resumable public-source collection. No model calls, user records or API credentials.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSyncStore } = require('./sync-store');
const { refreshSitemap, collectJudgeBatch } = require('./sync-judge');
const { syncOfficial } = require('./sync-official');
const { loadRelease, digest } = require('./knowledge-provider');
const { stageRelease, activateRelease } = require('./knowledge-releases');
const { atomicJson, readJson } = require('./source-discovery');
const HOUR = 3600000;
const hash = value => digest(Buffer.from(JSON.stringify(value)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function acquireLock(file) {
  const owner = { pid: process.pid, startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await fs.writeFile(file, JSON.stringify(owner), { flag: 'wx' }); return owner; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const prior = await readJson(file, null);
      if (!Number.isInteger(prior?.pid) || prior.pid <= 0) throw new Error('Collector lock requires inspection.');
      let alive = true;
      try { process.kill(prior.pid, 0); } catch (err) { if (err.code === 'ESRCH') alive = false; }
      if (alive) throw new Error('Collector is already running.');
      // Only a demonstrably stopped process can lose ownership.
      const recoveryFile = `${file}.recovery`;
      const guard = await fs.open(recoveryFile, 'wx');
      try {
        const current = await readJson(file, null);
        if (JSON.stringify(current) !== JSON.stringify(prior)) throw new Error('Collector ownership changed.');
        await fs.unlink(file);
      } finally { await guard.close(); await fs.unlink(recoveryFile); }
    }
  }
  throw new Error('Could not acquire collector lock.');
}
async function runContentSync(root, { watch = false, batchLimit = 80 } = {}) {
  const directory = path.join(root, 'source-updates');
  await fs.mkdir(directory, { recursive: true });
  const lockFile = path.join(directory, '.content-sync.lock');
  await acquireLock(lockFile);
  const store = createSyncStore(root);
  let stopping = false, phase = 'starting', lastProgress = 0;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const statusFile = path.join(directory, 'content-status.json');
  async function status(force = false) {
    if (!force && Date.now() - lastProgress < 5000) return;
    lastProgress = Date.now();
    const stats = store.stats();
    await atomicJson(statusFile, { schemaVersion: 1, pid: process.pid, running: !stopping, phase,
      updatedAt: new Date().toISOString(), intervalHours: 6, fullRecheckDays: 7,
      judge: { ...stats, coverage: stats.total && !stats.missing ? (stats.unavailable ? 'complete-with-unavailable' : 'complete') : 'partial',
        pausedUntil: store.state('judgeCooldownUntil', 0) > Date.now() ? new Date(store.state('judgeCooldownUntil', 0)).toISOString() : null },
      official: store.state('official', null), publication: store.state('publication', null), errors: store.state('errors', {}) });
  }
  function error(kind, value) {
    const errors = store.state('errors', {});
    if (value) errors[kind] = { message: value.message || String(value), at: new Date().toISOString() };
    else delete errors[kind];
    store.setState('errors', errors);
  }
  async function active() {
    const pointer = await readJson(path.join(root, 'knowledge-releases', 'active.json'), null);
    if (!pointer?.releaseId) throw new Error('A validated active data release is required.');
    return loadRelease(root, pointer.releaseId);
  }
  async function publish(force = false) {
    const stats = store.stats(), previous = store.state('publication', null);
    // Bound disk writes during the initial crawl; metadata-only checks create no new release.
    if (!force && stats.missing && previous && stats.collected - previous.collected < 1000 && Date.now() - previous.timestamp < HOUR) return;
    if (!force && !previous && stats.collected < 80) return;
    const current = await active();
    const candidate = store.document('official-candidate');
    const currentHash = hash(current.evidence);
    const rules = candidate && [candidate.baseHash, candidate.hash].includes(currentHash) ? candidate.rules : current.evidence;
    const fingerprint = hash({ rules: hash(rules), cards: current.manifest.hashes['cards.json'], cases: store.fingerprint() });
    if (fingerprint === previous?.fingerprint && current.releaseId === previous.releaseId) return;
    const cases = store.cases();
    // A new/empty collector must not erase a previously populated release.
    const ids = new Set(cases.map(c => c.id));
    cases.push(...current.judgeCases.filter(c => !ids.has(c.id)));
    const cards = JSON.parse(await fs.readFile(path.join(root, 'knowledge-releases', current.releaseId, 'cards.json'), 'utf8'));
    const coverage = stats.total && !stats.missing ? (stats.unavailable ? 'complete-with-unavailable' : 'complete') : 'partial';
    const official = store.state('official', null);
    const manifest = await stageRelease(root, { rules, cards, judgeCases: cases,
      parserVersion: 'coordinate-rule-columns-2+judge-dom-1', sources: { ...current.manifest.sources,
        core: official?.documents?.['core-rules']?.version ? official.documents['core-rules'] : current.manifest.sources.core,
        tournament: official?.documents?.['tournament-rules']?.version ? official.documents['tournament-rules'] : current.manifest.sources.tournament,
        officialSync: official, riftjudge: { coverage, known: stats.total, collected: stats.collected,
          unavailable: stats.unavailable, removed: stats.removed, sitemapCheckedAt: stats.sitemap?.checkedAt, checkedAt: new Date().toISOString() } } });
    await activateRelease(root, manifest.releaseId, current.releaseId);
    const record = { releaseId: manifest.releaseId, previousReleaseId: current.releaseId, timestamp: Date.now(),
      collected: stats.collected, fingerprint, publishedAt: new Date().toISOString() };
    store.setState('publication', record); error('publication', null);
    console.log(JSON.stringify({ event: 'published', releaseId: manifest.releaseId, rules: rules.length, cases: cases.length, coverage }));
  }
  try {
    await atomicJson(path.join(directory, 'monitor.json'), { pid: process.pid, script: path.join(root, 'scripts', 'source-monitor.js'),
      implementation: 'content-sync-v1', intervalHours: 6, startedAt: new Date().toISOString() });
    do {
      let publishRules = false;
      const requested = await readJson(path.join(directory, 'sync-request.json'), null);
      const forceRefresh = requested?.requestedAt && requested.requestedAt !== store.state('lastRequest', '');
      if (forceRefresh) store.setState('lastRequest', requested.requestedAt);
      if (forceRefresh || Date.now() - store.state('lastOfficialAttempt', 0) >= 6 * HOUR) {
        phase = 'official-documents'; await status(true); store.setState('lastOfficialAttempt', Date.now());
        try {
          const current = await active();
          const result = await syncOfficial(root, store, current.evidence);
          // Stage sentinels also run below; independently validate critical context here so Q&A progress is not blocked.
          const map = new Map(result.rules.map(r => [r.id, r]));
          if (!/same named/iu.test(map.get('core-rules:103.3.b')?.officialTextEn || '') ||
              !/deck box/iu.test(map.get('tournament-rules:703.4.a.5')?.officialTextEn || '') ||
              !/703\.4\.a\.5/iu.test(map.get('tournament-rules:703.4.c.5')?.officialTextEn || '')) throw new Error('Critical rule numbering/content changed; operator review needed.');
          store.saveDocument('official-candidate', { baseHash: hash(current.evidence), hash: hash(result.rules), rules: result.rules });
          publishRules = hash(current.evidence) !== hash(result.rules);
          error('official', null);
        } catch (e) { error('official', e); }
      }
      if (stopping) break;
      if (forceRefresh || Date.now() - store.state('lastSitemapAttempt', 0) >= 6 * HOUR) {
        phase = 'sitemap'; await status(true); store.setState('lastSitemapAttempt', Date.now());
        try { await refreshSitemap(store); error('sitemap', null); } catch (e) { error('sitemap', e); }
      }
      phase = 'judge-bodies'; await status(true);
      const batch = await collectJudgeBatch(store, { limit: batchLimit, onProgress: () => status(), shouldStop: () => stopping });
      if (batch.processed || publishRules || !store.state('publication', null) || store.state('errors', {}).publication) {
        try { phase = 'publishing'; await publish(publishRules || !store.state('publication', null)); } catch (e) { error('publication', e); }
      }
      phase = batch.pausedUntil ? 'paused-source' : store.stats().pendingNow ? 'judge-bodies' : 'waiting';
      await status(true);
      if (!watch || stopping) break;
      // Short waits keep shutdown responsive. Queue checkpoints survive process/PC shutdown.
      const until = Date.now() + (phase === 'judge-bodies' ? 500 : 60000);
      while (!stopping && Date.now() < until) await delay(Math.min(1000, until - Date.now()));
    } while (!stopping);
  } finally {
    stopping = true; phase = 'stopped'; await status(true).catch(() => {}); store.close();
    const owner = await readJson(lockFile, null);
    if (owner?.pid === process.pid) await fs.unlink(lockFile);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
module.exports = { runContentSync, acquireLock };
