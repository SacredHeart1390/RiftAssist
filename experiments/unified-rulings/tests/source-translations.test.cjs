const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {isolatedServer, release} = require('./helpers/isolated-server.cjs');
const {createSourceTranslations} = require(path.join(release,'src/source-translations.js'));

const title = {title:'합성 한국어 제목',question:'합성 질문',answer:'합성 답변',body:''};
const ruling = {
  recommendation:'한 턴에 각 전장에서는 한 번만 득점합니다.', reasoning:'472가 적용됩니다.',
  resolutionSteps:['전장과 현재 턴의 득점 여부를 확인합니다.'], confidence:'high',
  evidenceAssessment:{status:'complete',queries:[],ruleIds:[]}, followUpQuestions:[],
  citedRuleIds:['core-rules:472'], citedCaseIds:[], citedCardIds:[], caseTitles:[], caseComparisons:[], requiresJudge:false,
};
const cases = [1,2,3].map(id=>({
  id:String(id),url:`https://app.riftjudge.com/questions/${id}`, rulesVersion:'test',
  question:'Can the same battlefield be conquered and scored again in the same turn?',
  answer:'A player scores once per battlefield per turn. Already scored by holding or conquering.',
  bodyComplete:true, sourceAvailability:'available', status:'verified',
}));
const ask = '같은 턴에 같은 전장에서 다시 득점하나요?';
const translate = (s,a,i)=>s.request('/api/sources/translate',{method:'POST',body:{kind:'case',id:i.id,key:i.localization.key,requestId:a.requestId}});
const cache = s=>path.join(s.dataRoot,'knowledge','source-translations');

test('production-style preserved scope adds only local case translation with ownership, caching and no external search',async t=>{
  const s=await isolatedServer(t,[{ruling},{ruling:title}],{judgeCases:cases,preserveExistingImages:true,cardPolicy:'preserve-existing'});
  const h=(await s.request('/api/health')).body;
  assert.equal(h.features.sourceTranslations,false);
  assert.equal(h.features.riftJudgeCaseTranslations,true);
  assert.equal(h.riftJudgeSearchEnabled,false);
  assert.equal((await s.request('/api/sources/translate',{method:'POST',body:{kind:'rule',id:'test'}})).status,403);
  const a=(await s.ask(ask)).body;
  assert.equal(a.status,'ruling-generated');
  assert.ok(a.evidence.every(e=>!e.localization));
  assert.ok(a.judgeCases.length);
  const c=a.judgeCases[0];
  assert.match(c.localization.key,/^[0-9a-f]{64}$/);
  const other=(await s.request('/api/health',{cookie:''})).headers['set-cookie'][0].split(';')[0];
  assert.equal((await s.request('/api/sources/translate',{method:'POST',cookie:other,body:{kind:'case',id:c.id,key:c.localization.key,requestId:a.requestId}})).status,404);
  const first=await translate(s,a,c);
  assert.equal(first.status,200);assert.equal(first.body.translation.title,title.title);assert.equal(first.body.cached,false);
  const second=await translate(s,a,c);
  assert.equal(second.status,200);assert.equal(second.body.cached,true);
  assert.equal(s.externalCalls.length,2);
  assert.deepEqual(JSON.parse(s.externalCalls[1].input[1].content).cardNameGlossary,[]);
  assert.equal(s.judgeCalls.length,0);
  assert.equal(s.calls().filter(c=>c.kind==='translation').length,1);
});

test('missing text cannot get a key; a supplied excerpt keeps a key and excerpt notice',async t=>{
  const s=await isolatedServer(t,[]);
  const engine=createSourceTranslations({root:s.dataRoot,isEnabled:()=>true,getApiKey:()=>true});
  for(const field of ['question','answer']) assert.deepEqual(await engine.prepare('case',{...cases[0],[field]:' '}),{status:'translation_source_incomplete'});
  const item=await engine.prepare('case',{...cases[0],bodyComplete:false});
  assert.equal(item.excerpt,true);assert.match(item.key,/^[a-f0-9]{64}$/);
  assert.equal((await engine.prepare('case',cases[0])).key,item.key);
});

