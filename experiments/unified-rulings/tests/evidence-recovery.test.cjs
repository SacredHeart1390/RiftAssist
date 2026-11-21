const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isolatedServer, fixture, release, syntheticPermittedCards } = require('./helpers/isolated-server.cjs');
const { buildIndex, search, resolveRuleReference } = require(path.join(release,'src/retrieval.js'));
const { recoveryRequest } = require(path.join(release,'src/answer-quality.js'));

const clauses = {
  '422.1':'Hiding a card places it facedown at a battlefield you control.',
  '422.3':'Facedown cards have gameplay properties and permissions defined by the effect that put them there.',
  '811.1.b':'On your turn during an Open State, pay [A] to hide a card in your hand or Champion Zone at a controlled field with an empty slot. Beginning on the next turn, it gains Reaction and can be played ignoring its base cost.',
  '811.1.c.1':'Hide is not a subset of Play.',
  '811.1.c.2':'Hiding a card does not open a chain.',
  '135.2.e.5.a':'A cost of [A] can be paid by Power of any Domain.',
  '163.1':'Energy is used to pay numeric Energy costs.',
  '163.2':'Power is used to pay Domain-associated Power Costs.',
  '166.1':"Energy or Power that a card adds goes to the controlling player's Rune Pool.",
  '430.2':'Activated and triggered abilities that Add resources finalize immediately and resolve as soon as finalized.',
  '445.2.c':'Players may activate abilities that Add resources with the Reaction keyword when instructed to Pay resources.',
  '356.1.b.3':'Additional costs and cost increases may raise the total cost even when the base cost is ignored.',
};
const rules = [...fixture.rules,...Object.entries(clauses).map(([n,text])=>({
  ...fixture.rules.find(r=>r.id==='core-rules:472'),id:'core-rules:'+n,ruleId:n,officialTextEn:text,officialTextKo:'',
}))];
const base=fixture.cards.cards[0];
const cards = [
  {...base,id:'fixture-seal',code:'SFD-229',nameKo:'통찰의 인장',nameEn:'Seal of Insight',aliases:[],type:'장비',textEn:'[Exhaust]: Reaction — Add [Mind power].',textKo:'소진: 반응 — 정신의 힘 1 추가.'},
  {...base,id:'fixture-teemo',code:'OGN-121',nameKo:'티모 - 전략가',nameEn:'Teemo - Strategist',aliases:[],type:'유닛',textEn:'[Hidden]. When I defend, reveal cards and deal damage for each revealed Hidden card.',textKo:'숨겨짐. 방어할 때 카드 공개 및 피해.'},
].map(c=>({...c,modelReady:true}));
const catalog=syntheticPermittedCards({...fixture.cards,cards});
const ko='통찰의 인장으로 얻은 힘을 티모 - 전략가의 숨기기 비용에 사용할 수 있나요?';
const en='Can I use the power added by Seal of Insight to pay the Hidden cost of Teemo - Strategist?';
const ruling = {
  recommendation:'Yes. Mind Power pays the one Power of any domain required to hide it, if you can take the Hide action.',
  reasoning:'The ability adds Mind Power. Hide spends [A]. Energy does not pay that Power cost.',
  confidence:'medium', resolutionSteps:['Activate the ready Seal and add one Mind Power.','Pay [A] and place the Hidden card facedown if the Hide conditions are met.','On a later turn, play it at the appropriate Reaction timing.'],
  evidenceAssessment:{status:'complete',queries:[],ruleIds:[]}, followUpQuestions:[],
  citedRuleIds:['811.1.b','135.2.e.5.a','445.2.c'], citedCaseIds:[], citedCardIds:cards.map(c=>c.id),
  caseTitles:[], caseComparisons:[], requiresJudge:false,
};
const ask=(s,question,language,cardIds=cards.map(c=>c.id))=>s.request('/api/ask',{method:'POST',body:{question,language,cardIds,clientKey:randomUUID()}});

test('Hidden-payment search pins the governing clauses without treating an unrelated defend trigger as the question',()=>{
  for (const q of [ko,en,'Can Energy pay the normal Hidden cost?','숨기기 비용은 힘으로 지불하나요?']){
    const found=search(buildIndex(rules),q,cards);
    assert.equal(found.intent.hideCost,true);
    assert.equal(found.intent.cleanup,false);
    assert.deepEqual(found.trace.missingRequired,[]);
    for(const id of ['811.1.b','135.2.e.5.a','163.1','163.2','445.2.c','356.1.b.3'])assert.ok(found.trace.requiredRuleIds.includes('core-rules:'+id),id);
  }
  const repair=search(buildIndex(rules),ko,cards,{repair:true,queries:['Viktor trigger damage while timing chain'],ruleIds:['811.1.b']});
  assert.equal(repair.intent.hideCost,true);
  assert.equal(repair.intent.cleanup,false);
  assert.ok(!repair.trace.requiredRuleIds.includes('core-rules:418.1.b'));
});

