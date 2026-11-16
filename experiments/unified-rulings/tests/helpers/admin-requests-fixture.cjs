const {fixture}=require('./admin-fixture.cjs');
function requestFixture(root){const f=fixture(root),{db,seal,now,start}=f,DAY=86400000;
 const answer={status:'ruling-generated',recommendation:'合成 답변 <script>window.__adminXss=1</script>',reasoning:'합성 판정 이유',resolutionSteps:['합성 처리 단계'],followUpQuestions:['합성 확인 질문'],citedRuleIds:['synthetic-rule'],cards:[{id:'test-card',nameKo:'합성 카드',textEn:'Synthetic effect only.',errata:[{text:'Synthetic erratum'}]}],evidence:[{id:'synthetic-rule',url:'https://example.invalid/rule',officialTextEn:'Synthetic rule excerpt.'},{id:'unsafe-url',url:'javascript:window.__adminXss=1'}],judgeCases:[{id:'synthetic-case',answer:'Synthetic case only.',url:'https://example.invalid/case'}],ai:{used:true,model:'synthetic-model'}};
 db.prepare('UPDATE requests SET question=?,response=?,trace=? WHERE id=?').run(seal('<img src=x onerror="window.__adminXss=1"> 합성 질문'),seal(answer),seal({aiUsed:true,inputTokens:100,outputTokens:20,aiModel:'synthetic-model',generationAttempts:[{callId:'call-1'}],cardReferences:[{id:'test-card'}],knowledgeReleaseId:'synthetic-release',providerResponseId:'must-not-expose-provider-id',retrievalTrace:{query:'must-not-expose-raw-trace'}}),'question-1');
 db.prepare('UPDATE requests SET response=?,trace=? WHERE id=?').run(seal({status:'server-error',error:'synthetic failure',ai:{used:false,error:'http_500'}}),seal({aiUsed:false,modelError:'http_500',generationAttempts:[{callId:'call-3',error:'http_500'}],blockedByEvidence:true}),'question-2');
 db.prepare('UPDATE requests SET response=? WHERE id=?').run(seal({status:'regional-ban',recommendation:'합성 지역별 판정',regionalBan:{region:'Korea',format:'Standard',date:'2026-11-23',ban:'not-banned'},sourceUrls:['https://example.invalid/official'],ai:{used:false}}),'question-3');
 db.prepare('UPDATE requests SET question=?,response=?,trace=? WHERE id=?').run(seal('FORBIDDEN_EXPIRED_BODY'),seal({recommendation:'FORBIDDEN_EXPIRED_ANSWER'}),seal({aiUsed:false,cardReferences:[{id:'old-card'}],retrievalTrace:{query:'FORBIDDEN_EXPIRED_TRACE'},generationAttempts:[{assessment:{queries:['FORBIDDEN_EXPIRED_ASSESSMENT']}}]}),'question-expired');
 f.add('unlinked-call',now-1000,'ruling-generated',{aiUsed:true});
 f.add('local-rejected',now-2000,'failed',{aiUsed:false,generationAttempts:[{callId:'call-local',error:'input_budget_exceeded'}]});
 f.add('foreign-call',now-3000,'failed',{aiUsed:false,generationAttempts:[{callId:'foreign-call-id',error:'http_500'}]});
 db.prepare('INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?)').run('foreign-call-id','different-owner','2026-11-16','answer',now,now,900,900,null);
 f.add('body-before-cutoff',now-7*DAY-1,'ruling-generated');f.add('body-after-cutoff',now-7*DAY+1,'ruling-generated');
 for(let i=0;i<25;i++)f.add('page-'+String(i).padStart(2,'0'),now-10000-i,'ruling-generated');
 return {...f,answer};}
module.exports={requestFixture};
