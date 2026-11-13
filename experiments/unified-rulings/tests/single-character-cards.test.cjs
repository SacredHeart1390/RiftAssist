const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture,release,isolatedServer,syntheticPermittedCards}=require('./helpers/isolated-server.cjs');
const C=require(path.join(release,'src/cards'));
const {catalog}=require('./helpers/single-character-catalog.cjs');

test('one-character exceptions derive from champion identities, exact title delimiters and explicit aliases',()=>{
 const input=catalog();input.cards.find(c=>c.id==='future').aliases=['힌'];
 const c=C.normalizeCatalog(input),before=JSON.stringify(c);
 assert.deepEqual(C.singleCharacterNames(c),['멜','쉔','진','힌']);
 assert.deepEqual(C.searchCards(c,'쉔').map(c=>c.id).sort(),['shen-legend','shen-unit']);
 assert.equal(C.searchCards(c,'멜').length,2);assert.equal(C.searchCards(c,'힌')[0].id,'future');
 for(const q of ['가','나','쉔더','멜론의'])assert.equal(C.searchCards(c,q).length,0);
 assert.equal(C.searchCards(c,'아리')[0].id,'ahri');assert.equal(C.searchCards(c,'징크스')[0].id,'jinx');
 assert.equal(C.searchCards(c,'멜론')[0].id,'melon');assert.equal(JSON.stringify(c),before);
});
test('Korean particles have boundaries; explicit choice resolves ambiguity without 409',()=>{
 const c=C.normalizeCatalog(catalog());
 for(const q of ['쉔','쉔은 공격합니다','쉔이 공격합니다','상대 쉔에게 피해를 줍니다']){
  const r=C.resolveCards(c,['shen-unit'],q);assert.ok(r.selected.some(c=>c.id==='shen-unit'));assert.ok(r.references.length);
 }
 for(const q of ['쉔더','쉔은하','멜론'])assert.throws(()=>C.resolveCards(c,['shen-unit'],q),e=>e.statusCode===409);
 assert.equal(C.resolveCards(c,[],'쉔은 공격합니다').unresolved.length,2);
 assert.equal(C.resolveCards(c,[],'쉔은 공격합니다',[],['shen-unit']).selected.length,0);
});
test('search metadata uses the visible catalog; resolve preserves access restrictions',async t=>{
 const s=await isolatedServer(t,[],{cards:catalog()});
 assert.deepEqual((await s.request('/api/cards/search?browse=1')).body.singleCharacterNames,['멜','쉔','진']);
 const q=await s.request('/api/cards/search?q='+encodeURIComponent('쉔'));assert.equal(q.body.results.length,2);
 const r=await s.request('/api/cards/resolve',{method:'POST',body:{question:'쉔은 공격합니다',cardIds:['shen-unit']}});assert.equal(r.status,200);assert.equal(r.body.cards[0].id,'shen-unit');
 const hidden=await isolatedServer(t,[],{cards:catalog(),cardPolicy:'restricted'});
 const h=await hidden.request('/api/cards/search?q='+encodeURIComponent('쉔'));assert.deepEqual(h.body.singleCharacterNames,[]);assert.deepEqual(h.body.results,[]);
 const denied=await hidden.request('/api/cards/resolve',{method:'POST',body:{question:'쉔은 공격합니다',cardIds:['shen-unit']}});assert.equal(denied.body.restricted,true);assert.deepEqual(denied.body.cards,[]);
});
test('question submission accepts a selected single-character champion',async t=>{
 const ruling={recommendation:'Synthetic scoring answer.',resolutionSteps:['Synthetic step.'],reasoning:'Synthetic rule evidence.',confidence:'medium',evidenceAssessment:{status:'complete',queries:[],ruleIds:[]},followUpQuestions:[],citedRuleIds:['core-rules:472'],citedCaseIds:[],citedCardIds:['shen-unit'],caseTitles:[],caseComparisons:[],requiresJudge:false};
 const s=await isolatedServer(t,[{ruling}],{cards:catalog()});
 const r=await s.ask('쉔은 같은 턴 같은 전장에서 두 번 득점하나요?',['shen-unit']);
 assert.equal(r.status,200);assert.ok(r.body.cards.some(c=>c.id==='shen-unit'));assert.equal(r.body.ai.used,true);
});