test('unwritable cache path is exposed as preparation failure and consumes no translation call',async t=>{
  const s=await isolatedServer(t,[{ruling}],{judgeCases:cases,preserveExistingImages:true,cardPolicy:'preserve-existing'});
  await fs.mkdir(path.dirname(cache(s)),{recursive:true});
  await fs.writeFile(cache(s),'synthetic cache path collision');
  const a=(await s.ask(ask)).body;
  assert.ok(a.judgeCases.length);
  assert.ok(a.judgeCases.every(c=>c.localization.status==='translation_prepare_failed'&&!c.localization.key));
  assert.equal(s.externalCalls.length,1);
});

test('errors are classified, detailed provider codes are private, and only a manual retry generates again',async t=>{
  const usage = {input_tokens:20,output_tokens:4096};
  const plans=[
    {status:401,error:{code:'invalid_api_key',message:'synthetic-secret'}},
    {status:429,error:{code:'rate_limit_exceeded'}},
    {status:500,error:{code:'server_error'}},
    {response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage}},
    {ruling:{...title,question:null}},
    {ruling:title},
  ];
  const s=await isolatedServer(t,[{ruling},...plans],{judgeCases:cases});
  const a=(await s.ask(ask)).body, c=a.judgeCases[0];
  const expected=[[503,'translation_authentication'],[429,'translation_busy'],[503,'translation_unavailable'],[503,'translation_incomplete'],[503,'translation_invalid_output']];
  for(const [status,code] of expected){
    const r=await translate(s,a,c);assert.equal(r.status,status);assert.equal(r.body.code,code);
    assert.doesNotMatch(JSON.stringify(r.body),/synthetic-secret|invalid_api_key|req_synthetic/);
  }
  assert.equal((await translate(s,a,c)).body.cached,false);
  assert.equal(s.externalCalls.length,1+plans.length);
  const calls=s.calls().filter(c=>c.kind==='translation');
  assert.deepEqual(calls.map(c=>c.error),['invalid_api_key','rate_limit_exceeded','server_error','translation_incomplete','translation_invalid_output',null]);
  assert.equal(calls[3].output_tokens,4096);
});

test('two distinct translations can run at once, a duplicate shares the result, and a third waits',async t=>{
  const s=await isolatedServer(t,[{ruling},...Array(2).fill({ruling:title,delayMs:500})],{judgeCases:cases});
  const a=(await s.ask(ask)).body;const [x,y,z]=a.judgeCases;
  const first=translate(s,a,x), dup=translate(s,a,x), second=translate(s,a,y);
  while(s.externalCalls.length<3)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await translate(s,a,z)).body.code,'translation_busy');
  for(const r of await Promise.all([first,dup,second]))assert.equal(r.status,200);
  assert.equal(s.calls().filter(c=>c.kind==='translation').length,2);
});

test('failed atomic cache replacement records usage and returns a safe cache error',async t=>{
  const s=await isolatedServer(t,[{ruling},{ruling:title,delayMs:500}],{judgeCases:cases});
  const a=(await s.ask(ask)).body,c=a.judgeCases[0],pending=translate(s,a,c);
  while(s.externalCalls.length<2)await new Promise(resolve=>setTimeout(resolve,20));
  const target=path.join(cache(s),c.localization.key+'.json');
  await fs.rename(target,target+'.previous-'+randomUUID());await fs.mkdir(target);
  assert.equal((await pending).body.code,'translation_cache_failed');
  assert.equal(s.calls().find(c=>c.kind==='translation').error,'translation_cache_failed');
  assert.ok(!(await fs.readdir(cache(s))).some(name=>name.endsWith('.tmp')));
});
