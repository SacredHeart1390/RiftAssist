const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {isolatedServer}=require('../helpers/isolated-server.cjs');
test('question form displays a Korean ban ruling and official source without an AI call',async t=>{
 const s=await isolatedServer(t,[]);
 const browser=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.goto(s.baseURL);
 await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
 await page.locator('#question').fill('한국 Standard에서 2026-11-23 공격 예고 금지인가요?');
 await page.locator('#submit-button').click();
 await page.locator('#answer-recommendation').getByText('금지 목록에 없음').waitFor();
 assert.match(await page.locator('#answer-notice a').first().getAttribute('href'),/^https:\/\/playriftbound\.com\//);
 assert.equal(s.externalCalls.length,0);
});
