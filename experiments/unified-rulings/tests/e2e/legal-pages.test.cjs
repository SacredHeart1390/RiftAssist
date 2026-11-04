const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { isolatedServer, fixture, release } = require('../helpers/isolated-server.cjs');
const notice = 'RiftAssist was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.';

async function openBrowser(t, { width = 1280, serviceWorkers = 'block', serverOptions = {} } = {}) {
  const server = await isolatedServer(t, [], serverOptions);
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'],
    ...(process.env.RIFTASSI_E2E_EXECUTABLE_PATH ? { executablePath: process.env.RIFTASSI_E2E_EXECUTABLE_PATH } : {}),
    ...(process.env.RIFTASSI_E2E_CHANNEL ? { channel: process.env.RIFTASSI_E2E_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers, locale: 'ko-KR' });
  const page = await context.newPage();
  const errors = [], offsite = [];
  page.on('pageerror', err => errors.push(err.message));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
    offsite.push(route.request().url()); return route.abort('blockedbyclient');
  });
  server.addCleanup(async () => {
    await context.close(); await browser.close();
    assert.deepEqual(errors, []); assert.deepEqual(offsite, []);
    assert.equal(server.externalCalls.length, 0);
  });
  return { server, browser, context, page };
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows horizontally.');
}
async function screen(page, name) {
  if (!process.env.RIFTASSI_E2E_RESULTS) return;
  await fs.mkdir(process.env.RIFTASSI_E2E_RESULTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.RIFTASSI_E2E_RESULTS, name), fullPage: true });
}

