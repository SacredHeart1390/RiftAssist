const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {isolatedServer,fixture,release,syntheticPermittedCards}=require('./helpers/isolated-server.cjs');
const {buildIndex,search}=require(path.join(release,'src/retrieval'));
const {rules,costCard,choiceCard,costIds,choiceIds,clauses,template}=require('./helpers/play-cost-fixture.cjs');
const ask=(s,q,card,lang='en')=>s.request('/api/ask',{method:'POST',body:{question:q,language:lang,cardIds:[card.id],clientKey:randomUUID()}});
const qs={cost:['Can I kill the entering Test Offering Unit to satisfy its own friendly-unit requirement?','시험 공물 유닛을 내면서 아군 유닛 처치에 막 들어올 그 유닛을 사용할 수 있나요?'],choice:['Who chooses and performs the deaths for Test Shared Choice?','시험 공동 선택에서 각 플레이어의 유닛은 누가 선택해서 처치하나요?']};
function assertPinned(found,ids){assert.deepEqual(found.trace.missingRequired,[]);for(const id of ids)assert.ok(found.trace.requiredRuleIds.includes('core-rules:'+id),id);}

test('nonstandard costs retrieve payment, mandatory/optional distinction and entry before generation in both languages',()=>{
 for(const q of qs.cost)assertPinned(search(buildIndex(rules),q,[costCard]),costIds);
});
test('shared player choices retrieve non-targeting and responsibility without an exact card-name rule',()=>{
 for(const q of qs.choice)assertPinned(search(buildIndex(rules),q,[choiceCard]),choiceIds);
 const unrelated={...choiceCard,textEn:'Each player draws one card.'};
 assert.equal(search(buildIndex(rules),'How many cards are drawn?',[unrelated]).intent.sharedChoice,false);
 assert.equal(search(buildIndex(rules),'How does this work?',[{...costCard,modelReady:false}]).intent.nonStandardCost,false);
});
test('changed or ambiguous governing meanings fail closed; a unique renumbering remains supported',()=>{
 const changed=rules.map(r=>r.id==='core-rules:357.2'?{...r,officialTextEn:'New unrelated instruction.'}:r);
 assert.ok(search(buildIndex(changed),qs.cost[0],[costCard]).trace.missingRequired.includes('unresolved-current-rule:357.2'));
 const renamed=rules.map(r=>r.id==='core-rules:357.2'?{...r,id:'core-rules:997.2',ruleId:'997.2'}:r);
 assert.ok(search(buildIndex(renamed),qs.cost[0],[costCard]).trace.requiredRuleIds.includes('core-rules:997.2'));
 const ambiguous=[...rules.filter(r=>r.id!=='core-rules:357.2'),...['997.2','998.2'].map(id=>({...template,id:'core-rules:'+id,ruleId:id,officialTextEn:clauses['357.2']}))];
 assert.ok(search(buildIndex(ambiguous),qs.cost[0],[costCard]).trace.missingRequired.includes('unresolved-current-rule:357.2'));
});
for(const [name,card,ids,questions] of [['cost',costCard,costIds,qs.cost],['choice',choiceCard,choiceIds,qs.choice]]){
 test(name+' supported answers reach the browser contract with exact citations, concrete steps and one model request',async t=>{
  const cited=name==='cost'?['354','357.2','359.2.c','358.2']:choiceIds;
  const ruling={recommendation:name==='cost'?'No. Pay using a suitable unit already on the Board before the new unit enters.':'Each player chooses a unit they control as the effect resolves and performs their own instructed action.',reasoning:'Apply the supplied general procedure to the permitted synthetic card wording.',resolutionSteps:['Apply the supplied choices and payment procedure.','Finish the supported action and update the Board.'],confidence:'high',evidenceAssessment:{status:'complete',queries:[],ruleIds:[]},followUpQuestions:[],citedRuleIds:cited,citedCaseIds:[],citedCardIds:[card.id],caseTitles:[],caseComparisons:[],requiresJudge:false};
  const s=await isolatedServer(t,questions.map(()=>({ruling})),{rules,cards:syntheticPermittedCards({...fixture.cards,cards:[card]})});
  for(const [i,q]of questions.entries()){const r=await ask(s,q,card,i?'ko':'en');assert.equal(r.body.status,'ruling-generated');const trace=await s.trace(r.body.requestId);assert.equal(trace.generationAttempts.length,1);for(const id of ids)assert.ok(trace.generationAttempts[0].evidenceIds.includes('core-rules:'+id),id);assert.ok(r.body.resolutionSteps.length);}
  assert.equal(s.externalCalls.length,2);
 });
 test(name+' missing governing source blocks paid generation instead of accepting a guessed answer',async t=>{
  const missing=name==='cost'?'357.2':'355.10.e';
  const s=await isolatedServer(t,[],{rules:rules.filter(r=>r.id!=='core-rules:'+missing),cards:syntheticPermittedCards({...fixture.cards,cards:[card]})});
  const r=await ask(s,questions[0],card);assert.equal(r.body.status,'insufficient-evidence');assert.equal(s.externalCalls.length,0);assert.ok(r.body.reasoning.includes(missing));
 });
}
