const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, fork } = require('node:child_process');
const { once } = require('node:events');
const { release, freePort } = require('./helpers/isolated-server.cjs');
const { assertSafeLocation, assertEnvironment } = require(path.join(release, 'src/environment.js'));
const { createRiotAdapter } = require(path.join(release, 'src/riot-adapter.js'));
const { convertCatalog, translateCatalog } = require(path.join(release, 'src/riot-converter.js'));
const { createCardAccess } = require(path.join(release, 'src/card-access.js'));
const shared = path.resolve(release, '../..');

test('v0.3.0 rejects the shared runtime root before opening DBs and keys', () => {
  assert.throws(() => assertSafeLocation(shared), /production data tree/);
  for (const script of ['server.js', 'manager.js']) {
    const result = spawnSync(process.execPath, [path.join(release, 'src', script)], {
      env: { RIFTASSI_DATA_ROOT: shared }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /production data tree/);
  }
});

test('unmarked roots and links to production directories are rejected', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-isolation-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.throws(() => assertEnvironment(dir), /No runtime store was opened/);
  await fs.writeFile(path.join(dir, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.3.0', environment: 'development' }));
  assert.equal(assertEnvironment(dir), 'development');
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-isolation-target-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(dir, 'knowledge-releases'), 'dir');
  assert.throws(() => assertEnvironment(dir), /must not link outside/);
});

test('mock collector/converter/translation use synthetic sources and preserve English originals', async () => {
  let calls = 0;
  const input = await createRiotAdapter({ fetchImpl: () => { calls++; throw new Error(); } }).collect();
  const catalog = convertCatalog(input);
  assert.equal(calls, 0); assert.equal(input.origin, 'mock');
  assert.ok(catalog.cards.every(card => card.source.kind === 'mock' && card.authority === 'mock-source' && !card.imageUrl));
  assert.equal(createCardAccess('verified-only').snapshot({ releaseId: 'mock', cardCatalog: catalog }).cardCatalog.cards.length, 0, 'Mock cards cannot enter a non-development view.');
  const english = catalog.cards.map(card => card.textEn);
  const translated = await translateCatalog(catalog, { reviewReference: 'synthetic-test-only', translate: async () => ({ text: '합성 시험 번역', name: '시험 주문' }) });
  assert.deepEqual(translated.cards.map(card => card.textEn), english);
  assert.equal(translated.cards[1].translationStatus, 'mock');
  assert.equal(translated.cards[1].translationSource.reference, 'synthetic-test-only');
  assert.equal(translated.cards[1].translationSource.englishHash.length, 64);
  assert.equal(translated.cards[1].status, 'preview-unreleased');
  assert.equal(catalog.cards[1].textKo, '', 'Translation does not mutate the original.');
});

test('real adapter requires explicit approval/config and a reviewed mapper, sanitizes errors, and does not imply card permissions', async () => {
  let calls = 0;
  const noCalls = async () => { calls++; throw new Error('SYNTHETIC_SENSITIVE_ERROR'); };
  await assert.rejects(createRiotAdapter({ mode: 'riot-api', fetchImpl: noCalls }).collect(), /reviewed endpoint/);
  const config = { enabled: true, approvedAppReference: 'synthetic-app', mappingVersion: 'synthetic-1', endpoint: 'https://example.invalid/catalog' };
  await assert.rejects(createRiotAdapter({ mode: 'riot-api', config, decodeOfficial: () => ({}), fetchImpl: noCalls }).collect(), /reviewed Riot HTTPS/);
  assert.equal(calls, 0);
  config.endpoint = 'https://test.api.riotgames.com/synthetic-catalog';
  await assert.rejects(createRiotAdapter({ mode: 'riot-api', config, decodeOfficial: () => ({}), getApiKey: () => '', fetchImpl: noCalls }).collect(), /not configured/);
  await assert.rejects(createRiotAdapter({ mode: 'riot-api', config, decodeOfficial: () => ({}), getApiKey: () => 'synthetic-token', fetchImpl: noCalls }).collect(), error => !error.message.includes('SYNTHETIC_SENSITIVE_ERROR'));
  const input = await createRiotAdapter({ mode: 'riot-api', config, getApiKey: () => 'synthetic-token',
    fetchImpl: async (_url, options) => { assert.equal(options.redirect, 'error'); return Response.json({ synthetic: true }); },
    decodeOfficial: () => ({ version: 'synthetic-decoded-1', cards: [{ id: 'test', englishName: 'Synthetic official-mapper test', englishText: 'Synthetic English source.', officialKoreanText: '합성 공식 번역 경로 시험', releaseStatus: 'released' }] }),
  }).collect();
  const converted = convertCatalog(input);
  assert.equal(converted.cards[0].permissions.display, false);
  assert.equal(converted.cards[0].modelReady, false);
  assert.equal(converted.cards[0].translationStatus, 'official');
  let translated = false;
  await translateCatalog(converted, { reviewReference: 'test', translate: () => { translated = true; } });
  assert.equal(translated, false, 'An API-provided official translation is not overwritten.');
});

test('prepared development release runs behind its own gateway with mock AI and never overwrites its pointer', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-v030-smoke-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const ended = once(child, 'exit'); child.send('stop');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await ended; } finally { clearTimeout(force); }
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const setup = spawnSync(process.execPath, [path.join(release, 'scripts/prepare-development.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const pointer = await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8');
  assert.notEqual(spawnSync(process.execPath, [path.join(release, 'scripts/prepare-development.cjs')], { env: { RIFTASSI_DATA_ROOT: root } }).status, 0);
  assert.equal(await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8'), pointer);
  const preview = spawnSync(process.execPath, [path.join(release, 'scripts/preview-riot-import.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).activated, false);
  assert.equal(JSON.parse(preview.stdout).newMockCalls, 2);
  const repeat = spawnSync(process.execPath, [path.join(release, 'scripts/preview-card-translations.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).newMockCalls, 0);
  assert.equal(JSON.parse(repeat.stdout).cacheHits, 2);
  assert.equal(JSON.parse(repeat.stdout).activated, false);
  const sync = spawnSync(process.execPath, [path.join(release, 'scripts/sync-mock-cards.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stderr); assert.equal(JSON.parse(sync.stdout).status, 'candidate');
  const synced = spawnSync(process.execPath, [path.join(release, 'scripts/sync-mock-cards.cjs')], { env: { RIFTASSI_DATA_ROOT: root }, encoding: 'utf8' });
  assert.equal(synced.status, 0, synced.stderr); assert.equal(JSON.parse(synced.stdout).status, 'unchanged');
  assert.equal(JSON.parse(synced.stdout).candidateId, JSON.parse(sync.stdout).candidateId);
  assert.equal(await fs.readFile(path.join(root, 'knowledge-releases/active.json'), 'utf8'), pointer);
  const port = await freePort(), one = await freePort(), two = await freePort();
  const driver = path.join(root, 'smoke.cjs');
  await fs.writeFile(driver, `const {createAppHost}=require(${JSON.stringify(path.join(release, 'src/app-host.js'))});
const h=createAppHost({root:process.env.RIFTASSI_DATA_ROOT,port:${port},workerPorts:[${one},${two}]});
h.deploy('v0.3.0').then(()=>process.send('ready')).catch(()=>process.exit(1));
process.on('message',async()=>{await h.stop();process.exit(0);});`);
  child = fork(driver, [], { env: { RIFTASSI_DATA_ROOT: root, RIFTASSI_EXTERNAL_MODE: 'mock', OPENAI_API_KEY: 'development-mock-only', OPENAI_GENERATION_ENABLED: 'true' }, execArgv: [], silent: true });
  child.stdout.resume(); child.stderr.resume();
  await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('Development gateway did not start.'); })]);
  const base = `http://127.0.0.1:${port}`, health = await fetch(base + '/api/health'), cookie = health.headers.get('set-cookie').split(';')[0];
  const data = await health.json();
  assert.ok(cookie.startsWith('rift_session_v030='));
  assert.equal(data.version, require('../releases/v0.3.0/app-release.json').version); assert.equal(data.providerMode, 'mock'); assert.equal(data.cardCatalog.total, 0);
  const res = await fetch(base + '/api/ask', { method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: require('node:crypto').randomUUID(), question: '같은 턴 같은 전장에서 다시 득점하나요?', language: 'ko' }) });
  const response = await res.json();
  assert.equal(response.status, 'ruling-generated'); assert.match(response.recommendation, /개발용 모의/);
});
