const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {isolatedServer}=require('../helpers/isolated-server.cjs');
const {catalog}=require('../helpers/single-character-catalog.cjs');
for(const width of [1280,390])test(`single-character autocomplete IME selection and unlink at ${width}px`,async t=>{
 const s=await isolatedServer(t,[],{cards:catalog()});
 const browser=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined,args:['--no-proxy-server']});
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});const page=await context.newPage();
 s.addCleanup(async()=>{await context.close();await browser.close();});
 const queries=[];page.on('request',r=>{if(r.url().includes('/api/cards/search?q='))queries.push(new URL(r.url()).searchParams.get('q'));});
 await context.route('**/*',route=>new URL(route.request().url()).origin===s.baseURL?route.continue():route.abort());
 await page.goto(s.baseURL);await page.waitForFunction(()=>!document.querySelector('#card-catalog-note').hidden);
 const input=page.locator('#question');await input.fill('가');await page.waitForTimeout(350);assert.equal(queries.length,0);
 for(const q of ['쉔','멜','아리','징크스']){
  await input.fill(q);await page.locator('#card-options .card-option').first().waitFor({state:'visible'});
  assert.ok((await page.locator('#card-options').innerText()).includes(q));
 }
 await input.fill('쉔더');await page.waitForTimeout(350);assert.equal(await page.locator('#card-suggestions').isVisible(),false);
 await input.fill('');await input.dispatchEvent('compositionstart');await input.fill('쉔');
 await page.locator('#card-options .card-option').first().waitFor({state:'visible'});
 await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});assert.equal(await page.locator('#selected-cards .selected-card').count(),0);
 await input.dispatchEvent('compositionend');await input.press('ArrowDown');await input.press('Tab');
 await page.locator('#selected-cards .selected-card').waitFor({state:'visible'});
 const id=await page.locator('#selected-cards .selected-card').getAttribute('data-card-id');
 const r=await s.request('/api/cards/resolve',{method:'POST',body:{question:await input.inputValue(),cardIds:[id]}});assert.equal(r.status,200);assert.ok(r.body.cards.some(c=>c.id===id));
 await page.locator('.unlink-card').click();assert.equal(await page.locator('#selected-cards .selected-card').count(),0);
 await input.fill('멜');await page.locator('#card-options .card-option').first().click();await page.locator('#selected-cards .selected-card').waitFor({state:'visible'});
 await page.locator('#language-select').selectOption('en');assert.match(await page.locator('#card-catalog-note').innerText(),/single-character Korean champion/i);
 assert.equal(s.externalCalls.length,0);
});