for (const width of [1280, 390, 320]) {
  test(`legal navigation and exact Riot notice at ${width}px, Korean/English and JavaScript off`, async t => {
    const { page, server, browser } = await openBrowser(t, { width });
    await page.goto(server.baseURL);
    await page.waitForFunction(() => !document.querySelector('#submit-button').disabled);
    assert.equal(await page.locator('.riot-notice').innerText(), notice);
    assert.match(await page.locator('.footer-disclaimer').innerText(), /공식 Riot Games.*대회 저지의 최종 판정/);
    const privacy = page.getByRole('link', { name: '개인정보 처리방침', exact: true });
    assert.ok((await privacy.boundingBox()).height >= 44);
    await noOverflow(page);
    await privacy.click();
    assert.match(page.url(), /\/privacy.html$/);
    assert.equal(await page.locator('h1').isVisible(), true);
    await page.getByRole('link', { name: 'English', exact: true }).click();
    assert.match(page.url(), /#en$/);
    assert.ok(await page.locator('#en').innerText().then(text => text.includes('store: false')));
    await noOverflow(page);
    if (width === 390) await screen(page, 'mobile-privacy.png');
    await page.goto(server.baseURL);
    await page.locator('#language-select').selectOption('en');
    assert.equal(await page.locator('.riot-notice').innerText(), notice);
    assert.match(await page.locator('.footer-disclaimer').innerText(), /official Riot Games rulings.*tournament judge/);
    await page.getByRole('link', { name: 'Terms of Use', exact: true }).click();
    assert.match(page.url(), /\/terms.html$/);
    assert.match(await page.locator('#en').innerText(), /do not replace official Riot Games rulings/);
    await noOverflow(page);
    if (width === 1280) await screen(page, 'desktop-terms.png');
    // Legal pages are readable with scripts/cookies unavailable; no API health dependency.
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    try {
      const staticPage = await plain.newPage();
      await staticPage.goto(server.baseURL + '/privacy.html');
      assert.equal(await staticPage.locator('#ko-heading').isVisible(), true);
      await staticPage.getByRole('link', { name: '이용약관 · Terms', exact: true }).click();
      assert.equal(await staticPage.locator('h1').isVisible(), true);
      await noOverflow(staticPage);
    } finally { await plain.close(); }
  });
}

test('report dialog submits successfully alongside the legal footer', async t => {
  const { server, page } = await openBrowser(t, { width: 390 });
  await page.goto(server.baseURL);
  await page.waitForFunction(() => !document.querySelector('#submit-button').disabled);
  await page.getByRole('button', { name: '오류·버그 제보', exact: true }).click();
  assert.match(await page.locator('dialog .report-note').last().innerText(), /90일 후 정리 대상.*백업/);
  await page.getByLabel('어떤 문제가 있었나요?', { exact: true }).fill('Synthetic browser report; no real user information.');
  const submitted = page.waitForResponse(res => res.url() === server.baseURL + '/api/reports' && res.request().method() === 'POST');
  await page.getByRole('button', { name: '제보 보내기', exact: true }).click();
  assert.equal((await submitted).status(), 201);
  await page.locator('dialog [role="status"]').filter({ hasText: '접수했습니다' }).waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  assert.equal(await page.locator('dialog').isVisible(), false);
  await page.getByRole('link', { name: '개인정보 처리방침', exact: true }).click();
  assert.match(page.url(), /\/privacy.html$/);
});

test('PWA precaches the new legal documents; offline navigation works and APIs stay uncached', async t => {
  const { server, page, context } = await openBrowser(t, { serviceWorkers: 'allow' });
  await page.goto(server.baseURL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const keys = await page.evaluate(async () => {
    const cache = await caches.open('riftassi-v0.3.0-card-sync-20261028');
    return (await cache.keys()).map(req => new URL(req.url).pathname);
  });
  for (const route of ['/privacy.html', '/terms.html', '/legal.css']) assert.ok(keys.includes(route));
  assert.ok(keys.every(key => !key.startsWith('/api/')));
  await context.setOffline(true);
  for (const route of ['/privacy.html', '/terms.html']) {
    await page.goto(server.baseURL + route);
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.equal(await page.locator('.riot-notice').innerText(), notice);
  }
  assert.equal(await page.evaluate(() => fetch('/api/health').then(() => true, () => false)), false);
});

test('v0.3.0 mobile default restriction explains the pause and preserves evidence/report access', async t => {
  const { server, page } = await openBrowser(t, { width: 390, serverOptions: { cardPolicy: null, cards: fixture.cards } });
  await page.goto(server.baseURL);
  await page.waitForFunction(() => !document.querySelector('#submit-button').disabled);
  assert.match(await page.locator('#card-catalog-note').innerText(), /카드 이용 권한 확인/);
  await page.locator('#question').fill('유성을 사용한 뒤 같은 턴 같은 전장에서 다시 득점하나요?');
  await page.locator('#submit-button').click();
  await page.locator('#answer-card[data-status="card-access-restricted"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('#answer-status').innerText(), /카드 이용 제한/);
  assert.equal(await page.locator('#answer-card-section').isVisible(), false);
  assert.ok(await page.locator('#evidence-list details').count() > 0);
  assert.equal(await page.locator('img.card-thumbnail').count(), 0);
  assert.equal(await page.getByRole('button', { name: '이 답변 제보하기', exact: true }).isVisible(), true);
  await noOverflow(page); await screen(page, 'v030-restricted-mobile.png');
});

test('v0.3.0 synthetic cards and unreleased previews are clearly labeled in search', async t => {
  const { createRiotAdapter } = require(path.join(release, 'src/riot-adapter.js'));
  const { convertCatalog } = require(path.join(release, 'src/riot-converter.js'));
  const cards = convertCatalog(await createRiotAdapter().collect());
  const { server, page } = await openBrowser(t, { serverOptions: { cards } });
  await page.goto(server.baseURL);
  await page.waitForFunction(() => !document.querySelector('#submit-button').disabled);
  await page.locator('#question').fill('Practice Spell');
  const option = page.locator('#card-options [role="option"]').first();
  await option.waitFor({ state: 'visible' });
  assert.match(await option.innerText(), /개발용 합성 카드.*공식 카드 아님.*미출시 프리뷰/);
  await page.locator('#question').press('Tab');
  await page.locator('#selected-cards .selected-card').waitFor();
  assert.match(await page.locator('#selected-cards').innerText(), /개발용 합성 카드/);
});

test('reviewed card translations display separate English/Korean text and an explicit unofficial AI label', async t => {
  const os = require('node:os');
  const { convertCatalog } = require(path.join(release, 'src/riot-converter'));
  const { normalizeCatalog } = require(path.join(release, 'src/cards'));
  const { createTranslationStore } = require(path.join(release, 'src/card-translation-store'));
  const { createTranslationProvider, createCardTranslationEngine, reviewTranslation } = require(path.join(release, 'src/card-translation'));
  const { englishSource, hash } = require(path.join(release, 'src/card-translation-core'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riftassist-ui-translation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, '.riftassist-environment.json'), JSON.stringify({ releaseFamily: 'v0.3.0', environment: 'development' }));
  const provider = createTranslationProvider({ id: 'synthetic-ui-adapter', model: 'synthetic-ui-model', mode: 'operator-adapter', enabled: true, approvalReference: 'synthetic-ui-test',
    generate: async request => ({ nameKo: '번역 시험 카드', clauses: request.clauses.map(row => ({ id: row.id, textKo: '카드 번역 화면을 시험합니다.' })),
      keywordsKo: [], cost: request.source.cost, stats: request.source.stats, symbols: request.source.symbols, uncertainties: [] }) });
  const catalog = convertCatalog({ schema: 'riftassist-canonical-1', origin: 'mock', version: 'synthetic-ui-v1', sourceUrl: 'https://example.invalid/ui-test', cards: [
    { id: 'translation-ui', englishName: 'Translation Display Fixture', englishText: 'Test the translation display.', releaseStatus: 'released' },
  ] });
  const engine = createCardTranslationEngine({ store: await createTranslationStore(root), provider, maxNewCalls: 1 });
  const candidate = await engine.proposeCatalog(catalog), card = candidate.catalog.cards[0];
  const reviewed = reviewTranslation(card, { proposalId: card.translationProposal.id, expectedEnglishHash: hash(englishSource(card)), reviewReference: 'synthetic-ui-review' });
  const cards = normalizeCatalog({ ...catalog, cards: [reviewed] });
  const { server, page } = await openBrowser(t, { serverOptions: { cards } });
  await page.goto(server.baseURL);
  await page.waitForFunction(() => !document.querySelector('#submit-button').disabled);
  await page.locator('#question').fill('번역 시험 카드');
  await page.locator('#card-options [role="option"]').first().waitFor({ state: 'visible' });
  await page.locator('#question').press('Tab');
  const detail = page.locator('#selected-cards details'); await detail.waitFor();
  await detail.locator('summary').click();
  assert.match(await detail.innerText(), /RiftAssist AI 번역 · 비공식/);
  assert.ok((await detail.innerText()).includes('Test the translation display.'));
  assert.ok((await detail.innerText()).includes('카드 번역 화면을 시험합니다.'));
  assert.ok((await detail.innerText()).includes('synthetic-ui-model'));
  assert.ok((await detail.innerText()).includes('synthetic-ui-v1'));
  await page.locator('#question').dispatchEvent('input');
  assert.equal(await detail.evaluate(node => node.open), true, 'Rerendering preserves an open translation review.');
  await noOverflow(page);
  await screen(page, 'reviewed-unofficial-card-translation.png');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await detail.isVisible(), true);
  assert.match(await detail.innerText(), /RiftAssist AI 번역 · 비공식/);
  await noOverflow(page); await screen(page, 'reviewed-unofficial-card-translation-mobile.png');
  await page.locator('#language-select').selectOption('en');
  assert.equal(await detail.evaluate(node => node.open), true);
  assert.match(await page.locator('#selected-cards details').innerText(), /RiftAssist AI translation · unofficial/);
});
