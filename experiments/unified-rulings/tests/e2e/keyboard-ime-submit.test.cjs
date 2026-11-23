const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {isolatedServer,syntheticPermittedCards}=require('../helpers/isolated-server.cjs');
const {catalog}=require('../helpers/single-character-catalog.cjs');
async function setup(t,width=1280){
 const data=catalog(),sample=data.cards[0];data.cards.push(...[
  ['teemo-tactician','티모 - 전략가','Teemo - Tactician'],['teemo-strategy','티모 - 전략의 달인','Teemo - Strategist']
 ].map(([id,nameKo,nameEn])=>({...sample,id,nameKo,nameEn,code:id,aliases:[],textEn:'Synthetic test effect.'})));
 const s=await isolatedServer(t,[],{cards:syntheticPermittedCards(data)});
 const browser=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined,args:['--no-proxy-server']});
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,serviceWorkers:'block'}),page=await context.newPage();
 s.addCleanup(async()=>{await context.close();await browser.close();});
 await context.route('**/*',r=>new URL(r.request().url()).origin===s.baseURL?r.continue():r.abort());
 await page.goto(s.baseURL);await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
 const input=page.locator('#question'),options=page.locator('#card-options .card-option'),selected=page.locator('#selected-cards .selected-card');
 async function query(value){await input.fill(value);await options.first().waitFor({state:'visible'});}
 return {s,browser,context,page,input,options,selected,query};
}
for(const width of [1280,390])test('one Tab replaces only the query and links hovered/arrow/English cards '+width,async t=>{
 const {s,page,input,options,selected,query}=await setup(t,width);
 await input.fill('먼저 티모-전 이후 질문');
 // Put the caret immediately after the partial card name, retaining text on both sides.
 await input.evaluate(el=>{const end=el.value.indexOf(' 이후');el.setSelectionRange(end,end);el.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));});
 await options.first().waitFor({state:'visible'});const hovered=options.filter({hasText:'티모 - 전략의 달인'});await hovered.hover();await input.press('Tab');
 await selected.waitFor({state:'visible'});assert.equal(await input.inputValue(),'먼저 티모 - 전략의 달인 이후 질문');assert.equal(await selected.getAttribute('data-card-id'),'teemo-strategy');
 await input.fill('티모-전');await options.first().waitFor({state:'visible'});await input.press('Tab');await selected.waitFor({state:'visible'});assert.equal(await input.inputValue(),'티모 - 전략가 ');
 await input.fill('티모');await options.first().waitFor({state:'visible'});await input.press('ArrowDown');const id=await page.locator('#card-options [aria-selected="true"]').getAttribute('id');const name=await page.locator('#'+id+' .card-option-copy strong').innerText();await input.press('Tab');await page.waitForFunction(name=>document.querySelector('#question').value.trim()===name,name);
 await page.locator('#language-select').selectOption('en');await query('Teemo-Tac');await input.press('Tab');await page.waitForFunction(()=>document.querySelector('#question').value==='Teemo - Tactician ');
 await page.locator('#language-select').selectOption('ko');
 for(const q of ['쉔','멜']){await query(q);await input.press('Tab');await selected.waitFor({state:'visible'});assert.ok((await input.inputValue()).startsWith(q));}
 await input.fill('');await query('쉔');await input.press('Tab');await selected.waitFor({state:'visible'});await input.press('End');await input.press(' ');
 await input.fill((await input.inputValue())+' 멜');await options.first().waitFor({state:'visible'});await input.press('Tab');await page.waitForFunction(()=>document.querySelectorAll('#selected-cards .selected-card').length===2);
 assert.equal(s.externalCalls.length,0);
});
test('Chromium composition commits before one-Tab insertion without duplicate Hangul',async t=>{
 const {s,page,input,options,selected}=await setup(t);await input.fill('티모-');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'전',selectionStart:1,selectionEnd:1});await options.first().waitFor({state:'visible'});
 await input.press('Tab');await selected.waitFor({state:'visible'});assert.equal(await input.inputValue(),'티모 - 전략가 ');assert.equal(await selected.getAttribute('data-card-id'),'teemo-tactician');
 await page.waitForTimeout(250);assert.equal(await input.inputValue(),'티모 - 전략가 ');assert.equal(await selected.count(),1);assert.equal(s.externalCalls.length,0);
});
test('Enter submits once; Shift+Enter is a newline; immediate Enter waits for card ID',async t=>{
 const {s,page,context,input,options,selected,query}=await setup(t);const submitted=[];let finish;
 await context.route('**/api/ask',async route=>{submitted.push(route.request().postDataJSON());await new Promise(r=>finish=r);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic test unavailable'})});});
 await query('티모-전');await input.press('Shift+Enter');assert.equal(await input.inputValue(),'티모-전\n');assert.equal(submitted.length,0);
 await query('티모-전');await context.route('**/api/cards/teemo-tactician',async route=>{await new Promise(r=>setTimeout(r,180));await route.continue();});
 await input.press('Tab');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#submit-button').disabled);await new Promise(r=>setTimeout(r,400));
 assert.equal(submitted.length,1);assert.deepEqual(submitted[0].cardIds,['teemo-tactician']);assert.equal(submitted[0].question,'티모 - 전략가');
 for(let i=0;i<4;i++)await input.press('Enter');assert.equal(submitted.length,1);finish();await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
 await input.fill('');await input.press('Enter');await page.waitForTimeout(100);assert.equal(submitted.length,1);assert.equal(s.externalCalls.length,0);
});
test('IME Enter orders, keyCode 229, and a subsequent physical Enter',async t=>{
 const {s,page,context,input}=await setup(t);let submits=0;
 await context.route('**/api/ask',r=>{submits++;return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic"}'});});
 await input.fill('합성 질문');await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(submits,0);
 await input.dispatchEvent('compositionend');await input.dispatchEvent('keydown',{key:'Enter',keyCode:13});await page.waitForTimeout(80);assert.equal(submits,0);
 await input.dispatchEvent('keyup',{key:'Enter'});await input.press('Enter');await page.waitForTimeout(150);assert.equal(submits,1);
 await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
 await input.dispatchEvent('keydown',{key:'Enter',keyCode:229});await page.waitForTimeout(80);assert.equal(submits,1);
 await input.press('Enter');await page.waitForTimeout(150);assert.equal(submits,2);assert.equal(s.externalCalls.length,0);
});
test('Escape, ordinary Tab/Shift+Tab, delayed selection cancellation, touch and bilingual hint',async t=>{
 const {s,page,context,input,options,selected,query}=await setup(t,390);
 await query('티모-전');assert.equal(await page.locator('#card-suggestion-status').innerText(),'↑↓ 후보 이동 · Tab 카드 선택 · Enter 검색 · Shift+Enter 줄바꿈');
 await input.press('Escape');assert.equal(await page.locator('#card-suggestions').isVisible(),false);await input.press('Tab');assert.equal(await page.locator('#submit-button').evaluate(el=>el===document.activeElement),true);
 await input.focus();await input.press('Shift+Tab');assert.equal(await input.evaluate(el=>el===document.activeElement),false);
 await query('티모-전');await input.press('Shift+Tab');assert.equal(await input.evaluate(el=>el===document.activeElement),false);
 await context.route('**/api/cards/teemo-tactician',async route=>{await new Promise(r=>setTimeout(r,180));await route.continue();});
 await query('티모-전');await input.press('Tab');await input.fill('붙여넣은 다른 질문');await page.waitForTimeout(350);assert.equal(await input.inputValue(),'붙여넣은 다른 질문');assert.equal(await selected.count(),0);
 await context.unroute('**/api/cards/teemo-tactician');await query('멜');await options.first().tap();await selected.waitFor({state:'visible'});
 await page.locator('#language-select').selectOption('en');await query('Teemo');assert.match(await page.locator('#card-suggestion-status').innerText(),/Tab select card · Enter search · Shift\+Enter newline/);
 assert.equal(s.externalCalls.length,0);
});

test('late native-commit event cannot overwrite a Tab insertion or duplicate its last syllable',async t=>{
 const {s,page,input,options,selected}=await setup(t);
 await input.fill('티모-전');await input.dispatchEvent('compositionstart');await options.first().waitFor({state:'visible'});
 // Reproduce a browser that emits compositionend/final input in a later task after blur.
 await input.evaluate(el=>el.addEventListener('blur',()=>setTimeout(()=>{el.value='티모-전';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'전'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'전'}));},20),{once:true}));
 await input.press('Tab');await selected.waitFor({state:'visible'});await page.waitForTimeout(150);
 assert.equal(await input.inputValue(),'티모 - 전략가 ');assert.equal(await selected.count(),1);assert.equal(await selected.getAttribute('data-card-id'),'teemo-tactician');assert.equal(s.externalCalls.length,0);
});
