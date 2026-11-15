const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{chromium}=require('playwright');
const {fixture}=require('../helpers/admin-fixture.cjs');
const {openStore}=require('../../admin-web/store.cjs');
const {createAdmin}=require('../../admin-web/server.cjs');
for(const width of [1280,390])test(`admin login, metrics, filters, report detail, read-only layout ${width}px`,async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'riftassist-admin-ui-')),f=fixture(root),secret='c'.repeat(64);
 const app=createAdmin({root,secret,store:openStore(root,()=>f.now),now:()=>f.now,health:async()=>({ok:true,version:'0.2.8',environment:'production',providerMode:'live',model:'gpt-6-luna',cardCatalog:{total:1527}})});
 app.listen(0,'127.0.0.1');await once(app,'listening');const browser=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined,args:['--no-proxy-server']});
 t.after(async()=>{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));f.db.close();const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('riftassist-admin-ui-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const page=await browser.newPage({viewport:{width,height:900}});await page.clock.install({time:f.now});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+app.address().port);await page.locator('#password').fill(secret);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('main').waitFor({state:'visible'});await page.locator('#metrics').getByText('신규 접속 세션').waitFor();
 assert.match(await page.locator('#state').innerText(),/0.2.8.*production\/live.*gpt-6-luna/);
 await page.locator('#reports .report').filter({hasText:'report-1'}).click();await page.locator('#detail').getByText('합성 사용자 제보',{exact:true}).waitFor();assert.match(await page.locator('#detail').innerText(),/합성 질문/);assert.match(await page.locator('#detail').innerText(),/합성 답변/);
 await page.locator('#report-status').selectOption('resolved');await page.locator('#reports-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#reports .report').length===1);assert.match(await page.locator('#reports').innerText(),/report-linked/);
 await page.locator('#range').selectOption('7');await page.locator('#usage-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#usage tr').length===7);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await page.getByRole('button',{name:/서버 중지|배포|DB 복원|모델 변경/}).count(),0);assert.deepEqual(errors,[]);
 const out=process.env.RIFTASSI_ADMIN_SCREENSHOTS;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`admin-synthetic-${width}.png`),fullPage:true});}
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});assert.equal((await page.request.get('http://127.0.0.1:'+app.address().port+'/api/reports')).status(),401);
});