test('two-card answer accepts unambiguous official rule numbers and an already-covered self-assessment',async t=>{
  const draft={...ruling,evidenceAssessment:{status:'missing-rule',ruleIds:['811.1.b','135.2.e.5.a'],queries:[]}};
  const s=await isolatedServer(t,[{ruling:draft},{ruling}],{rules,cards:catalog});
  for(const [q,lang] of [[ko,'ko'],[en,'en']]){
    const r=await ask(s,q,lang);assert.equal(r.body.status,'ruling-generated');
    assert.equal(r.body.ai.used,true);assert.deepEqual(r.body.citedRuleIds,ruling.citedRuleIds.map(x=>'core-rules:'+x));assert.equal(r.body.resolutionSteps.length,3);
    const trace=await s.trace(r.body.requestId);
    assert.equal(trace.generationAttempts.length,1);
    assert.deepEqual(trace.generationAttempts[0].citedRuleIds,r.body.citedRuleIds);
    assert.ok(trace.generationAttempts[0].evidenceIds.includes('core-rules:811.1.b'));
  }
  assert.equal(s.externalCalls.length,2);
});

test('a truly missing Hidden definition blocks generation and identifies the missing rule',async t=>{
  const s=await isolatedServer(t,[],{rules:rules.filter(r=>r.id!=='core-rules:811.1.b'),cards:catalog});
  const r=await ask(s,en,'en');assert.equal(r.body.status,'insufficient-evidence');
  assert.equal(s.externalCalls.length,0);
  assert.match(r.body.reasoning,/811\.1\.b/);
});

test('targeted recovery adds an available rule omitted from the first model input', async t => {
  const extraRule = {...rules[0],id:'core-rules:998.99',ruleId:'998.99',officialTextEn:'A puzzle symbol designates its unique emblem.',officialTextKo:''};
  const draft = {...ruling,evidenceAssessment:{status:'missing-rule',ruleIds:['998.99'],queries:['puzzle symbol emblem']}};
  const recovered = {...ruling,citedRuleIds:[...ruling.citedRuleIds,'998.99']};
  const initialRules = [...rules,...Array.from({length:24},(_,i)=>({...rules[0],id:`core-rules:997.${i}`,ruleId:`997.${i}`,officialTextEn:'Pay energy costs with the rune pool. Hide a Hidden card with Power.',officialTextKo:''})),extraRule];
  const s = await isolatedServer(t,[{ruling:draft},{ruling:recovered}],{rules:initialRules,cards:catalog});
  const r = await ask(s,en,'en');
  assert.equal(r.body.status,'ruling-generated');
  const trace = await s.trace(r.body.requestId);
  assert.equal(trace.generationAttempts.length,2);
  assert.equal(trace.generationAttempts[0].evidenceIds.includes(extraRule.id),false);
  assert.ok(trace.generationAttempts[1].evidenceIds.includes(extraRule.id));
  assert.ok(r.body.citedRuleIds.includes(extraRule.id));
  assert.equal(s.externalCalls.length,2);
});

test('ambiguous bare numbers and nonexistent or unsupplied references cannot become citations',()=>{
  const evidence=[{id:'core-rules:472',ruleId:'472'},{id:'tournament-rules:472',ruleId:'472'}];
  assert.equal(resolveRuleReference('472',evidence),null);
  assert.equal(resolveRuleReference('core-rules:472',evidence),'core-rules:472');
  assert.equal(resolveRuleReference('core-rules:999',evidence),null);
  assert.equal(resolveRuleReference('472',evidence.slice(0,1)),'core-rules:472');
});

test('already supplied reference cannot excuse unsupported output, missing facts, or conflicting sources',()=>{
  const context={evidence:rules,requiredRuleIds:['core-rules:811.1.b']};
  const valid={...ruling,citedRuleIds:['core-rules:811.1.b','core-rules:135.2.e.5.a']};
  const assessment={status:'missing-rule',ruleIds:['811.1.b'],queries:[]};
  assert.equal(recoveryRequest({...valid,evidenceAssessment:assessment},context),null);
  assert.equal(recoveryRequest({...valid,evidenceAssessment:assessment,recommendation:'The provided material is not enough evidence.',confidence:'insufficient'},context)?.reason,'missing-rule');
  assert.equal(recoveryRequest({...valid,evidenceAssessment:{...assessment,ruleIds:['999']}},context)?.reason,'missing-rule');
  assert.equal(recoveryRequest({...valid,evidenceAssessment:{...assessment,status:'source-conflict'}},context)?.reason,'source-conflict');
  assert.equal(recoveryRequest({...valid,evidenceAssessment:{status:'missing-fact'},followUpQuestions:['Is the facedown slot empty?']},context),null);
  assert.equal(recoveryRequest({...valid,resolutionSteps:[]},context)?.reason,'missing-steps');
});
