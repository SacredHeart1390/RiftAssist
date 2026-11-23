const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {isolatedServer,fixture,syntheticPermittedCards}=require('../helpers/isolated-server.cjs');
const {rules,costCard,choiceCard}=require('../helpers/play-cost-fixture.cjs');
for(const width of [1280,390])test(`play procedures show the supported ruling and exact official references at ${width}px`,async t=>{
 const ruling={recommendation:'각 플레이어가 처리 중 자기 유닛을 선택하고 지시에 따른 행동을 수행합니다.',reasoning:'공동 선택은 미리 지정하는 대상과 다릅니다. 행동을 수행한 플레이어가 그 행동을 책임집니다.',resolutionSteps:['효과 처리 중 각 플레이어가 지시에 맞는 유닛을 고릅니다.','공식 절차에 따라 각자의 행동을 처리하고 이후 유발 스킬을 확인합니다.'],confidence:'medium',evidenceAssessment:{status:'complete',queries:[],ruleIds:[]},followUpQuestions:[],citedRuleIds:['355.10.e','412.1'],citedCaseIds:[],citedCardIds:[choiceCard.id],caseTitles:[],caseComparisons:[],requiresJudge:false};
 const s=await isolatedServer(t,[{ruling}],{rules,cards:syntheticPermittedCards({...fixture.cards,cards:[costCard,choiceCard]})});
 const b=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined});s.addCleanup(()=>b.close());
 const context=await b.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===s.baseURL?r.continue():r.abort());
 const page=await context.newPage();await page.goto(s.baseURL);await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled&&!document.querySelector('#card-catalog-note').hidden);
 await page.locator('#question').fill(choiceCard.nameKo);await page.locator('.card-option').first().waitFor();await page.locator('#question').press('ArrowDown');await page.locator('#question').press('Tab');await page.locator('.selected-card').waitFor();await page.locator('#question').fill(choiceCard.nameKo+'의 처치 행동은 누가 선택하고 책임지나요?');await page.locator('#submit-button').click();
 await page.waitForFunction(()=>document.querySelector('#answer-recommendation')?.textContent.includes('각 플레이어'));
 assert.equal(await page.locator('#answer-recommendation').innerText(),ruling.recommendation);assert.equal(await page.locator('#resolution-steps li').count(),2);
 await page.locator('#language-select').selectOption('en');await page.locator('#official-rules > summary').click();const item=page.locator('#evidence-list details').filter({hasText:'355.10.e'}).first();await item.locator('summary').click();assert.match(await item.innerText(),/chosen|targets/);
 assert.equal(s.externalCalls.length,1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
