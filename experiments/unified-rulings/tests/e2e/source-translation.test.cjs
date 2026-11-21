const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {release} = require('../helpers/isolated-server.cjs');

for (const width of [390,1280]) test(`RiftJudge translation handles retry, excerpt, cache and language at ${width}px`,async t=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.RIFTASSI_E2E_EXECUTABLE_PATH||undefined,args:['--no-proxy-server']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width,height:800}});
  const origin='https://riftassist.test';
  const script=fs.readFileSync(path.join(release,'public/evidence-view.js'),'utf8');
  await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main id="cases"></main><section id="rules"></section>'}));
  const payload={title:'합성 제목',question:'합성 질문',answer:'합성 답변…',body:''};
  let calls=0;
  await page.route(origin+'/api/sources/translate',route=>{
    calls++;
    const body=route.request().postDataJSON();
    assert.equal(body.id,'1');
    return route.fulfill(calls===1?{status:503,json:{code:'translation_unavailable'}}:{json:{translation:payload}});
  });
  await page.goto(origin);
  await page.addScriptTag({content:script});
  await page.evaluate(()=>{
    window.syntheticCases=[
      {id:'1',requestId:'synthetic',url:'https://app.riftjudge.com/questions/1',status:'verified',
       rulesVersion:'1.5',question:'Original question',answer:'Original answer…',bodyComplete:false,
       localization:{key:'a'.repeat(64),excerpt:true,status:'pending'}},
      {id:'2',requestId:'synthetic',url:'https://app.riftjudge.com/questions/2',status:'verified',
       bodyComplete:false,localization:{status:'translation_source_incomplete'}},
    ];
    window.renderSynthetic=language=>window.EvidenceView.renderCases(document.querySelector('#cases'),window.syntheticCases,[],[],language,'Empty');
    window.renderSynthetic('ko');
    window.EvidenceView.renderRules(document.querySelector('#rules'),[{id:'test',officialTextKo:'합성 공식 한국어'}],[],'ko','Empty');
  });
  await page.locator('#cases summary').first().click();
  const retry=page.getByRole('button',{name:'번역 다시 시도'});
  await retry.waitFor();assert.equal(calls,1);
  await retry.click();
  await page.getByText('합성 답변…',{exact:true}).waitFor();
  await page.getByText('저징 사례 - 합성 제목',{exact:true}).waitFor();
  assert.equal(await page.locator('#cases a').first().getAttribute('href'),'https://app.riftjudge.com/questions/1');
  assert.match(await page.locator('#cases details').first().innerText(),/확보한 원문 일부.*전체 내용/);
  await page.locator('#cases summary').nth(1).click();
  await page.getByText(/질문이나 답변이 누락/).waitFor();assert.equal(await retry.count(),0);
  await page.locator('#rules summary').click();await page.getByText('합성 공식 한국어',{exact:true}).waitFor();
  await page.evaluate(()=>window.renderSynthetic('en'));
  await page.locator('#cases summary').first().click();
  await page.getByText('Original answer…',{exact:true}).waitFor();
  await page.evaluate(()=>window.renderSynthetic('ko'));
  await page.locator('#cases summary').first().click();
  await page.getByText('합성 답변…',{exact:true}).waitFor();
  assert.equal(calls,2);
});
