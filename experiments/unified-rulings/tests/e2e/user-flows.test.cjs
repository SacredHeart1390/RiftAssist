const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { isolatedServer, fixture } = require('../helpers/isolated-server.cjs');
const results = process.env.RIFTASSI_E2E_RESULTS || path.resolve(__dirname, '../results/e2e');
const expected = '같은 턴에 같은 전장에서 이미 득점했다면 다시 정복해도 추가 점수를 얻지 않습니다.';
const question = '제 턴 개시 단계에 한 전장에서 점거로 1점을 얻었습니다. 상대에게 빼앗긴 뒤 같은 턴에 다시 정복하면 추가 점수를 얻나요?';
const steps = ['이 전장에서 이번 턴 이미 득점했는지 확인합니다.', '같은 턴의 재정복으로는 추가 점수를 얻지 않습니다.'];
function answer() {
  return { recommendation: expected, resolutionSteps: steps,
    reasoning: '코어룰 472에 따라 한 플레이어는 한 턴에 전장당 한 번만 득점합니다.', confidence: 'medium',
    evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] }, followUpQuestions: [],
    citedRuleIds: ['core-rules:472'], citedCaseIds: [], citedCardIds: [], caseTitles: [], caseComparisons: [], requiresJudge: false };
}
async function browserSession(t, plans, options = {}) {
  const server = await isolatedServer(t, plans);
  // Use an isolated headless profile, never the user's existing browser or production server.
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'],
    ...(process.env.RIFTASSI_E2E_EXECUTABLE_PATH ? { executablePath: process.env.RIFTASSI_E2E_EXECUTABLE_PATH } : {}),
    ...(process.env.RIFTASSI_E2E_CHANNEL ? { channel: process.env.RIFTASSI_E2E_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
    reducedMotion: 'reduce', locale: 'ko-KR', ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [], offsite = [], asks = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (request.url() === server.baseURL + '/api/ask') asks.push(request); });
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.origin === server.baseURL) return route.continue();
    // Card art is intentionally irrelevant to these text-only user scenarios.
    if (route.request().resourceType() === 'image') return route.fulfill({ status: 204, body: '' });
    offsite.push(target.origin);
    return route.abort('blockedbyclient');
  });
  server.addCleanup(async () => {
    try {
      if (t.passed === false) {
        await fs.mkdir(results, { recursive: true });
        await page.screenshot({ path: path.join(results, `${t.name.slice(0, 2)}-failed.png`), fullPage: true }).catch(() => {});
      }
      assert.deepEqual(pageErrors, [], 'Unexpected page JavaScript error.');
      assert.deepEqual(offsite, [], 'The browser attempted an unmocked external request.');
    } finally { await context.close(); await browser.close(); }
  });
  return { server, page, asks, async open() { await page.goto(server.baseURL, { waitUntil: 'domcontentloaded' }); },
    async ready() { await page.waitForFunction(() => !document.querySelector('#submit-button').disabled); },
    async ask(text = question) { await page.locator('#question').fill(text); await page.locator('#submit-button').click(); },
  };
}
async function resultShown(page, status = 'ruling-generated') {
  await page.locator(`#answer-card[data-status="${status}"]`).waitFor({ state: 'visible' });
}
async function screenshot(page, name) {
  await fs.mkdir(results, { recursive: true });
  await page.screenshot({ path: path.join(results, name), fullPage: true });
}

test('01 데스크톱: 첫 화면과 빈 입력·공백 입력 보호', async t => {
  const app = await browserSession(t, []);
  await app.open(); await app.ready();
  assert.match(await app.page.title(), /리프트어시/);
  assert.equal(await app.page.locator('h1').isVisible(), true);
  assert.equal(await app.page.locator('#question').isVisible(), true);
  await app.page.locator('#submit-button').click();
  assert.equal(await app.page.locator('#question').evaluate(el => el.validity.valueMissing), true);
  await app.page.locator('#question').fill('   ');
  await app.page.locator('#submit-button').click();
  assert.equal(await app.page.locator('#question').evaluate(el => el === document.activeElement), true);
  assert.equal(app.asks.length, 0);
  assert.equal(app.server.externalCalls.length, 0);
  assert.equal(await app.page.locator('#answer-card').isVisible(), false);
});

test('02 데스크톱: 카드 Tab 선택 → 질문 → 처리 순서·접이식 근거 → 새 질문', async t => {
  const app = await browserSession(t, [{ ruling: answer() }]);
  await app.open(); await app.ready();
  await app.page.locator('#question').fill('유성');
  await app.page.locator('#card-options [role="option"]').first().waitFor({ state: 'visible' });
  await app.page.locator('#question').press('ArrowDown');
  await app.page.locator('#question').press('Tab');
  await app.page.locator('#selected-cards .selected-card').first().waitFor({ state: 'visible' });
  assert.equal(await app.page.locator('#question').evaluate(el => el === document.activeElement), true);
  await app.ask('유성으로 상대 유닛을 처치한 뒤 전장을 정복했습니다. ' + question);
  await resultShown(app.page);
  assert.equal(await app.page.locator('#answer-recommendation').innerText(), expected);
  assert.deepEqual(await app.page.locator('#resolution-steps li').allTextContents(), steps);
  const rule = app.page.locator('#evidence-list details').filter({ hasText: '472' }).first();
  assert.equal(await rule.evaluate(el => el.open), false);
  await rule.locator('summary').click();
  assert.equal(await rule.evaluate(el => el.open), true);
  assert.ok((await rule.innerText()).includes(fixture.rules.find(r => r.id === 'core-rules:472').officialTextKo));
  assert.ok(app.asks[0].postDataJSON().cardIds.includes('riftnaru:ogn-029'));
  await screenshot(app.page, 'desktop-answer.png');
  await app.page.locator('#clear-answer').click();
  assert.equal(await app.page.locator('#question').inputValue(), '');
  assert.equal(await app.page.locator('#answer-card').isVisible(), false);
  assert.equal(app.server.externalCalls.length, 1);
});

test('03 응답 지연·AI 오류: 진행 표시·중복 전송 방지 후 재시도', async t => {
  const app = await browserSession(t, [
    { delayMs: 1200, status: 429, error: { code: 'rate_limit_exceeded', message: 'Mock quota exceeded.' } },
    { ruling: answer() },
  ]);
  await app.open(); await app.ready(); await app.ask();
  await app.page.locator('#answer-progress').waitFor({ state: 'visible' });
  assert.equal(await app.page.locator('#submit-button').getAttribute('aria-busy'), 'true');
  assert.equal(await app.page.locator('#submit-button').isDisabled(), true);
  assert.match(await app.page.locator('#submit-button').innerText(), /검색 중/);
  assert.equal(await app.page.locator('.submit-spinner').isVisible(), true);
  const box = await app.page.locator('#submit-button').boundingBox();
  await app.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await resultShown(app.page, 'model-error');
  assert.equal(app.asks.length, 1);
  assert.equal(await app.page.locator('#submit-button').isEnabled(), true);
  assert.equal(await app.page.locator('#answer-progress').isVisible(), false);
  assert.match(await app.page.locator('#answer-status').innerText(), /AI 연결 오류/);
  await app.ask(); await resultShown(app.page);
  assert.equal(await app.page.locator('#answer-recommendation').innerText(), expected);
  assert.equal(app.server.externalCalls.length, 2);
});

test('04 초기 서버 연결 실패: 오류 안내를 표시하고 새로고침으로 회복', async t => {
  const app = await browserSession(t, [{ ruling: answer() }]);
  let first = true;
  await app.page.route('**/api/health', route => {
    if (first) { first = false; return route.abort('connectionfailed'); }
    return route.continue();
  });
  await app.open();
  await app.page.waitForFunction(() => /연결.*(?:실패|못)|서버.*(?:실패|못)/u.test(document.querySelector('.privacy-note').textContent));
  assert.equal(await app.page.locator('#submit-button').isDisabled(), true);
  assert.equal(app.server.externalCalls.length, 0);
  await app.page.reload(); await app.ready(); await app.ask(); await resultShown(app.page);
  assert.equal(await app.page.locator('#answer-recommendation').innerText(), expected);
});

test('05 모바일: 질문·답변 사용 및 HTTP 장애 후 재시도, 가로 넘침 없음', async t => {
  const app = await browserSession(t, [{ ruling: answer() }, { ruling: answer() }],
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await app.open(); await app.ready(); await app.ask(); await resultShown(app.page);
  assert.equal(await app.page.locator('#answer-recommendation').innerText(), expected);
  assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await screenshot(app.page, 'mobile-answer.png');
  await app.page.route('**/api/ask', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '서버가 잠시 응답하지 않습니다. 다시 시도해 주세요.' }) }), { times: 1 });
  await app.ask(); await resultShown(app.page, 'error');
  assert.match(await app.page.locator('#answer-recommendation').innerText(), /서버가 잠시/);
  assert.equal(await app.page.locator('#resolution-section').isVisible(), false);
  assert.equal(await app.page.locator('#evidence-list').innerText(), '');
  assert.equal(await app.page.locator('#submit-button').isEnabled(), true);
  await app.ask(); await resultShown(app.page);
  assert.equal(app.asks.length, 3);
  assert.equal(app.server.externalCalls.length, 2);
});
